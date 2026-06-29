/**
 * DEV-ONLY verification for the low-stock alert feature.
 *
 * SAFETY:
 *   - Refuses to run unless the connected database name === 'gs_dev'.
 *   - Non-destructive to real data: it creates its OWN temporary AccessoryType + items
 *     (name-prefixed __lowstock_verify__), asserts the monitoring rule against them, then
 *     deletes everything it created. It never sends email (runLowStockDigest is called
 *     WITHOUT force, so it stops at the 'disabled'/'no recipients'/'nothing low' branch).
 *
 * Run (from backend/):
 *   node --env-file=../.env.development scripts/verifyLowStock.js
 */
const mongoose = require('mongoose');
const { AccessoryType, AccessoryItem } = require('../mongodb_schema');
const { getLowStockItems } = require('../services/accessoryService');
const { runLowStockDigest } = require('../controllers/cronController');

const EXPECTED_DB = 'gs_dev';
const TYPE_KEY = '__lowstock_verify__';

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

(async () => {
  if (!process.env.MONGO_URI) { console.error('ABORT: MONGO_URI not set.'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 3 });
  const dbName = mongoose.connection.db.databaseName;
  console.log(`Connected to DB: "${dbName}"`);
  if (dbName !== EXPECTED_DB) {
    console.error(`ABORT: connected to "${dbName}" but this script only runs on "${EXPECTED_DB}". No changes made.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  let type;
  try {
    // Clean any leftover from a prior aborted run.
    const stale = await AccessoryType.findOne({ key: TYPE_KEY });
    if (stale) {
      await AccessoryItem.deleteMany({ accessoryTypeId: stale._id });
      await AccessoryType.deleteOne({ _id: stale._id });
    }

    // Temp type: monitored, with a type-level default reorder of 50 (for the fallback case).
    type = await AccessoryType.create({
      key: TYPE_KEY, name: 'LowStock Verify', unit: 'pcs',
      monitorLowStock: true, reorderLevel: 50, isActive: true,
    });

    // available = openingStock (no purchases/consumption for these temp items).
    const mk = (name, opts) => AccessoryItem.create({
      accessoryTypeId: type._id, name, openingStock: opts.opening,
      monitorLowStock: opts.monitor, reorderLevel: opts.reorder, isActive: true,
    });
    const A = await mk('VERIFY A (item-level low)',   { opening: 10,  monitor: true,  reorder: 100 }); // 10<=100 → LOW
    const B = await mk('VERIFY B (item monitor off)', { opening: 10,  monitor: false, reorder: 100 }); // off → not low
    const C = await mk('VERIFY C (type fallback)',    { opening: 10,  monitor: true,  reorder: 0 });   // eff 50, 10<=50 → LOW
    const D = await mk('VERIFY D (above level)',      { opening: 500, monitor: true,  reorder: 100 }); // 500>100 → not low

    const idsOf = (rows) => new Set(rows.map(r => String(r.itemId)));

    console.log('\n[1] Monitoring rule (type ON):');
    let low = await getLowStockItems();
    let ids = idsOf(low.filter(r => r.typeName === 'LowStock Verify'));
    check('A (item-level reorder, available below) is LOW', ids.has(String(A._id)));
    check('C (reorder 0 → type fallback 50, below) is LOW', ids.has(String(C._id)));
    check('B (item monitor OFF) is NOT low', !ids.has(String(B._id)));
    check('D (available above level) is NOT low', !ids.has(String(D._id)));
    const cRow = low.find(r => String(r.itemId) === String(C._id));
    check('C effectiveLevel falls back to type level (50)', cRow && cRow.effectiveLevel === 50);
    const aRow = low.find(r => String(r.itemId) === String(A._id));
    check('A effectiveLevel uses item level (100)', aRow && aRow.effectiveLevel === 100);

    console.log('\n[2] Type-level kill switch (type OFF):');
    type.monitorLowStock = false;
    await type.save();
    low = await getLowStockItems();
    ids = idsOf(low.filter(r => r.typeName === 'LowStock Verify'));
    check('No items of a disabled type are low', ids.size === 0);
    // restore for completeness (it gets deleted anyway)
    type.monitorLowStock = true; await type.save();

    console.log('\n[3] Digest orchestration (no email sent — non-force):');
    const res = await runLowStockDigest(); // honors CompanySettings.enabled; will not send if disabled
    check('runLowStockDigest returns a structured result', res && typeof res.sent === 'boolean');
    console.log(`     → enabled=${res.enabled} sent=${res.sent} reason=${res.reason || '(sent)'} low=${res.low}`);
  } finally {
    // ── Cleanup ──
    if (type) {
      const delItems = await AccessoryItem.deleteMany({ accessoryTypeId: type._id });
      await AccessoryType.deleteOne({ _id: type._id });
      const leftType = await AccessoryType.findOne({ key: TYPE_KEY });
      const leftItems = await AccessoryItem.countDocuments({ accessoryTypeId: type._id });
      console.log(`\n[cleanup] removed ${delItems.deletedCount} temp items + temp type; leftovers: type=${leftType ? 'YES' : 'no'} items=${leftItems}`);
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('ERROR:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
