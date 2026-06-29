/**
 * One-off maintenance: hard-delete specific sales invoices and roll the FY invoice-number
 * counter back so those numbers are reissued.
 *
 * SAFETY:
 *   - DRY-RUN by default. Mutates ONLY when BOTH --execute and --yes are passed.
 *   - Refuses to run unless the connected database name === EXPECTED_DB (default
 *     gs_sales_accounting). This is the guard against accidentally hitting the wrong DB.
 *   - Aborts if a target invoice is missing, or if rolling the counter back to ROLLBACK_TO
 *     would clash with any other existing invoice for that FY.
 *   - Deletes via the same side effects as the app's deleteInvoice: returns each line's pcs
 *     to its lot (recalcLotInvoiced, sources-aware) and updates the client balance.
 *
 * This script never reads .env. Provide MONGO_URI via the environment, e.g.:
 *   node scripts/rollbackInvoices.js                 # dry-run (verify only)
 *   node scripts/rollbackInvoices.js --execute --yes # apply
 * (Or, the way the app runs, with Node loading the env file:
 *   node --env-file=../.env scripts/rollbackInvoices.js )
 */
const mongoose = require('mongoose');
const { Invoice, Counter } = require('../mongodb_schema');
const { recalcLotInvoiced } = require('../services/invoiceService');
const { updateClientBalance } = require('../services/clientBalanceService');

// ── What to do ────────────────────────────────────────────────────────────────
const TARGET_NUMBERS = ['INV2627/35', 'INV2627/36'];
const FY = '2627';
const COUNTER_ID = `invoice-${FY}`;
const ROLLBACK_TO = 34; // next issued invoice becomes INV2627/35
const EXPECTED_DB = process.env.EXPECTED_DB || 'gs_sales_accounting';

const EXECUTE = process.argv.includes('--execute') && process.argv.includes('--yes');

// Both single-lot (line.lotId) and merged (line.sources[].lotId) lots a line touches.
const collectLotIds = (lines = []) => {
  const ids = new Set();
  for (const l of lines) {
    if (l.lotId) ids.add(String(l.lotId));
    for (const s of (l.sources || [])) if (s.lotId) ids.add(String(s.lotId));
  }
  return [...ids];
};

const seqOf = (num) => {
  const m = new RegExp(`${FY}\\/(\\d+)\\s*$`).exec(num || '');
  return m ? parseInt(m[1], 10) : NaN;
};

const abort = async (msg) => {
  console.error(`\nABORT: ${msg}\nNo changes made.`);
  await mongoose.disconnect();
  process.exit(1);
};

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('ABORT: MONGO_URI is not set in the environment.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 3 });
  const dbName = mongoose.connection.db.databaseName;
  console.log(`Connected to DB: "${dbName}"  |  mode: ${EXECUTE ? 'EXECUTE (will mutate)' : 'DRY-RUN (no changes)'}`);

  if (dbName !== EXPECTED_DB) {
    return abort(`connected to "${dbName}" but expected "${EXPECTED_DB}".`);
  }

  // ── Load + show the targets ──────────────────────────────────────────────────
  const targets = await Invoice.find({ invoiceNumber: { $in: TARGET_NUMBERS } });
  console.log(`\nTarget invoices found: ${targets.length}/${TARGET_NUMBERS.length}`);
  for (const inv of targets) {
    const lotIds = collectLotIds(inv.lines);
    console.log(`  ${inv.invoiceNumber}  _id=${inv._id}  status=${inv.status}  total=${inv.total}  client=${inv.clientSnapshot?.name || inv.clientId}  lots=[${lotIds.join(', ')}]`);
    inv.lines.forEach((l, i) => {
      if (l.sources?.length) {
        console.log(`      line ${i + 1} (merged): pcs=${l.pcs} sources=[${l.sources.map((s) => `${s.lotNumberSnapshot || s.lotId}:${s.pcs}`).join(', ')}]`);
      } else {
        console.log(`      line ${i + 1}: lot=${l.lotNumberSnapshot || l.lotId || '—'} pcs=${l.pcs}`);
      }
    });
  }

  const missing = TARGET_NUMBERS.filter((n) => !targets.find((t) => t.invoiceNumber === n));
  if (missing.length) return abort(`invoice(s) not found: ${missing.join(', ')}.`);

  // ── Safety: rolling the counter to ROLLBACK_TO must not clash with a surviving invoice ──
  const fyInvoices = await Invoice.find({ invoiceNumber: new RegExp(`${FY}\\/\\d+\\s*$`) }).select('invoiceNumber');
  const survivors = fyInvoices.filter((i) => !TARGET_NUMBERS.includes(i.invoiceNumber));
  const maxSurvivor = survivors.reduce((m, i) => Math.max(m, seqOf(i.invoiceNumber) || 0), 0);
  console.log(`\nFY${FY} invoices total: ${fyInvoices.length}; highest seq surviving after deletion: ${maxSurvivor}`);
  if (maxSurvivor > ROLLBACK_TO) {
    return abort(`a surviving FY${FY} invoice has seq ${maxSurvivor} > rollback target ${ROLLBACK_TO}; rolling back would clash.`);
  }

  const counter = await Counter.findById(COUNTER_ID);
  console.log(`Current ${COUNTER_ID}.sequence = ${counter ? counter.sequence : '(none)'}  → will set to ${ROLLBACK_TO} (next issued = ${FY}/${ROLLBACK_TO + 1})`);

  const allLotIds = new Set();
  const clientIds = new Set();
  targets.forEach((inv) => {
    collectLotIds(inv.lines).forEach((id) => allLotIds.add(id));
    if (inv.clientId) clientIds.add(String(inv.clientId));
  });

  if (!EXECUTE) {
    console.log(`\nDRY-RUN summary — would:`);
    console.log(`  • hard-delete: ${TARGET_NUMBERS.join(', ')}`);
    console.log(`  • recalc lots: [${[...allLotIds].join(', ')}]  (return their pcs to the dispatch pool)`);
    console.log(`  • update client balance(s): [${[...clientIds].join(', ')}]`);
    console.log(`  • set ${COUNTER_ID}.sequence → ${ROLLBACK_TO}`);
    console.log(`\nRe-run with  --execute --yes  to apply.`);
    await mongoose.disconnect();
    return;
  }

  // ── EXECUTE ──────────────────────────────────────────────────────────────────
  for (const inv of targets) {
    await Invoice.findByIdAndDelete(inv._id);
    console.log(`Deleted ${inv.invoiceNumber}`);
  }
  for (const id of allLotIds) {
    const r = await recalcLotInvoiced(id);
    console.log(`Recalc lot ${id}: invoicedPcs=${r?.invoicedPcs} damagedSoldPcs=${r?.damagedSoldPcs} status=${r?.status}`);
  }
  for (const cid of clientIds) {
    await updateClientBalance(cid);
    console.log(`Updated client balance ${cid}`);
  }
  const updated = await Counter.findByIdAndUpdate(COUNTER_ID, { $set: { sequence: ROLLBACK_TO } }, { new: true });
  console.log(`Set ${COUNTER_ID}.sequence → ${updated ? updated.sequence : '(failed)'}`);

  console.log('\nDONE.');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('ERROR:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
