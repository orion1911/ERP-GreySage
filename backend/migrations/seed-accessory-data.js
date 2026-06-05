/**
 * Seed Accessory masters + opening stock + Jan–May purchase/payment history + opening balance.
 *
 * This restores the FULL ledger history (to match the dev DB):
 *   • Zipper        → opening-stock snapshot (rate 0, 1-Jun-2026), no history, opening balance 0.
 *   • Label-Tag /
 *     Pocketing /   → masters + the Jan–May purchases + payments + a 1-Jan opening balance,
 *     Polybag         so balance-due reconciles to the spreadsheet closing figures.
 *
 * NOTE: with the history back, label-tag/polybag AVAILABLE STOCK = total purchased (past
 * consumption isn't recorded) — same as dev. Opening balance is the 1-Jan outstanding so
 * that opening + purchases − payments == the reconciled closing balance.
 *
 * Run from backend/:
 *   node migrations/seed-accessory-data.js "mongodb://.../db?..."
 *
 * Idempotent + self-cleaning: deletes ANY prior seeded purchases/payments (notes containing
 * "SEED") per type before inserting, so re-running replaces the seed and won't touch
 * UI-entered records. Masters are upserted by name.
 */

const mongoose = require('mongoose');
const {
  AccessoryType, AccessoryItem, AccessoryPurchase, AccessoryPayment, AccessoryBalance, Client, User
} = require('../mongodb_schema');
const accessoryService = require('../services/accessoryService');

const MONGO_URI = process.argv[2] || process.env.MONGO_URI;
const SEED_TAG = 'SEED-OPENING-JUN2026';
const OPENING_DATE = new Date('2026-06-01T00:00:00.000Z');
const round2 = (n) => Math.round(n * 100) / 100;
const d = (iso) => new Date(iso + 'T00:00:00.000Z');

