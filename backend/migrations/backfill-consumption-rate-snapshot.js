// Backfill AccessoryConsumption.rateSnapshot — the frozen accessory rate costing needs.
//
// WHY: costingService used to read the rate straight off the AccessoryItem master, so
// editing an item's rate silently re-priced every historical lot on the costing board.
// New rows freeze the rate at consumption time (accessoryService.replaceConsumption /
// replaceFinishingConsumption). This migration gives the EXISTING rows the best historical
// rate we can actually justify:
//
//   1. Preferred — the latest AccessoryPurchase line for that item dated on or before the
//      consumption date. That is the real price in force when the item was consumed.
//   2. Fallback  — the current master rate, flagged in the report. Unavoidable when the
//      item has never been purchased in the system (e.g. opening-stock-only items); it
//      reproduces exactly what costing shows today, so nothing regresses.
//
// A row whose rate cannot be determined either way is left untouched (null) and listed.
//
// Idempotent: only touches rows where rateSnapshot is missing or null.
//
// Run from backend/ (pass the URI as an argument, or set MONGO_URI):
//   node migrations/backfill-consumption-rate-snapshot.js --dry-run   (report only)
//   node migrations/backfill-consumption-rate-snapshot.js "mongodb://.../db?..."
//   node migrations/backfill-consumption-rate-snapshot.js             (uses MONGO_URI)

const mongoose = require('mongoose');
const { AccessoryConsumption, AccessoryItem, AccessoryPurchase } = require('../mongodb_schema');

// Latest purchase rate at or before the consumption date. A row with no date at all falls
// back to the earliest known purchase rate — still better than the live master.
// Pure + exported so the date walk can be unit-tested without a database.
const rateInForce = (history, itemId, at) => {
  const list = history.get(itemId);
  if (!list || list.length === 0) return null;
  const when = at ? new Date(at).getTime() : null;
  if (when === null || Number.isNaN(when)) return list[0].rate;
  let found = null;
  for (const h of list) {
    const t = h.date?.getTime();
    if (t !== undefined && t !== null && t <= when) found = h.rate;
    else if (found !== null) break;
  }
  return found;
};

module.exports = { rateInForce };

const run = async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  const uri = (args[0]) || process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI. Pass it as an argument or set the env var.');
    process.exit(1);
  }

  // Mask credentials in any logged connection string.
  console.log(`Connecting to ${uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')} ...`);
  await mongoose.connect(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 10000 });

  try {
    const pending = await AccessoryConsumption.find(
      { $or: [{ rateSnapshot: { $exists: false } }, { rateSnapshot: null }] },
      '_id accessoryItemId lotId date createdAt qty'
    ).lean();

    console.log(`${pending.length} consumption row(s) without a rateSnapshot${dryRun ? ' (dry run)' : ''}.`);
    if (pending.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    const itemIds = [...new Set(pending.map(r => String(r.accessoryItemId)).filter(Boolean))];

    const [items, purchases] = await Promise.all([
      AccessoryItem.find({ _id: { $in: itemIds } }, 'name rate').lean(),
      // One pass over every purchase carrying a line for one of these items; only the
      // needed sub-fields are projected so the per-item walk below stays in memory.
      AccessoryPurchase.find(
        { 'lines.accessoryItemId': { $in: itemIds } },
        'date lines.accessoryItemId lines.rate'
      ).lean(),
    ]);

    const itemById = new Map(items.map(i => [String(i._id), i]));
    // history[itemId] = [{ date, rate }] sorted oldest first
    const history = new Map();
    for (const p of purchases) {
      for (const line of (p.lines || [])) {
        const key = String(line.accessoryItemId);
        if (!history.has(key)) history.set(key, []);
        history.get(key).push({ date: p.date ? new Date(p.date) : null, rate: Number(line.rate) || 0 });
      }
    }
    for (const list of history.values()) {
      list.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    }

    // Latest purchase rate at or before the consumption date — the hoisted, unit-tested
    // helper; a row with no date falls back to the earliest known purchase rate.
    const rateFor = (itemId, at) => rateInForce(history, itemId, at);

    const ops = [];
    const fromHistory = [];
    const fromMaster = [];
    const undetermined = [];

    for (const row of pending) {
      const itemId = String(row.accessoryItemId || '');
      const item = itemById.get(itemId);
      const at = row.date || row.createdAt;
      const historical = itemId ? rateFor(itemId, at) : null;

      let rate = historical;
      const source = (rate === null || rate === undefined) ? 'master' : 'purchase';
      if (source === 'master') {
        if (!item || item.rate === undefined || item.rate === null) {
          undetermined.push(row);
          continue;
        }
        rate = Number(item.rate) || 0;
        fromMaster.push({ name: item.name, rate, rowId: row._id });
      } else {
        fromHistory.push({ name: item?.name || '(item missing)', rate, rowId: row._id });
      }

      ops.push({
        updateOne: { filter: { _id: row._id }, update: { $set: { rateSnapshot: rate } } },
      });
    }

    console.log(`  ${fromHistory.length} from purchase history (the real price in force)`);
    console.log(`  ${fromMaster.length} from the CURRENT master rate (no purchase on/before the date)`);
    console.log(`  ${undetermined.length} undetermined (item missing / no rate) — left null`);

    if (dryRun) {
      console.log('\nSample — purchase-derived:');
      for (const s of fromHistory.slice(0, 10)) console.log(`  ${s.name} | rate ${s.rate}`);
      console.log('Sample — master-fallback:');
      for (const s of fromMaster.slice(0, 10)) console.log(`  ${s.name} | rate ${s.rate}`);
      if (undetermined.length) {
        console.log('\nUndetermined row ids:');
        for (const r of undetermined.slice(0, 20)) console.log(`  ${r._id} (item ${r.accessoryItemId})`);
      }
      console.log('\nDRY RUN — nothing written. Re-run without --dry-run to apply.');
      return;
    }

    const res = await AccessoryConsumption.bulkWrite(ops, { ordered: false });
    console.log(`\nrateSnapshot written on ${res.modifiedCount} row(s).`);
    console.log('Backfill complete.');
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

// Run only when invoked directly, so the helper above stays importable for tests.
if (require.main === module) run();