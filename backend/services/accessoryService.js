// Accessory / Stock Management service.
// Two denormalized aggregates, both fed by AccessoryPurchase:
//   • MONEY (AccessoryBalance, per type)  = opening + Σ purchases − Σ payments − Σ adjustments
//   • STOCK (computed on read, per item)  = Σ purchase-line qty − Σ consumption qty
// Mirrors the vendorBalanceService / clientBalanceService denormalization pattern.

const mongoose = require('mongoose');
const {
  AccessoryType,
  AccessoryItem,
  AccessoryPurchase,
  AccessoryPayment,
  AccessoryPaymentHistory,
  AccessoryBalance,
  AccessoryConsumption
} = require('../mongodb_schema');

// The canonical seed of article types. `key` drives behaviour (consumption stage),
// so adding a row here (or via DB) extends the module. Idempotent.
const DEFAULT_ACCESSORY_TYPES = [
  { key: 'zipper',    name: 'Zipper',    unit: 'pcs', consumptionStage: 'stitching', sortOrder: 1 },
  { key: 'button',    name: 'Button',    unit: 'pcs', consumptionStage: 'finishing', sortOrder: 2 },
  { key: 'label-tag', name: 'Label-Tag', unit: 'pcs', consumptionStage: 'finishing', sortOrder: 3 },
  { key: 'pocketing', name: 'Pocketing', unit: 'mtr', consumptionStage: 'finishing', sortOrder: 4 },
  { key: 'polybag',   name: 'Polybag',   unit: 'pcs', consumptionStage: 'finishing', sortOrder: 5 }
];