// masters:      { name, rate, subType?, client? }
// openingStock: { item, qty }                         rate 0, dated 1-Jun (zipper only)
// purchases:    { date, inv, lines:[{ item, qty, rate }] }
// payments:     { date, amount, ref? }
// openingBalance: number                              1-Jan outstanding carried in
const DATA = {
  zipper: {
    supplier: '',
    openingBalance: 0,
    masters: [
      { name: 'AD BLUE 5.5 INCH', rate: 0, client: 'ADAM HILL' },
      { name: 'AD BLUE 6 INCH', rate: 0, client: 'ADAM HILL' },
      { name: 'AD BLACK 5.5 INCH', rate: 0, client: 'ADAM HILL' },
      { name: 'AD BLACK 6 INCH', rate: 0, client: 'ADAM HILL' },
      { name: 'SILVER HEAVY 5.5 INCH', rate: 0 },
      { name: 'SILVER HEAVY 6 INCH', rate: 0 },
      { name: 'AD WHITE 5.5 INCH', rate: 0, client: 'ADAM HILL' },
      { name: 'AD WHITE 6 INCH', rate: 0, client: 'ADAM HILL' },
    ],
    openingStock: [
      { item: 'AD BLUE 5.5 INCH', qty: 1114 },
      { item: 'AD BLUE 6 INCH', qty: 1760 },
      { item: 'AD BLACK 5.5 INCH', qty: 460 },
      { item: 'AD BLACK 6 INCH', qty: 140 },
      { item: 'SILVER HEAVY 5.5 INCH', qty: 1700 },
      { item: 'SILVER HEAVY 6 INCH', qty: 1810 },
      { item: 'AD WHITE 5.5 INCH', qty: 643 },
      { item: 'AD WHITE 6 INCH', qty: 76 },
    ],
    purchases: [],
    payments: [],
  },

  'label-tag': {
    supplier: 'AKSHAY LABEL TAG MALAD',
    openingBalance: 92945.35, // 1-Jan outstanding (pre-Jan purchases 240262.35 − payments 147317)
    masters: [
      { name: 'AD LABEL NON TEARABLE KHAKI', rate: 3.75, subType: 'label' },
      { name: 'AT LABEL NON TEARABLE KHAKI', rate: 3.25, subType: 'label' },
      { name: 'BW LABEL NON TEARABLE KHAKI', rate: 3.25, subType: 'label' },
      { name: 'AD HANG TAGS PLASTIC BLACK', rate: 3, subType: 'tag' },
      { name: 'BW HANG TAG', rate: 4.5, subType: 'tag' },
    ],
    openingStock: [],
    purchases: [
      { date: '2026-01-03', inv: '314', lines: [
        { item: 'AD LABEL NON TEARABLE KHAKI', qty: 9900, rate: 3.7 },
        { item: 'AD HANG TAGS PLASTIC BLACK', qty: 13000, rate: 3 },
      ] },
      { date: '2026-02-04', inv: '349', lines: [{ item: 'AT LABEL NON TEARABLE KHAKI', qty: 4600, rate: 3.25 }] },
      { date: '2026-02-04', inv: '350', lines: [{ item: 'AD LABEL NON TEARABLE KHAKI', qty: 9908, rate: 3.75 }] },
      { date: '2026-02-04', inv: '351', lines: [
        { item: 'BW LABEL NON TEARABLE KHAKI', qty: 10275, rate: 3.25 },
        { item: 'BW HANG TAG', qty: 10300, rate: 4.5 },
      ] },
      { date: '2026-02-07', inv: '358', lines: [{ item: 'AD HANG TAGS PLASTIC BLACK', qty: 3000, rate: 3 }] },
      { date: '2026-02-12', inv: '366', lines: [{ item: 'AD HANG TAGS PLASTIC BLACK', qty: 8680, rate: 3 }] },
      { date: '2026-03-27', inv: '434', lines: [
        { item: 'AD LABEL NON TEARABLE KHAKI', qty: 15303, rate: 3.75 },
        { item: 'AD HANG TAGS PLASTIC BLACK', qty: 13080, rate: 3 },
      ] },
      { date: '2026-03-27', inv: '435', lines: [
        { item: 'BW LABEL NON TEARABLE KHAKI', qty: 9947, rate: 3.25 },
        { item: 'BW HANG TAG', qty: 10125, rate: 4.5 },
      ] },
    ],
    payments: [
      { date: '2026-01-14', amount: 38910, ref: '246' },
      { date: '2026-01-20', amount: 16869, ref: '257' },
      { date: '2026-02-06', amount: 37165, ref: '295' },
      { date: '2026-02-06', amount: 37815, ref: '314' },
      { date: '2026-02-19', amount: 37815, ref: '314' },
      { date: '2026-03-03', amount: 52105, ref: '349/350' },
      { date: '2026-03-27', amount: 100000, ref: '351/366' },
      { date: '2026-04-27', amount: 14786, ref: '366 FEB' },
      { date: '2026-05-16', amount: 100000, ref: '434' },
    ],
  },

  pocketing: {
    supplier: 'HAMID BHAI POCKETING',
    openingBalance: 55506.6, // 1-Jan outstanding (pre-Jan purchases 192339.6 − payments 136833)
    masters: [
      { name: 'BLACK', rate: 32 },
      { name: '72/52', rate: 33.9 },
      { name: 'DRILL', rate: 37 },
      { name: 'TWILL', rate: 36 },
      { name: '68/68', rate: 34 },
      { name: 'GENERAL', rate: 0 },
    ],
    openingStock: [],
    purchases: [
      { date: '2026-01-14', inv: '4', lines: [{ item: '68/68', qty: 996, rate: 34 }] },
      { date: '2026-01-22', inv: '5', lines: [{ item: 'BLACK', qty: 851.3, rate: 31 }] },
      { date: '2026-01-31', inv: '6', lines: [{ item: '72/52', qty: 594.6, rate: 32 }] },
      { date: '2026-02-05', inv: '7', lines: [{ item: 'TWILL', qty: 869.2, rate: 36 }] },
      { date: '2026-02-12', inv: '8', lines: [
        { item: 'TWILL', qty: 416, rate: 36 },
        { item: 'GENERAL', qty: 888.6, rate: 31 },
      ] },
      { date: '2026-02-23', inv: '9', lines: [{ item: '72/52', qty: 952.2, rate: 31 }] },
      { date: '2026-03-27', inv: '10', lines: [
        { item: '72/52', qty: 419.4, rate: 31 },
        { item: 'GENERAL', qty: 93, rate: 36 },
      ] },
      { date: '2026-03-27', inv: '11', lines: [
        { item: 'DRILL', qty: 411.6, rate: 37 },
        { item: 'GENERAL', qty: 470.7, rate: 31 },
      ] },
      { date: '2026-04-01', inv: '12', lines: [{ item: 'DRILL', qty: 633.2, rate: 37 }] },
      { date: '2026-04-08', inv: '13', lines: [{ item: 'BLACK', qty: 886.9, rate: 32 }] },
      { date: '2026-04-15', inv: '14', lines: [
        { item: '72/52', qty: 487.5, rate: 33 },
        { item: 'GENERAL', qty: 1249.9, rate: 39 },
      ] },
      { date: '2026-04-22', inv: '15', lines: [
        { item: 'BLACK', qty: 414.7, rate: 32 },
        { item: 'BLACK', qty: 459.8, rate: 32 },
      ] },
      { date: '2026-05-04', inv: '16', lines: [
        { item: 'BLACK', qty: 407.6, rate: 32 },
        { item: 'BLACK', qty: 458.4, rate: 32 },
      ] },
      { date: '2026-05-15', inv: '17', lines: [{ item: '72/52', qty: 837.5, rate: 33.9 }] },
      { date: '2026-05-21', inv: '18', lines: [{ item: 'DRILL', qty: 751, rate: 38 }] },
      { date: '2026-05-28', inv: '19', lines: [{ item: '72/52', qty: 875.6, rate: 33.9 }] },
    ],
    payments: [
      { date: '2026-01-18', amount: 29158 },
      { date: '2026-02-06', amount: 27652 },
      { date: '2026-02-20', amount: 33864 },
      { date: '2026-02-23', amount: 26390 },
      { date: '2026-03-03', amount: 50318, ref: 'bill 6/7' },
      { date: '2026-03-27', amount: 42500, ref: 'BILL 8' },
      { date: '2026-04-20', amount: 45800, ref: 'BILL 9/10' },
      { date: '2026-05-08', amount: 30000, ref: 'BILL 11' },
      { date: '2026-05-16', amount: 51800, ref: 'BILL 13' },
    ],
  },

  polybag: {
    supplier: '',
    openingBalance: 0, // all polybag activity is Jan 2026 onward
    masters: [
      { name: 'ADAM POLY PRINTED', rate: 3 },
      { name: 'BLU WAVE POLY PRINTED', rate: 1.9 },
    ],
    openingStock: [],
    purchases: [
      { date: '2026-01-19', inv: '43', lines: [{ item: 'ADAM POLY PRINTED', qty: 6300, rate: 2.4 }] },
      { date: '2026-02-02', inv: '43', lines: [{ item: 'ADAM POLY PRINTED', qty: 10850, rate: 2.4 }] },
      { date: '2026-02-02', inv: '44', lines: [{ item: 'BLU WAVE POLY PRINTED', qty: 11180, rate: 1.9 }] },
      { date: '2026-03-02', inv: '43', lines: [{ item: 'ADAM POLY PRINTED', qty: 15050, rate: 3.15 }] },
      { date: '2026-05-28', inv: '43', lines: [{ item: 'ADAM POLY PRINTED', qty: 14900, rate: 3 }] },
    ],
    payments: [
      { date: '2026-02-11', amount: 41150 },
      { date: '2026-03-09', amount: 21242 },
      { date: '2026-04-13', amount: 44000 },
    ],
  },
};

