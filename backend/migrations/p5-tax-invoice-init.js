// One-time init for Priority 5 — Tax Invoices (GST) alongside Bills of Supply. Jobs:
//
// 1. Indexes for the new `taxinvoices` / `gstraterules` collections, plus the Bill of Supply
//    unique index on invoiceNumber. Production runs autoIndex:false, so schema declarations
//    alone create NOTHING — without these a duplicate number could be saved.
// 2. Seeds the GST rate rules (apparel, HSN 61/62: 5% ≤ ₹2,500/pc, 18% above, from
//    22 Sep 2025) for any prefix that has no rule yet.
// 3. CompanySettings: sets taxInvoicePrefix = 'INV' where missing; reports GSTIN and GST state
//    code (Tax Invoices refuse to issue without them).
// 4. Jump-starts the Tax Invoice series: counter "taxinvoice-2627" = 42 (last WhiteBill Tax
//    Invoice), so the first ERP Tax Invoice is INV2627/43. NEVER lowers an existing counter.
//    Override with --ti-start=FYSHORT:LAST, e.g. --ti-start=2627:42.
// 5. Report only: legacy invoices stored as documentType TAX_INVOICE (pre-P5, no tax), and
//    round-off / rate values the new validation will reject on their next edit.
//
// Idempotent: safe to re-run. Run from backend/ with the PATCHED code checked out:
//   node migrations/p5-tax-invoice-init.js --dry     (report only)
//   node migrations/p5-tax-invoice-init.js           (uses MONGO_URI, or pass the URI first)

const mongoose = require('mongoose');
const { TaxInvoice, GstRateRule, Counter, CompanySettings, Invoice } = require('../mongodb_schema');
const { isValidFyShort } = require('../services/invoiceService');
const { SEED_RULES } = require('../services/gstService');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MONGO_URI = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;
const tiArg = (args.find((a) => a.startsWith('--ti-start=')) || '--ti-start=2627:42').split('=')[1];
const [TI_FY, TI_LAST_RAW] = tiArg.split(':');
const TI_LAST = parseInt(TI_LAST_RAW, 10);

const ensureIndex = async (model, key, options = {}) => {
  const existing = await model.collection.indexes().catch(() => []); // collection may not exist yet
  const same = existing.find((ix) => JSON.stringify(ix.key) === JSON.stringify(key));
  const label = `${model.collection.name} ${JSON.stringify(key)}${options.unique ? ' unique' : ''}`;
  if (same) {
    console.log(`  ✓ ${label} exists (${same.name})`);
    return;
  }
  console.log(`  + ${label}`);
  if (!DRY) await model.collection.createIndex(key, options);
};

