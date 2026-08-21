// Read-only audit: independently recompute the production-dashboard stage counts and
// verify the identities that make the KPI row consolidate — every stage exclusive, and
// stages summing to Total Pieces. RUN ANYTIME — it writes nothing.
//
// WHY THIS EXISTS (2026-08)
// The "Out Washing" KPI/column was removed from the dashboard because it is a cumulative
// SUPERSET (= awaiting finishing + in finishing + finished) and double-counted the other
// stages. This script proves, against live data, that the numbers now shown obey:
//
//   HARD IDENTITIES (any failure = data or logic bug, exit code 1):
//     A. Lot exclusivity      every scoped lot is exactly one of making / inWashing / outWashing
//     B. Stage sum            totalPcs = making + inWashing + outWashing
//     C. Superset split       outWashing = awaitingFinishing + inFinishing + finished
//     D. KPI-row consolidation  totalPcs = making + inWashing + awaiting + inFinishing + finished
//        (this is identity B with outWashing expanded via C — the property the user sees)
//     E. Per-client           each client row obeys B and C; client TOTALs sum to totalPcs
//     F. Washer arithmetic    per washer: total = in + out, and pending = in
//
//     G. Finished split       finished = pending + dispatched + damaged (per-lot, from
//        lot.invoicedPcs / lot.damagedPcs — the same inputs the unified controller uses)
//     H. Full KPI row         totalPcs = making + inWashing + awaiting + inFinishing
//                                        + pending + dispatched + damaged
//        Since 2026-08 the controller computes ALL cards on this one stitching-date scope
//        (cache key productionDashboard-v2), so G and H are HARD identities — the on-screen
//        row reconciles to Total Pieces exactly, less only damaged pcs (exposed as
//        total_damaged in the payload).
//
// The recomputation here deliberately AVOIDS the controller's aggregation pipelines:
// it loads raw Stitching / Washing / Finishing rows with plain finds and derives lot
// status in straightforward JS. Same semantics, different code path — so agreement is
// a real cross-check, not the same bug counted twice.
//
// Run from backend/:   node migrations/audit-dashboard-stage-counts.js
//   • uses process.env.MONGO_URI, or pass the URI as the first arg
//   • --from=2026-01-01 --to=2026-08-22   mirror the dashboard date filter (Stitching.date)
//   • --client=<clientId>                 mirror the client filter
//   • --samples=5                         example offending lots per failed identity

const mongoose = require('mongoose');
const { Lot, Client, Stitching, Washing, Finishing } = require('../mongodb_schema');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MONGO_URI = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;
const FROM = flag('from', null);
const TO = flag('to', null);
const CLIENT = flag('client', null);
const SAMPLES = parseInt(flag('samples', '5'), 10);

const fmt = (n) => (n || 0).toLocaleString();
const pass = (s) => `\x1b[32mPASS\x1b[0m  ${s}`;
const fail = (s) => `\x1b[31mFAIL\x1b[0m  ${s}`;
const info = (s) => `\x1b[36mINFO\x1b[0m  ${s}`;

