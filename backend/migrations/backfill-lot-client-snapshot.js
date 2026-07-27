// One-time backfill: populate Invoice.lines[].lotClientIdSnapshot (and the same field on
// merged lines' sources[]) from each source lot's CURRENT Lot.clientId.
//
// Why current owner is the right value here: before this field existed, the good-pool lot
// picker was hard-filtered to the billed client, so for every historical GOOD line the lot's
// owner and the invoice's client were necessarily the same. The only pre-existing
// cross-client path was the combined-damaged sale (isDamaged lines), which drew from a
// deliberately cross-client pool. So this backfill is exact, not a guess.
//
// Expected shape of the output: `crossClient` should be ~equal to the number of damaged
// lines, and `crossClientGood` should be 0. A non-zero crossClientGood means a lot was
// re-pointed at a different client at some point — worth inspecting before trusting the
// cross-client report's history, hence it's listed explicitly.
//
// Idempotent: lines that already carry a snapshot are skipped, so it is safe to re-run.
// Cancelled invoices are included — they stay in the audit trail and may be un-cancelled.
//
// Run from backend/:   node migrations/backfill-lot-client-snapshot.js
//   • uses process.env.MONGO_URI, or pass the URI as the first arg
//   • add --dry to report without writing

const mongoose = require('mongoose');
const { Invoice, Lot } = require('../mongodb_schema');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MONGO_URI = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;

(async () => {
  if (!MONGO_URI) {
    console.error('No MONGO_URI. Pass it as an argument or set the env var.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log(`Connected.${DRY ? '  (DRY RUN — nothing will be written)' : ''}`);

  // One read of every lot's owner beats a per-line findById; a few thousand lots is nothing.
  const lots = await Lot.find().select('_id clientId').lean();
  const ownerByLot = new Map(lots.map((l) => [String(l._id), l.clientId]));
  console.log(`Loaded ${ownerByLot.size} lots.`);

  const invoices = await Invoice.find().select('invoiceNumber clientId lines');
  console.log(`Scanning ${invoices.length} invoices…`);

  let touchedInvoices = 0;
  let filledLines = 0;
  let filledSources = 0;
  let missingLot = 0;
  let crossClient = 0;
  let crossClientGood = 0;
  const anomalies = [];

  for (const inv of invoices) {
    let dirty = false;

    for (const line of inv.lines) {
      // A merged line's own lotId is null; its sources carry the lots.
      if (Array.isArray(line.sources) && line.sources.length > 0) {
        for (const src of line.sources) {
          if (src.lotClientIdSnapshot) continue;
          const owner = ownerByLot.get(String(src.lotId));
          if (!owner) { missingLot++; continue; }
          src.lotClientIdSnapshot = owner;
          filledSources++;
          dirty = true;
          if (String(owner) !== String(inv.clientId)) {
            crossClient++;
            if (!line.isDamaged) {
              crossClientGood++;
              anomalies.push(`${inv.invoiceNumber} line ${line.lineNo} source lot ${src.lotNumberSnapshot || src.lotId}`);
            }
          }
        }
        continue;
      }

      if (!line.lotId || line.lotClientIdSnapshot) continue; // sample / legacy / already done
      const owner = ownerByLot.get(String(line.lotId));
      if (!owner) { missingLot++; continue; }
      line.lotClientIdSnapshot = owner;
      filledLines++;
      dirty = true;
      if (String(owner) !== String(inv.clientId)) {
        crossClient++;
        if (!line.isDamaged) {
          crossClientGood++;
          anomalies.push(`${inv.invoiceNumber} line ${line.lineNo} lot ${line.lotNumberSnapshot || line.lotId}`);
        }
      }
    }

    if (dirty) {
      touchedInvoices++;
      // validateBeforeSave:false — historical invoices predate later required-field additions
      // and this migration must not fail on unrelated legacy gaps.
      if (!DRY) await inv.save({ validateBeforeSave: false });
    }
  }

  console.log('');
  console.log(`Invoices updated      : ${touchedInvoices}`);
  console.log(`Line snapshots set    : ${filledLines}`);
  console.log(`Source snapshots set  : ${filledSources}`);
  console.log(`Cross-client found    : ${crossClient}  (expected: the combined-damaged sales)`);
  console.log(`  …of which GOOD lines: ${crossClientGood}  (expected: 0)`);
  if (missingLot) console.log(`Lots no longer present: ${missingLot}  (left null — nothing to snapshot)`);

  if (anomalies.length) {
    console.log('');
    console.log('Unexpected cross-client GOOD lines — verify these before relying on the report:');
    anomalies.slice(0, 50).forEach((a) => console.log(`  • ${a}`));
    if (anomalies.length > 50) console.log(`  … and ${anomalies.length - 50} more`);
  }

  await mongoose.disconnect();
  console.log(`\nDone.${DRY ? '  (no writes performed)' : ''}`);
  process.exit(0);
})().catch(async (err) => {
  console.error('Migration failed:', err);
  try { await mongoose.disconnect(); } catch (_) { /* already down */ }
  process.exit(1);
});
