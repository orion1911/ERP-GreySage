// READ-ONLY diagnostic: list finishing lots whose accessory data looks off, so they can be
// re-entered/corrected. No writes. Run against whatever MONGO_URI points to (dev or prod).
//
// Flags a lot when any of:
//   • split-not-set  — accessories span >1 client but some rows have no per-client basisPcs (the
//                      piece split hasn't been entered). A correctly-split lot is NOT flagged.
//   • rivets lumped  — fewer distinct rivet items than button clients (old auto-derivation put all
//                      rivets on the default item instead of each client's rivet)
//   • negative extra — an item shows extra < 0 on the Finishing Vendor Extras dashboard (a basis
//                      mismatch: pre-tracking straddler, partial finish, or split double-count)
//
// Usage (from backend/):  node --env-file=../.env scripts/report_suspicious_finishing_lots.js
const mongoose = require('mongoose');
const { Lot, AccessoryConsumption, AccessoryItem } = require('../mongodb_schema');
const svc = require('../services/accessoryService');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('DB:', mongoose.connection.name, '\n');

  const cons = await AccessoryConsumption.find({ stage: 'finishing' }).lean();
  const items = await AccessoryItem
    .find({ _id: { $in: [...new Set(cons.map(c => String(c.accessoryItemId)))] } })
    .populate('clientId', 'name').lean();
  const im = new Map(items.map(i => [String(i._id), i]));
  const clientOf = (id) => { const it = im.get(String(id)); return it?.clientId ? it.clientId.name : 'General'; };
  const subOf = (id) => im.get(String(id))?.subType || '-';

  const lots = await Lot.find({}, 'lotNumber').lean();
  const lm = new Map(lots.map(l => [String(l._id), l.lotNumber]));

  // Per-lot facts.
  const perLot = new Map();
  for (const c of cons) {
    const k = String(c.lotId);
    if (!perLot.has(k)) perLot.set(k, { clients: new Set(), rivetItems: new Set(), buttonClients: new Set(), anyMissingBasis: false });
    const p = perLot.get(k);
    const cl = clientOf(c.accessoryItemId), sub = subOf(c.accessoryItemId);
    p.clients.add(cl);
    if (sub === 'rivet') p.rivetItems.add(String(c.accessoryItemId));
    if (sub === 'button') p.buttonClients.add(cl);
    if (c.basisPcs == null) p.anyMissingBasis = true;
  }

  // Negative extras from the dashboard.
  const data = await svc.getFinishingVendorExtras();
  const negByLot = new Map();
  for (const v of data) for (const it of v.items) for (const l of (it.lots || [])) {
    if (l.extra < 0) {
      if (!negByLot.has(l.lotNumber)) negByLot.set(l.lotNumber, []);
      negByLot.get(l.lotNumber).push(`${it.name} ${l.extra}`);
    }
  }

  const rows = [];
  for (const [k, p] of perLot) {
    const ln = lm.get(k) || k;
    const flags = [];
    if (p.clients.size > 1 && p.anyMissingBasis) flags.push(`multi-client, per-client split not set (${[...p.clients].join('/')})`);
    if (p.buttonClients.size > 1 && p.rivetItems.size < p.buttonClients.size)
      flags.push(`rivets lumped (${p.rivetItems.size} rivet item(s) vs ${p.buttonClients.size} button clients)`);
    if (negByLot.has(ln)) flags.push(`negative extra: ${negByLot.get(ln).join(', ')}`);
    if (flags.length) rows.push({ ln, flags });
  }
  rows.sort((a, b) => a.ln.localeCompare(b.ln));

  console.log(`SUSPICIOUS LOTS: ${rows.length}\n`);
  for (const r of rows) { console.log(`  ${r.ln}`); for (const f of r.flags) console.log(`      - ${f}`); }
  if (!rows.length) console.log('  (none — all finishing lots look consistent)');

  await mongoose.disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
