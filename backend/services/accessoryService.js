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
  AccessoryConsumption,
  AccessoryVendorReturn,
  Finishing,
  Lot
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
const getAccessoryStock = async (accessoryTypeId, clientId) => {
  const typeObjId = new mongoose.Types.ObjectId(accessoryTypeId);

  // Optional client filter: '' = all, 'general' = unassigned, <id> = that client.
  const itemFilter = { accessoryTypeId };
  if (clientId === 'general') itemFilter.clientId = null;
  else if (clientId) itemFilter.clientId = clientId;

  const items = await AccessoryItem.find(itemFilter)
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

  // Finishing-vendor returns add stock back: net consumed = gross consumed − returned, so
  // availableQty = opening + purchased − consumed + returned (and available = in − out holds).
  const returnAgg = await AccessoryVendorReturn.aggregate([
    { $match: { accessoryTypeId: typeObjId } },
    { $group: { _id: '$accessoryItemId', qty: { $sum: '$qty' } } }
  ]);
  const returnedByItem = new Map(returnAgg.map(r => [String(r._id), r.qty]));

  const rows = items.map(item => {
    const purchased = purchasedByItem.get(String(item._id));
    const purchasedQty = purchased ? purchased.qty : 0;
    const returnedQty = returnedByItem.get(String(item._id)) || 0;
    const consumedQty = (consumedByItem.get(String(item._id)) || 0) - returnedQty; // net of returns
    const openingQty = item.openingStock || 0;
    return {
      _id: item._id,
      name: item.name,
      rate: item.rate,
      subType: item.subType,
      isActive: item.isActive,
      openingStock: openingQty,
      monitorLowStock: !!item.monitorLowStock,
      reorderLevel: item.reorderLevel || 0,
      client: item.clientId ? { _id: item.clientId._id, name: item.clientId.name, clientCode: item.clientId.clientCode } : null,
      purchasedQty,
      consumedQty,
      availableQty: openingQty + purchasedQty - consumedQty
    };
  });

  const totals = rows.reduce((acc, r) => {
    acc.openingStock += r.openingStock;
    acc.purchasedQty += r.purchasedQty;
    acc.consumedQty += r.consumedQty;
    acc.availableQty += r.availableQty;
    return acc;
  }, { openingStock: 0, purchasedQty: 0, consumedQty: 0, availableQty: 0 });

  return { items: rows, totals };
};