(async () => {
  if (!MONGO_URI) { console.error('No MONGO_URI. Pass it as an argument or set the env var.'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const user = (await User.findOne({ role: 'admin' })) || (await User.findOne());
  if (!user) { console.error('No User found to attribute records to.'); process.exit(1); }

  await accessoryService.seedAccessoryTypes();

  const clientCache = new Map();
  const resolveClient = async (name) => {
    if (!name) return null;
    if (clientCache.has(name)) return clientCache.get(name);
    const c = await Client.findOne({ name: new RegExp(`^${name}$`, 'i') });
    const id = c ? c._id : null;
    if (!c) console.warn(`  ! Client "${name}" not found — leaving item general.`);
    clientCache.set(name, id);
    return id;
  };

  for (const [key, cfg] of Object.entries(DATA)) {
    const type = await AccessoryType.findOne({ key });
    if (!type) { console.warn(`Type "${key}" missing — skipped.`); continue; }
    console.log(`=== ${type.name} ===`);

    // 1. Upsert masters → name→item map
    const itemMap = new Map();
    for (const m of cfg.masters) {
      const clientId = await resolveClient(m.client);
      const item = await AccessoryItem.findOneAndUpdate(
        { accessoryTypeId: type._id, name: m.name },
        { $set: { rate: m.rate || 0, subType: m.subType || null, clientId }, $setOnInsert: { isActive: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      itemMap.set(m.name, item);
    }
    const lineFor = (item, qty, rate) => {
      const m = itemMap.get(item);
      if (!m) throw new Error(`Item "${item}" not defined for ${key}`);
      return { accessoryItemId: m._id, nameSnapshot: m.name, qty: Number(qty), rate: Number(rate), amount: round2(qty * rate) };
    };

    // 2. Clear prior seeded purchases/payments for this type, then re-insert.
    await AccessoryPurchase.deleteMany({ accessoryTypeId: type._id, notes: { $regex: 'SEED' } });
    await AccessoryPayment.deleteMany({ accessoryTypeId: type._id, notes: { $regex: 'SEED' } });

    let stockQty = 0, totPurch = 0, totPay = 0;

    // 2a. Opening-stock snapshot (rate 0) — zipper only.
    const stockLines = (cfg.openingStock || []).filter(s => Number(s.qty) > 0).map(s => lineFor(s.item, s.qty, 0));
    if (stockLines.length) {
      stockQty = stockLines.reduce((sum, l) => sum + l.qty, 0);
      await AccessoryPurchase.create({
        accessoryTypeId: type._id, date: OPENING_DATE, vendorInvoiceNumber: '', supplier: '',
        lines: stockLines, totalQty: stockQty, totalAmount: 0, notes: `${SEED_TAG} opening stock`, createdBy: user._id,
      });
    }

    // 2b. Historical purchases.
    for (const p of (cfg.purchases || [])) {
      const lines = p.lines.map(l => lineFor(l.item, l.qty, l.rate));
      const totalQty = round2(lines.reduce((s, l) => s + l.qty, 0));
      const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
      totPurch += totalAmount;
      await AccessoryPurchase.create({
        accessoryTypeId: type._id, date: d(p.date), vendorInvoiceNumber: p.inv || '', supplier: cfg.supplier || '',
        lines, totalQty, totalAmount, notes: SEED_TAG, createdBy: user._id,
      });
    }

    // 2c. Historical payments.
    for (const pay of (cfg.payments || [])) {
      totPay += pay.amount;
      await AccessoryPayment.create({
        accessoryTypeId: type._id, paymentType: 'payment', amount: pay.amount, paymentDate: d(pay.date),
        paymentMode: pay.mode || 'cash', referenceNumber: pay.ref || '', notes: SEED_TAG, createdBy: user._id,
      });
    }

    // 3. Opening balance, then recompute (balance due = opening + purchased − paid).
    await AccessoryBalance.findOneAndUpdate(
      { accessoryTypeId: type._id }, { $set: { openingBalance: cfg.openingBalance || 0 } }, { upsert: true, new: true }
    );
    const bal = await accessoryService.updateAccessoryBalance(type._id);

    console.log(`  masters: ${cfg.masters.length}`);
    if (stockQty) console.log(`  opening stock: ${stockQty} ${type.unit}`);
    console.log(`  purchases: ${(cfg.purchases || []).length} (Rs. ${round2(totPurch)})`);
    console.log(`  payments:  ${(cfg.payments || []).length} (Rs. ${round2(totPay)})`);
    console.log(`  opening balance: Rs. ${round2(cfg.openingBalance || 0)}`);
    console.log(`  balance due: Rs. ${round2(bal.remainingBalance)}\n`);
  }

  console.log('Done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
