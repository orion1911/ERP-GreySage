/**
 * Seed Accessory masters + CURRENT opening stock + opening balance.
 *
 * Go-live decision (2026-06): the accessory system starts fresh from 1 Jun 2026.
 * Existing/past lots are NOT backfilled with consumption, so seeding the old Jan–May
 * purchases (stock-in) would overstate available stock. Instead, for every type we seed:
 *   • masters (the lookup items),
 *   • a single OPENING STOCK entry (rate 0, dated 1-Jun-2026) = current on-hand per item,
 *   • an OPENING BALANCE (money currently outstanding to the supplier).
 * No historical purchase/payment rows. Purchases/consumption accrue from June onward.
 *
 * Run from backend/:
 *   node migrations/seed-accessory-data.js
 *   node migrations/seed-accessory-data.js "mongodb://.../sales_accounting?replicaSet=rs0&authSource=admin"
 *
 * Idempotent + self-cleaning: deletes ANY prior seeded purchases/payments (notes containing
 * "SEED") per type before inserting, so re-running removes the earlier Jan–May seed and
 * won't touch records entered through the UI. Masters are upserted by name.
 *
 * ── TODO before running ──────────────────────────────────────────────────────
 * Fill in the real current on-hand quantities under each type's `openingStock` (the
 * qty values marked /* TODO *\/). Zipper is already filled from the 1-Jun snapshot.
 * Confirm the `openingBalance` (outstanding owed) per type — defaults below are the
 * reconciled closing balances from the spreadsheet.
 */

const mongoose = require('mongoose');
const {
  AccessoryType, AccessoryItem, AccessoryPurchase, AccessoryPayment, AccessoryBalance, Client, User
} = require('../mongodb_schema');
const accessoryService = require('../services/accessoryService');

const MONGO_URI = process.argv[2] || process.env.MONGO_URI;
const OPENING_DATE = new Date('2026-06-01T00:00:00.000Z');
const SEED_TAG = 'SEED-OPENING-JUN2026';

// masters:      { name, rate, subType?, client? }   client = Client name to resolve (or omit)
// openingStock: { item, qty }                        item = a master name; seeded rate 0
// openingBalance: number                             money currently outstanding to supplier
const DATA = {
  zipper: {
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
  },

  'label-tag': {
    openingBalance: 74515.60, // reconciled closing balance — confirm
    masters: [
      { name: 'ADAM LABEL NON TEARABLE KHAKI', rate: 3.75, subType: 'label' },
      { name: 'ATTOM LABEL NON TEARABLE KHAKI', rate: 3.25, subType: 'label' },
      { name: 'BLU WAVE LABEL NON TEARABLE KHAKI', rate: 3.25, subType: 'label' },
      { name: 'ADAM HANG TAGS PLASTIC BLACK', rate: 3, subType: 'tag' },
      { name: 'BLU WAVE HANG TAG', rate: 4.5, subType: 'tag' },
    ],
    openingStock: [
      { item: 'ADAM LABEL NON TEARABLE KHAKI', qty: 0 },     /* TODO current on-hand */
      { item: 'ATTOM LABEL NON TEARABLE KHAKI', qty: 0 },    /* TODO */
      { item: 'BLU WAVE LABEL NON TEARABLE KHAKI', qty: 0 }, /* TODO */
      { item: 'ADAM HANG TAGS PLASTIC BLACK', qty: 0 },      /* TODO */
      { item: 'BLU WAVE HANG TAG', qty: 0 },                 /* TODO */
    ],
  },

  pocketing: {
    openingBalance: 205759.29, // reconciled closing balance — confirm
    masters: [
      { name: 'BLACK', rate: 32 },
      { name: '72/52', rate: 33.9 },
      { name: 'DRILL', rate: 37 },
      { name: 'TWILL', rate: 36 },
      { name: '68/68', rate: 34 },
      { name: 'GENERAL', rate: 0 },
    ],
    // Pocketing is not consumed at finishing (metres) — opening stock optional.
    openingStock: [
      // { item: 'BLACK', qty: 0 }, /* add metres on-hand if you want to track them */
    ],
  },

  polybag: {
    openingBalance: 48117.50, // reconciled closing balance — confirm
    masters: [
      { name: 'ADAM POLY PRINTED', rate: 3 },
      { name: 'BLU WAVE POLY PRINTED', rate: 1.9 },
    ],
    openingStock: [
      { item: 'ADAM POLY PRINTED', qty: 0 },    /* TODO current on-hand */
      { item: 'BLU WAVE POLY PRINTED', qty: 0 }, /* TODO */
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

    // 2. Remove ANY previously-seeded purchase/payment rows for this type (cleans the old
    //    Jan–May seed), then seed a single rate-0 opening-stock entry (no payments).
    await AccessoryPurchase.deleteMany({ accessoryTypeId: type._id, notes: { $regex: 'SEED' } });
    await AccessoryPayment.deleteMany({ accessoryTypeId: type._id, notes: { $regex: 'SEED' } });

    const lines = (cfg.openingStock || [])
      .filter(s => Number(s.qty) > 0)
      .map(s => {
        const item = itemMap.get(s.item);
        if (!item) throw new Error(`Opening-stock item "${s.item}" not defined for ${key}`);
        return { accessoryItemId: item._id, nameSnapshot: item.name, qty: Number(s.qty), rate: 0, amount: 0 };
      });

    let stockQty = 0;
    if (lines.length) {
      stockQty = lines.reduce((sum, l) => sum + l.qty, 0);
      await AccessoryPurchase.create({
        accessoryTypeId: type._id,
        date: OPENING_DATE,
        vendorInvoiceNumber: '',
        supplier: '',
        lines,
        totalQty: stockQty,
        totalAmount: 0,
        notes: `${SEED_TAG} opening stock`,
        createdBy: user._id,
      });
    }

    // 3. Carry the opening money balance, then recompute (purchases/payments are now empty,
    //    so balance due == openingBalance).
    await AccessoryBalance.findOneAndUpdate(
      { accessoryTypeId: type._id },
      { $set: { openingBalance: cfg.openingBalance || 0 } },
      { upsert: true, new: true }
    );
    const bal = await accessoryService.updateAccessoryBalance(type._id);

    console.log(`  masters: ${cfg.masters.length}`);
    console.log(`  opening stock: ${stockQty} ${type.unit} across ${lines.length} item(s)`);
    console.log(`  opening balance / balance due: Rs. ${Math.round((bal.remainingBalance) * 100) / 100}\n`);
  }

  console.log('Done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