// Top-card summary: available qty per article type, computed per-item (so it can be
// filtered by client and split by sub-type). For the Button type, `availableQty` is the
// BUTTON-only count and `rivetAvailable` is the rivet sub-count.
// clientId: '' = all, 'general' = unassigned, <id> = that client.
const getStockSummary = async (clientId) => {
  const types = await AccessoryType.find().sort({ sortOrder: 1 }).lean();

  const itemFilter = {};
  if (clientId === 'general') itemFilter.clientId = null;
  else if (clientId) itemFilter.clientId = clientId;
  const items = await AccessoryItem.find(itemFilter, '_id accessoryTypeId subType openingStock').lean();
  const itemIds = items.map(i => i._id);

  let purchasedByItem = new Map();
  let consumedByItem = new Map();
  let returnedByItem = new Map();
  if (itemIds.length) {
    const purchaseAgg = await AccessoryPurchase.aggregate([
      { $unwind: '$lines' },
      { $match: { 'lines.accessoryItemId': { $in: itemIds } } },
      { $group: { _id: '$lines.accessoryItemId', qty: { $sum: '$lines.qty' } } }
    ]);
    purchasedByItem = new Map(purchaseAgg.map(r => [String(r._id), r.qty]));
    const consumeAgg = await AccessoryConsumption.aggregate([
      { $match: { accessoryItemId: { $in: itemIds } } },
      { $group: { _id: '$accessoryItemId', qty: { $sum: '$qty' } } }
    ]);
    consumedByItem = new Map(consumeAgg.map(r => [String(r._id), r.qty]));
    // Returns add stock back — netted into consumed below so available = in − out.
    const returnAgg = await AccessoryVendorReturn.aggregate([
      { $match: { accessoryItemId: { $in: itemIds } } },
      { $group: { _id: '$accessoryItemId', qty: { $sum: '$qty' } } }
    ]);
    returnedByItem = new Map(returnAgg.map(r => [String(r._id), r.qty]));
  }

  const byType = new Map();
  for (const it of items) {
    const purchased = purchasedByItem.get(String(it._id)) || 0;
    const consumed = (consumedByItem.get(String(it._id)) || 0) - (returnedByItem.get(String(it._id)) || 0); // net of returns
    const avail = (it.openingStock || 0) + purchased - consumed;
    const k = String(it.accessoryTypeId);
    if (!byType.has(k)) byType.set(k, { available: 0, rivet: 0, purchased: 0, consumed: 0 });
    const agg = byType.get(k);
    agg.available += avail;
    agg.purchased += purchased;
    agg.consumed += consumed;
    if (it.subType === 'rivet') agg.rivet += avail;
  }

  return types.map(t => {
    const agg = byType.get(String(t._id)) || { available: 0, rivet: 0, purchased: 0, consumed: 0 };
    const isButton = t.key === 'button';
    return {
      _id: t._id,
      key: t.key,
      name: t.name,
      unit: t.unit,
      consumptionStage: t.consumptionStage,
      purchasedQty: agg.purchased,
      consumedQty: agg.consumed,
      availableQty: isButton ? (agg.available - agg.rivet) : agg.available, // button-only for the Button card
      rivetAvailable: isButton ? agg.rivet : undefined,                     // rivet sub-count
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
      const cid = (i) => (i.clientId ? String(i.clientId._id || i.clientId) : null);
      // Single Button slot; rivets auto-derived at 4× buttons. `rivet` is the default item; `rivetItems`
      // lists every rivet item with its client so the modal can route each button line's rivets to that
      // line's client rivet item (client-inscribed), falling back to the general/default rivet.
      pushGroup('button', 'Button', items.filter(i => i.subType !== 'rivet'), {
        rivet: rivetDef ? { itemId: String(rivetDef._id), name: rivetDef.name, multiplier: 4 } : null,
        rivetItems: rivetItems.map(r => ({ itemId: String(r._id), name: r.name, clientId: cid(r) })),
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
// allocation is { accessoryItemId, qty, basisPcs? }; the item's type/name/client are resolved here
// so the consumption rows are self-describing. basisPcs = pcs this line covers (its client's share).
// Session-aware for the create transaction.
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
    const basis = Number(a.basisPcs);
    rows.push({
      accessoryTypeId: item.accessoryTypeId,
      accessoryItemId: item._id,
      nameSnapshot: item.name,
      lotId,
      stage: 'finishing',
      qty: Number(a.qty),
      basisPcs: (Number.isFinite(basis) && basis >= 0) ? basis : undefined,
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

// Low-stock items for the alert digest. Reuses the per-item available math from
// getStockSummary, then applies the monitoring rule:
//   effectiveLevel = item.reorderLevel>0 ? item.reorderLevel : (type.reorderLevel||0)
//   low = type.monitorLowStock && item.monitorLowStock && effectiveLevel>0 && available<=effectiveLevel
// Returns one row per low item: { itemId, name, typeName, unit, availableQty, effectiveLevel, clientName }.
const getLowStockItems = async () => {
  const types = await AccessoryType.find().lean();
  const typeById = new Map(types.map(t => [String(t._id), t]));

  // Only consider items whose type is monitored AND that are themselves monitored.
  // Type defaults to monitored (schema default true); only an explicit false excludes it.
  // Items are opt-in (default false), so nothing fires until an item is explicitly flagged.
  const monitoredTypeIds = types.filter(t => t.monitorLowStock !== false).map(t => t._id);
  if (!monitoredTypeIds.length) return [];

  const items = await AccessoryItem.find({
    accessoryTypeId: { $in: monitoredTypeIds },
    monitorLowStock: true
  }).populate('clientId', 'name').lean();
  if (!items.length) return [];

  const itemIds = items.map(i => i._id);
  const purchaseAgg = await AccessoryPurchase.aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.accessoryItemId': { $in: itemIds } } },
    { $group: { _id: '$lines.accessoryItemId', qty: { $sum: '$lines.qty' } } }
  ]);
  const purchasedByItem = new Map(purchaseAgg.map(r => [String(r._id), r.qty]));
  const consumeAgg = await AccessoryConsumption.aggregate([
    { $match: { accessoryItemId: { $in: itemIds } } },
    { $group: { _id: '$accessoryItemId', qty: { $sum: '$qty' } } }
  ]);
  const consumedByItem = new Map(consumeAgg.map(r => [String(r._id), r.qty]));

  const low = [];
  for (const item of items) {
    const type = typeById.get(String(item.accessoryTypeId));
    if (!type) continue;
    const effectiveLevel = item.reorderLevel > 0 ? item.reorderLevel : (type.reorderLevel || 0);
    if (effectiveLevel <= 0) continue; // no threshold set anywhere → not monitored
    const purchased = purchasedByItem.get(String(item._id)) || 0;
    const consumed = consumedByItem.get(String(item._id)) || 0;
    const availableQty = (item.openingStock || 0) + purchased - consumed;
    if (availableQty <= effectiveLevel) {
      low.push({
        itemId: item._id,
        name: item.name,
        typeName: type.name,
        unit: type.unit || 'pcs',
        availableQty,
        effectiveLevel,
        clientName: item.clientId ? item.clientId.name : null
      });
    }
  }
  low.sort((a, b) => a.typeName.localeCompare(b.typeName) || a.name.localeCompare(b.name));
  return low;
};

// ─── Finishing Vendor Extras ─────────────────────────────────────────────────
// Per finishing vendor + accessory item, how much extra buffer stock the vendor still holds:
//   sent       = Σ finishing-stage AccessoryConsumption.qty on that vendor's lots
//   needed     = Σ (basis × ratio)   basis = Finishing.accessoryBasisPcs ?? quantity; ratio: rivet ×4, else ×1
//              basis lets lots whose accessories cover only part of the lot (pre-tracking or partial
//              finish) compute needed against the covered pcs instead of the full finishing quantity.
//   grossExtra = sent − needed
//   returned   = Σ AccessoryVendorReturn.qty (that vendor + item)
//   netHeld    = grossExtra − returned            ← headline
// All-time cumulative; under-sent future lots make (sent−needed) negative → self-reconciles.
const RIVET_RATIO = 4;
const ratioForSubType = (subType) => (subType === 'rivet' ? RIVET_RATIO : 1);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const getFinishingVendorExtras = async () => {
  const [finishings, cons, returns] = await Promise.all([
    Finishing.find({}, 'lotId vendorId quantity accessoryBasisPcs').populate('vendorId', 'name').lean(),
    AccessoryConsumption.find({ stage: 'finishing' }).lean(),
    AccessoryVendorReturn.find({}).populate('vendorId', 'name').lean(),
  ]);
  if (!cons.length && !returns.length) return [];

  // lot → finishing vendor(s). One vendor per lot is the norm; a multi-vendor lot splits its
  // (lot-level) consumption across vendors proportionally to each vendor's finished qty.
  const lotVendors = new Map();
  for (const f of finishings) {
    const key = String(f.lotId);
    if (!lotVendors.has(key)) lotVendors.set(key, []);
    lotVendors.get(key).push({
      vendorId: f.vendorId ? String(f.vendorId._id) : 'unassigned',
      vendorName: f.vendorId ? f.vendorId.name : 'Unassigned',
      finishedQty: Number(f.quantity) || 0,
      // pcs the accessories cover (needed basis); falls back to full finished qty when unset.
      basisPcs: (f.accessoryBasisPcs != null ? Number(f.accessoryBasisPcs) : (Number(f.quantity) || 0)),
    });
  }

  // Batch item / type / lot metadata across BOTH consumption and returns (no N+1).
  const itemIds = [...new Set([...cons, ...returns].map(r => String(r.accessoryItemId)))];
  const items = await AccessoryItem.find({ _id: { $in: itemIds } }, '_id subType accessoryTypeId name').lean();
  const itemMap = new Map(items.map(i => [String(i._id), i]));
  const typeIds = [...new Set(items.map(i => String(i.accessoryTypeId)))];
  const types = await AccessoryType.find({ _id: { $in: typeIds } }, '_id name unit').lean();
  const typeMap = new Map(types.map(t => [String(t._id), t]));
  const lotIds = [...new Set(cons.map(c => String(c.lotId)))];
  const lots = lotIds.length ? await Lot.find({ _id: { $in: lotIds } }, '_id lotNumber').lean() : [];
  const lotNumMap = new Map(lots.map(l => [String(l._id), l.lotNumber]));

  const vendorMap = new Map(); // vendorId → { vendorId, vendorName, items: Map(itemId → agg) }
  const ensureVendor = (vid, vname) => {
    if (!vendorMap.has(vid)) vendorMap.set(vid, { vendorId: vid, vendorName: vname || 'Vendor', items: new Map() });
    const v = vendorMap.get(vid);
    if ((!v.vendorName || v.vendorName === 'Vendor') && vname) v.vendorName = vname;
    return v;
  };
  const metaFor = (itemId, fallbackName, fallbackTypeId) => {
    const item = itemMap.get(String(itemId)) || { _id: itemId, name: fallbackName || 'Unknown item', accessoryTypeId: fallbackTypeId };
    const type = typeMap.get(String(item.accessoryTypeId)) || null;
    return { item, type };
  };
  const ensureItem = (v, item, type) => {
    const iid = String(item._id);
    if (!v.items.has(iid)) v.items.set(iid, {
      itemId: iid, name: item.name, typeName: type ? type.name : '', unit: type ? (type.unit || 'pcs') : 'pcs',
      sent: 0, needed: 0, grossExtra: 0, returned: 0, netHeld: 0, lots: [], returnRows: [],
    });
    return v.items.get(iid);
  };

  // sent / needed from finishing-stage consumption
  for (const c of cons) {
    const { item, type } = metaFor(c.accessoryItemId, c.nameSnapshot, c.accessoryTypeId);
    const ratio = ratioForSubType(item.subType);
    const sentQty = Number(c.qty) || 0;
    const lotKey = String(c.lotId);
    const vlist = lotVendors.get(lotKey);
    let splits;
    if (!vlist || !vlist.length) {
      splits = [{ vendorId: 'unassigned', vendorName: 'Unassigned', finishedQty: 0, basisPcs: 0, share: 1 }];
    } else {
      const tot = vlist.reduce((s, x) => s + x.finishedQty, 0);
      splits = vlist.map(x => ({ ...x, share: tot > 0 ? x.finishedQty / tot : 1 / vlist.length }));
    }
    // Per-line basis (pcs THIS line covers, e.g. its client's share of the lot); falls back to the
    // lot-level basis (Finishing.accessoryBasisPcs ?? quantity) for rows saved before per-line basis.
    const rowBasis = Number.isFinite(Number(c.basisPcs)) ? Number(c.basisPcs) : null;
    for (const s of splits) {
      const v = ensureVendor(s.vendorId, s.vendorName);
      const agg = ensureItem(v, item, type);
      const sent = sentQty * s.share;
      const needed = (rowBasis != null ? rowBasis * s.share : (s.basisPcs || 0)) * ratio;
      agg.sent += sent;
      agg.needed += needed;
      agg.lots.push({ lotNumber: lotNumMap.get(lotKey) || lotKey, date: c.date, sent: round2(sent), needed: round2(needed), extra: round2(sent - needed) });
    }
  }

  // returned
  for (const r of returns) {
    const vid = r.vendorId ? String(r.vendorId._id) : 'unassigned';
    const vname = r.vendorId ? r.vendorId.name : 'Unassigned';
    const { item, type } = metaFor(r.accessoryItemId, r.nameSnapshot, r.accessoryTypeId);
    const v = ensureVendor(vid, vname);
    const agg = ensureItem(v, item, type);
    agg.returned += Number(r.qty) || 0;
    agg.returnRows.push({ _id: String(r._id), qty: Number(r.qty) || 0, date: r.date, notes: r.notes || '' });
  }

  // finalize
  const result = [];
  for (const v of vendorMap.values()) {
    const itemsOut = [];
    let totalNetHeld = 0;
    for (const agg of v.items.values()) {
      agg.grossExtra = round2(agg.sent - agg.needed);
      agg.netHeld = round2(agg.grossExtra - agg.returned);
      agg.sent = round2(agg.sent);
      agg.needed = round2(agg.needed);
      agg.lots.sort((a, b) => new Date(b.date) - new Date(a.date));
      agg.returnRows.sort((a, b) => new Date(b.date) - new Date(a.date));
      totalNetHeld += agg.netHeld;
      itemsOut.push(agg);
    }
    itemsOut.sort((a, b) => (a.typeName || '').localeCompare(b.typeName || '') || a.name.localeCompare(b.name));
    result.push({ vendorId: v.vendorId, vendorName: v.vendorName, totalNetHeld: round2(totalNetHeld), items: itemsOut });
  }
  result.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''));
  return result;
};

// Record accessories a finishing vendor handed back. Resolves type/name from the item so the
// row is self-describing (mirrors replaceFinishingConsumption). Stock rises automatically on the
// next read (returns are netted into consumed by getAccessoryStock/getStockSummary).
const recordVendorReturn = async ({ vendorId, accessoryItemId, qty, date, notes, userId }) => {
  if (!vendorId) throw new Error('vendorId required');
  const item = await AccessoryItem.findById(accessoryItemId).lean();
  if (!item) throw new Error('Accessory item not found');
  const n = Number(qty);
  if (!(n > 0)) throw new Error('Return qty must be greater than 0');
  return AccessoryVendorReturn.create({
    vendorId,
    accessoryTypeId: item.accessoryTypeId,
    accessoryItemId: item._id,
    nameSnapshot: item.name,
    qty: n,
    date: date ? new Date(date) : new Date(),
    notes: notes || '',
    createdBy: userId,
  });
};

const listVendorReturns = async ({ vendorId, accessoryItemId } = {}) => {
  const q = {};
  if (vendorId) q.vendorId = vendorId;
  if (accessoryItemId) q.accessoryItemId = accessoryItemId;
  return AccessoryVendorReturn.find(q)
    .populate('vendorId', 'name')
    .populate('createdBy', 'username')
    .sort({ date: -1, createdAt: -1 })
    .lean();
};

const deleteVendorReturn = async (id) => AccessoryVendorReturn.findByIdAndDelete(id);

module.exports = {
  DEFAULT_ACCESSORY_TYPES,
  seedAccessoryTypes,
  updateAccessoryBalance,
  getAccessoryBalance,
  getAccessoryStock,
  getStockSummary,
  getLowStockItems,
  getApplicableItems,
  replaceConsumption,
  FINISHING_CONSUMABLE_KEYS,
  getFinishingConsumableGroups,
  replaceFinishingConsumption,
  getFinishingVendorExtras,
  recordVendorReturn,
  listVendorReturns,
  deleteVendorReturn,
  recordPaymentHistory,
  getPaymentHistory
};