// Seed the article types if missing. Safe + idempotent + race-safe to call on every
// request. Because server.js runs with autoIndex:false, the unique `key` index isn't
// auto-built, so an earlier double-seed (two parallel requests) could insert dupes.
// This self-heals: dedupe → ensure unique index → upsert the canonical set.
let typeIndexEnsured = false;
const seedAccessoryTypes = async () => {
  // 1. Remove duplicate types, keeping the earliest _id per key.
  const dupes = await AccessoryType.aggregate([
    { $group: { _id: '$key', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  for (const d of dupes) {
    const ids = [...d.ids].sort((a, b) => String(a).localeCompare(String(b)));
    await AccessoryType.deleteMany({ _id: { $in: ids.slice(1) } });
  }

  // 2. Guarantee the unique key index (idempotent; only mark done on success).
  if (!typeIndexEnsured) {
    try {
      await AccessoryType.collection.createIndex({ key: 1 }, { unique: true });
      typeIndexEnsured = true;
    } catch (e) { /* will retry next call */ }
  }

  // 3. Upsert the canonical set — with the unique index, concurrent callers are safe.
  const ops = DEFAULT_ACCESSORY_TYPES.map(t => ({
    updateOne: { filter: { key: t.key }, update: { $setOnInsert: t }, upsert: true }
  }));
  try {
    await AccessoryType.bulkWrite(ops, { ordered: false });
  } catch (e) { /* ignore dup-key races */ }
};

// Recompute the per-type money balance from the purchase + payment ledgers.
// Call after every purchase/payment create/update/delete.
const updateAccessoryBalance = async (accessoryTypeId) => {
  const [purchaseAgg] = await AccessoryPurchase.aggregate([
    { $match: { accessoryTypeId: new mongoose.Types.ObjectId(accessoryTypeId) } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  const totalPurchased = purchaseAgg ? purchaseAgg.total : 0;

  const paymentAgg = await AccessoryPayment.aggregate([
    { $match: { accessoryTypeId: new mongoose.Types.ObjectId(accessoryTypeId) } },
    { $group: { _id: '$paymentType', total: { $sum: '$amount' } } }
  ]);
  let totalPaid = 0;
  let totalAdjustment = 0;
  for (const row of paymentAgg) {
    if (row._id === 'payment') totalPaid = row.total;
    else if (row._id === 'adjustment') totalAdjustment = row.total;
  }

  let balance = await AccessoryBalance.findOne({ accessoryTypeId });
  if (!balance) balance = new AccessoryBalance({ accessoryTypeId });
  balance.totalPurchased = totalPurchased;
  balance.totalPaid = totalPaid;
  balance.totalAdjustment = totalAdjustment;
  balance.remainingBalance = (balance.openingBalance || 0) + totalPurchased - totalPaid - totalAdjustment;
  balance.lastUpdated = new Date();
  await balance.save();
  return balance;
};

const getAccessoryBalance = async (accessoryTypeId) => {
  let balance = await AccessoryBalance.findOne({ accessoryTypeId });
  if (!balance) balance = await updateAccessoryBalance(accessoryTypeId);
  return balance;
};

// Per-item stock for a type: purchased qty − consumed qty → availableQty.
// Computed on read (no denormalization → no drift). Returns one row per active item,
// plus any inactive item that still carries stock movement.
const getAccessoryStock = async (accessoryTypeId) => {
  const typeObjId = new mongoose.Types.ObjectId(accessoryTypeId);

  const items = await AccessoryItem.find({ accessoryTypeId })
    .populate('clientId', 'name clientCode')
    .sort({ name: 1 })
    .lean();

  const purchaseAgg = await AccessoryPurchase.aggregate([
    { $match: { accessoryTypeId: typeObjId } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.accessoryItemId', qty: { $sum: '$lines.qty' }, amount: { $sum: '$lines.amount' } } }
  ]);
  const purchasedByItem = new Map(purchaseAgg.map(r => [String(r._id), r]));

  const consumeAgg = await AccessoryConsumption.aggregate([
    { $match: { accessoryTypeId: typeObjId } },
    { $group: { _id: '$accessoryItemId', qty: { $sum: '$qty' } } }
  ]);
  const consumedByItem = new Map(consumeAgg.map(r => [String(r._id), r.qty]));

  const rows = items.map(item => {
    const purchased = purchasedByItem.get(String(item._id));
    const purchasedQty = purchased ? purchased.qty : 0;
    const consumedQty = consumedByItem.get(String(item._id)) || 0;
    return {
      _id: item._id,
      name: item.name,
      rate: item.rate,
      subType: item.subType,
      isActive: item.isActive,
      client: item.clientId ? { _id: item.clientId._id, name: item.clientId.name, clientCode: item.clientId.clientCode } : null,
      purchasedQty,
      consumedQty,
      availableQty: purchasedQty - consumedQty
    };
  });

  const totals = rows.reduce((acc, r) => {
    acc.purchasedQty += r.purchasedQty;
    acc.consumedQty += r.consumedQty;
    acc.availableQty += r.availableQty;
    return acc;
  }, { purchasedQty: 0, consumedQty: 0, availableQty: 0 });

  return { items: rows, totals };
};

// Top-card summary: available qty per article type (sum across that type's items).
const getStockSummary = async () => {
  const types = await AccessoryType.find().sort({ sortOrder: 1 }).lean();

  const purchaseAgg = await AccessoryPurchase.aggregate([
    { $group: { _id: '$accessoryTypeId', qty: { $sum: '$totalQty' } } }
  ]);
  const purchasedByType = new Map(purchaseAgg.map(r => [String(r._id), r.qty]));

  const consumeAgg = await AccessoryConsumption.aggregate([
    { $group: { _id: '$accessoryTypeId', qty: { $sum: '$qty' } } }
  ]);
  const consumedByType = new Map(consumeAgg.map(r => [String(r._id), r.qty]));

  return types.map(t => {
    const purchasedQty = purchasedByType.get(String(t._id)) || 0;
    const consumedQty = consumedByType.get(String(t._id)) || 0;
    return {
      _id: t._id,
      key: t.key,
      name: t.name,
      unit: t.unit,
      consumptionStage: t.consumptionStage,
      purchasedQty,
      consumedQty,
      availableQty: purchasedQty - consumedQty
    };
  });
};

// Applicable items for a client at a stage. If the client has any mapped items for
// the type, return ONLY those; otherwise fall back to the general (clientId null)
// items "common for all". (Spec: zipper consumption mapping rule.)
const getApplicableItems = async (accessoryTypeId, clientId) => {
  const base = { accessoryTypeId, isActive: true };
  if (clientId) {
    const clientItems = await AccessoryItem.find({ ...base, clientId }).sort({ name: 1 }).lean();
    if (clientItems.length > 0) return clientItems;
  }
  return AccessoryItem.find({ ...base, clientId: null }).sort({ name: 1 }).lean();
};

// Types consumed at the Finishing stage. Pocketing is excluded by design — it's stocked
// in metres (purchases/payments only), not deducted per finished piece.
const FINISHING_CONSUMABLE_KEYS = ['button', 'label-tag', 'polybag'];

// Build the consumption "slots" shown on the Finishing form. Each slot offers ALL active
// items of that type (every client + general), because a single lot can be split across
// multiple clients' stock and general in one consumption set. `defaultItemId` is the lot
// client's item (else general, else first) used to pre-fill the first row.
//   • Label-Tag → TWO slots: Label (×1) + Tag (×1), consumed together per piece.
//   • Button    → ONE Button slot. Rivets are NOT a slot — they're derived automatically
//     at 4× the total buttons against the default rivet item (carried on the group's
//     `rivet` field). 1 button + 4 rivets per jeans.
// Only slots that actually have items are returned.
const getFinishingConsumableGroups = async (clientId) => {
  const types = await AccessoryType.find({ key: { $in: FINISHING_CONSUMABLE_KEYS }, isActive: true })
    .sort({ sortOrder: 1 }).lean();
  const matchesClient = (i) => clientId && String(i.clientId?._id || i.clientId || '') === String(clientId);
  const defaultOf = (arr) => arr.find(matchesClient) || arr.find(i => !i.clientId) || arr[0];
  const groups = [];
  for (const t of types) {
    const items = await AccessoryItem.find({ accessoryTypeId: t._id, isActive: true })
      .populate('clientId', 'name clientCode')
      .sort({ name: 1 }).lean();

    const pushGroup = (slot, label, slotItems, extra = {}) => {
      if (!slotItems.length) return;
      const def = defaultOf(slotItems);
      groups.push({ typeId: t._id, typeKey: t.key, slot, label, unit: t.unit, multiplier: 1, items: slotItems, defaultItemId: def ? String(def._id) : '', ...extra });
    };

    if (t.key === 'button') {
      const rivetItems = items.filter(i => i.subType === 'rivet');
      const rivetDef = rivetItems.length ? defaultOf(rivetItems) : null;
      // Single Button slot; rivets auto-derived at 4× against the default rivet item.
      pushGroup('button', 'Button', items.filter(i => i.subType !== 'rivet'), {
        rivet: rivetDef ? { itemId: String(rivetDef._id), name: rivetDef.name, multiplier: 4 } : null,
      });
    } else if (t.key === 'label-tag') {
      pushGroup('label', 'Label', items.filter(i => i.subType !== 'tag')); // null/label → label slot
      pushGroup('tag', 'Tag', items.filter(i => i.subType === 'tag'));
    } else {
      pushGroup('', t.name, items);
    }
  }
  return groups;
};

// Replace the finishing-stage consumption for a lot with a fresh allocation set. Each
// allocation is { accessoryItemId, qty }; the item's type/name/client are resolved here
// so the consumption rows are self-describing. Session-aware for the create transaction.
const replaceFinishingConsumption = async (lotId, allocations, userId, session = null) => {
  const opts = session ? { session } : {};
  await AccessoryConsumption.deleteMany({ lotId, stage: 'finishing' }, opts);

  const valid = (allocations || []).filter(a => a.accessoryItemId && Number(a.qty) > 0);
  if (valid.length === 0) return [];

  const items = await AccessoryItem.find({ _id: { $in: valid.map(a => a.accessoryItemId) } }).lean();
  const itemMap = new Map(items.map(i => [String(i._id), i]));

  const rows = [];
  for (const a of valid) {
    const item = itemMap.get(String(a.accessoryItemId));
    if (!item) continue;
    rows.push({
      accessoryTypeId: item.accessoryTypeId,
      accessoryItemId: item._id,
      nameSnapshot: item.name,
      lotId,
      stage: 'finishing',
      qty: Number(a.qty),
      clientLinked: !!item.clientId,
      createdBy: userId,
      date: new Date(),
      createdAt: new Date(),
    });
  }
  if (rows.length === 0) return [];
  return AccessoryConsumption.create(rows, session ? { session, ordered: true } : {});
};

// Replace the consumption rows for one (lotId, stage) with a fresh set. Used by the
// Stitching/Finishing controllers so editing a record re-derives stock cleanly.
// Session-aware so it can run inside the stitching create transaction.
const replaceConsumption = async ({ accessoryTypeId, lotId, stage, items, userId }, session = null) => {
  const opts = session ? { session } : {};
  await AccessoryConsumption.deleteMany({ lotId, stage }, opts);

  const rows = (items || [])
    .filter(i => i.accessoryItemId && Number(i.qty) > 0)
    .map(i => ({
      accessoryTypeId,
      accessoryItemId: i.accessoryItemId,
      nameSnapshot: i.nameSnapshot,
      lotId,
      stage,
      qty: Number(i.qty),
      clientLinked: !!i.clientLinked,
      createdBy: userId,
      date: new Date(),
      createdAt: new Date()
    }));

  if (rows.length === 0) return [];
  return AccessoryConsumption.create(rows, session ? { session, ordered: true } : {});
};

const recordPaymentHistory = async (entryId, accessoryTypeId, paymentType, action, beforeData, afterData, userId) => {
  const historyEntry = new AccessoryPaymentHistory({
    entryId, accessoryTypeId, action, paymentType,
    beforeData: beforeData || null,
    afterData: afterData || null,
    changedBy: userId
  });
  await historyEntry.save();
  return historyEntry;
};

const getPaymentHistory = async (entryId) => {
  return AccessoryPaymentHistory.find({ entryId })
    .populate('changedBy', 'username email')
    .sort({ createdAt: -1 });
};

module.exports = {
  DEFAULT_ACCESSORY_TYPES,
  seedAccessoryTypes,
  updateAccessoryBalance,
  getAccessoryBalance,
  getAccessoryStock,
  getStockSummary,
  getApplicableItems,
  replaceConsumption,
  FINISHING_CONSUMABLE_KEYS,
  getFinishingConsumableGroups,
  replaceFinishingConsumption,
  recordPaymentHistory,
  getPaymentHistory
};