(async () => {
  if (!MONGO_URI) {
    console.error('No Mongo URI. Set MONGO_URI or pass it as the first argument.');
    process.exit(1);
  }
  if (!isValidFyShort(TI_FY) || !Number.isInteger(TI_LAST) || TI_LAST < 0) {
    console.error('--ti-start must look like 2627:42 (FY short code : last Tax Invoice number issued)');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. ${DRY ? '(DRY RUN — no writes)' : ''}`);

  // ── 1. Indexes ──────────────────────────────────────────────────────────────────────────
  console.log('\n1. Indexes');
  await ensureIndex(TaxInvoice, { invoiceNumber: 1 }, { unique: true });
  await ensureIndex(TaxInvoice, { taxInvoiceId: 1 }, { unique: true });
  await ensureIndex(TaxInvoice, { sourceInvoiceId: 1 });
  await ensureIndex(TaxInvoice, { date: -1 });
  await ensureIndex(TaxInvoice, { clientId: 1, date: -1 });
  await ensureIndex(GstRateRule, { hsnPrefix: 1, effectiveFrom: -1 });
  const invIdx = (await Invoice.collection.indexes()).find((ix) => ix.key && ix.key.invoiceNumber === 1 && ix.unique);
  if (invIdx) {
    console.log(`  ✓ invoices unique index on invoiceNumber exists (${invIdx.name})`);
  } else {
    const dups = await Invoice.aggregate([
      { $group: { _id: '$invoiceNumber', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 20 }
    ]);
    if (dups.length) {
      console.log(`  ⚠ invoices: NOT creating the unique index — duplicate numbers: ${dups.map((d) => `${d._id} ×${d.n}`).join(', ')}`);
    } else {
      console.log('  + invoices {"invoiceNumber":1} unique');
      if (!DRY) await Invoice.collection.createIndex({ invoiceNumber: 1 }, { unique: true });
    }
  }

  // ── 2. GST rate rules ───────────────────────────────────────────────────────────────────
  console.log('\n2. GST rate rules');
  let seeded = 0;
  for (const r of SEED_RULES) {
    if (await GstRateRule.findOne({ hsnPrefix: r.hsnPrefix }).lean()) continue;
    if (!DRY) await GstRateRule.create(r);
    seeded++;
  }
  console.log(`  ${seeded} rule(s) seeded (prefixes that already have a rule are left alone).`);

  // ── 3. Company settings ─────────────────────────────────────────────────────────────────
  console.log('\n3. Company settings');
  const settings = await CompanySettings.findOne().lean();
  let tiPrefix = 'INV';
  if (!settings) {
    console.log('  ⚠ No CompanySettings document — open Admin → Company Settings once and save.');
  } else {
    if (settings.taxInvoicePrefix) {
      tiPrefix = settings.taxInvoicePrefix;
      console.log(`  ✓ taxInvoicePrefix = '${tiPrefix}'`);
    } else {
      console.log("  + taxInvoicePrefix = 'INV'");
      if (!DRY) await CompanySettings.updateOne({ _id: settings._id }, { $set: { taxInvoicePrefix: 'INV' } });
    }
    console.log(settings.gstin ? `  ✓ GSTIN ${settings.gstin}` : '  ⚠ GSTIN missing — Tax Invoices refuse to issue until it is set.');
    console.log(settings.gstStateCode
      ? `  ✓ GST state code ${settings.gstStateCode}${settings.gstStateCode !== '27' ? ' (expected 27 — Maharashtra)' : ''}`
      : '  ⚠ GST state code missing — set 27 (Maharashtra) under Admin → Company Settings.');
  }

  // ── 4. Tax Invoice counter jump-start ───────────────────────────────────────────────────
  console.log('\n4. Tax Invoice counter');
  const counterId = `taxinvoice-${TI_FY}`;
  const cur = await Counter.findById(counterId).lean();
  if (cur && cur.sequence >= TI_LAST) {
    console.log(`  ✓ ${counterId} is already at ${cur.sequence} (≥ ${TI_LAST}) — left alone.`);
  } else {
    console.log(`  ${cur ? `Raising ${counterId} from ${cur.sequence}` : `Creating ${counterId}`} → ${TI_LAST}. ` +
      `Next Tax Invoice: ${tiPrefix}${TI_FY}/${String(TI_LAST + 1).padStart(2, '0')}`);
    if (!DRY) await Counter.updateOne({ _id: counterId }, { $set: { sequence: TI_LAST } }, { upsert: true });
  }

  // ── 5. Checks (report only) ─────────────────────────────────────────────────────────────
  console.log('\n5. Checks (report only)');
  const legacy = await Invoice.find({ documentType: 'TAX_INVOICE' }).select('invoiceNumber').lean();
  console.log(legacy.length
    ? `  ⚠ ${legacy.length} Bill(s) of Supply stored as documentType TAX_INVOICE (pre-P5, no tax lines; they still print the old title): ` +
      `${legacy.slice(0, 20).map((i) => i.invoiceNumber).join(', ')}${legacy.length > 20 ? ' …' : ''}`
    : '  ✓ No legacy TAX_INVOICE documents in invoices.');
  const badRoundOff = await Invoice.find({ $or: [{ roundOff: { $gte: 1 } }, { roundOff: { $lte: -1 } }] })
    .select('invoiceNumber roundOff').lean();
  console.log(badRoundOff.length
    ? `  ⚠ |roundOff| ≥ 1 (fix on next edit): ${badRoundOff.map((i) => `${i.invoiceNumber} (${i.roundOff})`).join(', ')}`
    : '  ✓ All round-offs within ±0.99.');
  const badRates = await Invoice.aggregate([
    { $unwind: '$lines' },
    { $match: { $expr: { $gt: [{ $abs: { $subtract: [
      { $multiply: ['$lines.rate', 100] }, { $round: [{ $multiply: ['$lines.rate', 100] }, 0] }
    ] } }, 0.000001] } } },
    { $project: { _id: 0, invoiceNumber: 1, lineNo: '$lines.lineNo', rate: '$lines.rate' } },
    { $limit: 50 }
  ]);
  console.log(badRates.length
    ? `  ⚠ Rates with > 2 decimals (fix on next edit): ${badRates.map((r) => `${r.invoiceNumber} line ${r.lineNo} (${r.rate})`).join(', ')}`
    : '  ✓ All line rates have ≤ 2 decimals.');

  await mongoose.disconnect();
  console.log('\nDone.');
})().catch(async (err) => {
  console.error('Migration failed:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