async function main() {
  if (!MONGO_URI) {
    console.error('No Mongo URI. Set MONGO_URI or pass it as the first argument.');
    process.exit(2);
  }
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. Scope: from=${FROM || '(open)'} to=${TO || '(open)'} client=${CLIENT || '(all)'}\n`);

  // ── 1. Load the same universe the dashboard scopes: stitching records by date ──
  const stitchMatch = {};
  if (FROM || TO) {
    stitchMatch.date = {};
    if (FROM) stitchMatch.date.$gte = new Date(FROM);
    if (TO) stitchMatch.date.$lte = new Date(new Date(TO).setHours(23, 59, 59, 999));
  }
  const stitching = await Stitching.find(stitchMatch).lean();
  const lotIds = [...new Set(stitching.map((s) => s.lotId?.toString()).filter(Boolean))];
  const lots = await Lot.find({ _id: { $in: lotIds } }).lean();
  const lotById = Object.fromEntries(lots.map((l) => [l._id.toString(), l]));

  // Client scope, applied like the controller: through the lot.
  let clientName = null;
  const inScope = (lotId) => {
    const lot = lotById[lotId];
    if (!lot) return false;
    return !CLIENT || lot.clientId?.toString() === CLIENT;
  };
  if (CLIENT) {
    const c = await Client.findById(CLIENT).lean().catch(() => null);
    clientName = c?.name || CLIENT;
    console.log(`Client filter: ${clientName}\n`);
  }

  const washing = await Washing.find({ lotId: { $in: lotIds } }).lean();
  const finishing = await Finishing.find({ lotId: { $in: lotIds } }).lean();
  const washByLot = {};
  for (const w of washing) {
    const id = w.lotId?.toString();
    if (id) washByLot[id] = w; // controller also keeps one washing row per lot
  }
  const finByLot = {};
  for (const f of finishing) {
    const id = f.lotId?.toString();
    if (!id) continue;
    (finByLot[id] = finByLot[id] || []).push(f);
  }

  // ── 2. Independent per-lot recomputation (plain JS, mirrors controller semantics) ──
  // status: 'making' | 'inWashing' | 'outWashing'; finishing: null | 'in' | 'out'
  const perLot = {};
  for (const st of stitching) {
    const id = st.lotId?.toString();
    if (!id || !inScope(id)) continue;
    if (!perLot[id]) {
      perLot[id] = {
        qty: 0,
        client: null,
        washer: null,
        status: 'making',
        finishing: null,
        lotNumber: lotById[id]?.lotNumber || id,
      };
    }
    perLot[id].qty += (st.quantity || 0) - (st.quantityShort || 0);
  }
  // client names in one query
  const clientIds = [...new Set(Object.keys(perLot).map((id) => lotById[id]?.clientId?.toString()).filter(Boolean))];
  const clientDocs = await Client.find({ _id: { $in: clientIds } }).lean();
  const clientNameById = Object.fromEntries(clientDocs.map((c) => [c._id.toString(), c.name]));
  for (const [id, lot] of Object.entries(perLot)) {
    lot.client = clientNameById[lotById[id]?.clientId?.toString()] || 'Unknown';
    const w = washByLot[id];
    if (w) {
      lot.washer = w.vendorId?.toString() || 'unknown-washer';
      lot.status = w.washOutDate ? 'outWashing' : 'inWashing';
      lot.qty -= (w.washDetails || []).reduce((s, d) => s + (d.quantityShort || 0), 0);
    }
    for (const f of finByLot[id] || []) {
      lot.qty -= f.quantityShort || 0;
      if (!f.finishOutDate) lot.finishing = 'in'; // 'in' wins over 'out'
      else if (lot.finishing !== 'in') lot.finishing = 'out';
    }
  }

  // ── 3. Totals ──
  const T = { pcs: 0, making: 0, inWashing: 0, outWashing: 0, awaiting: 0, inFinishing: 0, finished: 0 };
  const clients = {};
  const washers = {};
  const violations = { exclusivity: [], clientRows: [], washerRows: [] };

  for (const lot of Object.values(perLot)) {
    T.pcs += lot.qty;
    const c = (clients[lot.client] = clients[lot.client] || { total: 0, making: 0, inWashing: 0, outWashing: 0, awaiting: 0, inFinishing: 0, finished: 0 });
    c.total += lot.qty;

    // Identity A — a lot has exactly one status by construction of the state machine;
    // what can actually go wrong in data is finishing progress on a lot that never
    // washed out. Flag those: they'd silently distort the awaiting/inFinishing split.
    if (lot.status !== 'outWashing' && lot.finishing) {
      violations.exclusivity.push(`${lot.lotNumber}: finishing='${lot.finishing}' while status='${lot.status}'`);
    }

    if (lot.status === 'making') { T.making += lot.qty; c.making += lot.qty; }
    else if (lot.status === 'inWashing') { T.inWashing += lot.qty; c.inWashing += lot.qty; }
    else {
      T.outWashing += lot.qty; c.outWashing += lot.qty;
      if (!lot.finishing) { T.awaiting += lot.qty; c.awaiting += lot.qty; }
      else if (lot.finishing === 'in') { T.inFinishing += lot.qty; c.inFinishing += lot.qty; }
      else { T.finished += lot.qty; c.finished += lot.qty; }
    }
    if (lot.washer) {
      const w = (washers[lot.washer] = washers[lot.washer] || { total: 0, in: 0, out: 0 });
      w.total += lot.qty;
      if (lot.status === 'inWashing') w.in += lot.qty;
      if (lot.status === 'outWashing') w.out += lot.qty;
    }
  }

  let failures = 0;
  const check = (ok, label, detail) => {
    console.log(ok ? pass(label) : fail(`${label}  ${detail || ''}`));
    if (!ok) failures += 1;
  };

  console.log('── Recomputed totals ─────────────────────────────');
  console.log(`  Total Pieces        ${fmt(T.pcs)}`);
  console.log(`  Making              ${fmt(T.making)}`);
  console.log(`  In Washing          ${fmt(T.inWashing)}`);
  console.log(`  Out Washing (calc)  ${fmt(T.outWashing)}   ← removed from UI, verified here`);
  console.log(`    Awaiting Finish   ${fmt(T.awaiting)}`);
  console.log(`    In Finishing      ${fmt(T.inFinishing)}`);
  console.log(`    Finished          ${fmt(T.finished)}`);
  console.log('');

  console.log('── Hard identities ───────────────────────────────');
  check(violations.exclusivity.length === 0, 'A. Lot stage exclusivity',
    `${violations.exclusivity.length} lots with finishing progress but never washed out` +
    (violations.exclusivity.length ? `\n        e.g. ${violations.exclusivity.slice(0, SAMPLES).join('; ')}` : ''));
  check(T.pcs === T.making + T.inWashing + T.outWashing, 'B. Total = Making + In Washing + Out Washing',
    `${fmt(T.pcs)} vs ${fmt(T.making + T.inWashing + T.outWashing)}`);
  check(T.outWashing === T.awaiting + T.inFinishing + T.finished, 'C. Out Washing = Awaiting + In Finishing + Finished',
    `${fmt(T.outWashing)} vs ${fmt(T.awaiting + T.inFinishing + T.finished)}`);
  check(T.pcs === T.making + T.inWashing + T.awaiting + T.inFinishing + T.finished,
    'D. KPI consolidation: Total = Making + In Washing + Awaiting + In Finishing + Finished',
    `${fmt(T.pcs)} vs ${fmt(T.making + T.inWashing + T.awaiting + T.inFinishing + T.finished)}`);

  for (const [name, c] of Object.entries(clients)) {
    if (c.total !== c.making + c.inWashing + c.outWashing) violations.clientRows.push(`${name}: B off by ${c.total - (c.making + c.inWashing + c.outWashing)}`);
    if (c.outWashing !== c.awaiting + c.inFinishing + c.finished) violations.clientRows.push(`${name}: C off by ${c.outWashing - (c.awaiting + c.inFinishing + c.finished)}`);
  }
  const clientTotalSum = Object.values(clients).reduce((s, c) => s + c.total, 0);
  check(violations.clientRows.length === 0 && clientTotalSum === T.pcs, 'E. Per-client rows + client sum to Total',
    violations.clientRows.length ? violations.clientRows.slice(0, SAMPLES).join('; ') : `client sum ${fmt(clientTotalSum)} vs ${fmt(T.pcs)}`);

  for (const [id, w] of Object.entries(washers)) {
    if (w.total !== w.in + w.out) violations.washerRows.push(`washer ${id}: total ${w.total} ≠ in ${w.in} + out ${w.out}`);
  }
  check(violations.washerRows.length === 0, 'F. Washer: total = in + out (pending = in)',
    violations.washerRows.slice(0, SAMPLES).join('; '));

  // ── 4. Finished-pool split + full-row identities (unified scope, hard) ──
  console.log('\n── Dispatch split (unified scope) ────────────────');
  let pending = 0, dispatched = 0, damaged = 0, partPending = 0;
  const splitViolations = [];
  for (const [id, lot] of Object.entries(perLot)) {
    if (lot.status !== 'outWashing' || lot.finishing !== 'out') continue;
    const raw = lotById[id] || {};
    const d = Math.min(raw.damagedPcs || 0, lot.qty);
    const inv = Math.min(raw.invoicedPcs || 0, lot.qty - d);
    const p = lot.qty - d - inv;
    damaged += d; dispatched += inv; pending += p;
    if ((raw.status || 0) === 6) partPending += p;
    if (p < 0) splitViolations.push(`${lot.lotNumber}: negative pending ${p}`);
  }
  console.log(`  Finished pool       ${fmt(T.finished)}`);
  console.log(`    Pending Dispatch  ${fmt(pending)}  (part-dispatch subset ${fmt(partPending)})`);
  console.log(`    Dispatched        ${fmt(dispatched)}`);
  console.log(`    Damaged           ${fmt(damaged)}`);
  check(splitViolations.length === 0 && T.finished === pending + dispatched + damaged,
    'G. Finished = Pending + Dispatched + Damaged',
    splitViolations.slice(0, SAMPLES).join('; ') || `${fmt(T.finished)} vs ${fmt(pending + dispatched + damaged)}`);
  check(T.pcs === T.making + T.inWashing + T.awaiting + T.inFinishing + pending + dispatched + damaged,
    'H. Full KPI row: Total = Making + InWashing + Awaiting + InFinishing + Pending + Dispatched + Damaged',
    `${fmt(T.pcs)} vs ${fmt(T.making + T.inWashing + T.awaiting + T.inFinishing + pending + dispatched + damaged)}`);

  console.log(`\n${failures === 0 ? '\x1b[32mAll hard identities hold.\x1b[0m' : `\x1b[31m${failures} identity check(s) FAILED.\x1b[0m`}`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(2);
});
