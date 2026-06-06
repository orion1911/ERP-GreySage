const {
  AccessoryType,
  AccessoryItem,
  AccessoryPurchase,
  AccessoryPayment,
  AccessoryConsumption,
  AccessoryBalance,
  Client,
  Lot
} = require('../mongodb_schema');
const accessoryService = require('../services/accessoryService');
const { logAction } = require('../utils/logger');

// ─── ARTICLE TYPES ────────────────────────────────────────────────────────────

const getTypes = async (req, res) => {
  await accessoryService.seedAccessoryTypes();
  const types = await AccessoryType.find().sort({ sortOrder: 1 }).lean();
  res.json(types);
};

// ─── MASTERS / ITEMS ──────────────────────────────────────────────────────────

const getItems = async (req, res) => {
  const { typeId, search, clientId, showInactive } = req.query;
  if (!typeId) return res.status(400).json({ error: 'typeId is required' });

  const filter = { accessoryTypeId: typeId };
  if (showInactive !== 'true') filter.isActive = true;
  if (search) filter.name = { $regex: search, $options: 'i' };
  if (clientId === 'general') filter.clientId = null;
  else if (clientId) filter.clientId = clientId;

  const items = await AccessoryItem.find(filter)
    .populate('clientId', 'name clientCode')
    .sort({ name: 1 });
  res.json(items);
};

// Items applicable to a client at consumption time (client-mapped, else general).
const getApplicableItems = async (req, res) => {
  const { typeId, clientId } = req.query;
  if (!typeId) return res.status(400).json({ error: 'typeId is required' });
  const items = await accessoryService.getApplicableItems(typeId, clientId || null);
  res.json(items);
};

// Finishing-stage consumption slots (Button / Label / Tag / Polybag) for a lot's client.
// Resolves the client from invoiceNumber (or lotId), then returns client-mapped + general
// items per slot so the form can pre-fill and allow the partial client/general split.
const getFinishingItems = async (req, res) => {
  const { invoiceNumber, lotId, clientId } = req.query;
  let resolvedClientId = clientId || null;
  if (!resolvedClientId && (invoiceNumber || lotId)) {
    const lotQuery = lotId ? { _id: lotId } : { invoiceNumber: parseInt(invoiceNumber, 10) };
    const lot = await Lot.findOne(lotQuery).select('clientId');
    if (lot) resolvedClientId = lot.clientId;
  }
  const groups = await accessoryService.getFinishingConsumableGroups(resolvedClientId);
  res.json(groups);
};

const createItem = async (req, res) => {
  const { accessoryTypeId, name, rate, clientId, subType, description, openingStock } = req.body;
  if (!accessoryTypeId || !name) {
    return res.status(400).json({ error: 'accessoryTypeId and name are required' });
  }
  const type = await AccessoryType.findById(accessoryTypeId);
  if (!type) return res.status(404).json({ error: 'Accessory type not found' });
  if (clientId) {
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
  }

  const item = new AccessoryItem({
    accessoryTypeId,
    name: name.trim(),
    rate: rate || 0,
    clientId: clientId || null,
    subType: subType || null,
    openingStock: Number(openingStock) || 0,
    description
  });
  await item.save();
  await logAction(req.user.userId, 'create_accessory_item', 'AccessoryItem', item._id, `Created ${type.name} item "${item.name}"`);
  const populated = await AccessoryItem.findById(item._id).populate('clientId', 'name clientCode');
  res.status(201).json(populated);
};

const updateItem = async (req, res) => {
  const { id } = req.params;
  const { name, rate, clientId, subType, description, isActive, openingStock } = req.body;
  const item = await AccessoryItem.findById(id);
  if (!item) return res.status(404).json({ error: 'Accessory item not found' });

  if (name !== undefined) item.name = name.trim();
  if (rate !== undefined) item.rate = rate;
  if (clientId !== undefined) item.clientId = clientId || null;
  if (subType !== undefined) item.subType = subType || null;
  if (openingStock !== undefined) item.openingStock = Number(openingStock) || 0;
  if (description !== undefined) item.description = description;
  if (isActive !== undefined) item.isActive = isActive;
  await item.save();
  await logAction(req.user.userId, 'update_accessory_item', 'AccessoryItem', item._id, `Updated accessory item "${item.name}"`);
  const populated = await AccessoryItem.findById(item._id).populate('clientId', 'name clientCode');
  res.json(populated);
};

const toggleItemActive = async (req, res) => {
  const item = await AccessoryItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Accessory item not found' });
  item.isActive = !item.isActive;
  await item.save();
  await logAction(req.user.userId, 'toggle_accessory_item', 'AccessoryItem', item._id, `${item.isActive ? 'Enabled' : 'Disabled'} accessory item "${item.name}"`);
  res.json(item);
};

// ─── PURCHASES ────────────────────────────────────────────────────────────────

// Normalize + total a purchase's lines; snapshots each item name.
const buildPurchaseLines = async (accessoryTypeId, rawLines) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error('At least one purchase line is required');
  }
  const lines = [];
  let totalQty = 0;
  let totalAmount = 0;
  for (const l of rawLines) {
    if (!l.accessoryItemId) throw new Error('Each line needs an accessory item');
    const item = await AccessoryItem.findOne({ _id: l.accessoryItemId, accessoryTypeId });
    if (!item) throw new Error('Accessory item not found for this type');
    const qty = Number(l.qty) || 0;
    const rate = Number(l.rate) || 0;
    const amount = Math.round(qty * rate * 100) / 100;
    lines.push({ accessoryItemId: item._id, nameSnapshot: item.name, qty, rate, amount });
    totalQty += qty;
    totalAmount += amount;
  }
  return { lines, totalQty, totalAmount: Math.round(totalAmount * 100) / 100 };
};

const getPurchases = async (req, res) => {
  const { typeId, page = 1, limit = 10 } = req.query;
  if (!typeId) return res.status(400).json({ error: 'typeId is required' });
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, parseInt(limit, 10) || 10);
  const filter = { accessoryTypeId: typeId };
  const [rows, total] = await Promise.all([
    AccessoryPurchase.find(filter)
      .populate('lines.accessoryItemId', 'name')
      .populate('createdBy', 'username')
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * lim)
      .limit(lim),
    AccessoryPurchase.countDocuments(filter),
  ]);
  res.json({ rows, total, page: pageNum, limit: lim });
};

const createPurchase = async (req, res) => {
  const { accessoryTypeId, date, vendorInvoiceNumber, supplier, lines, notes } = req.body;
  if (!accessoryTypeId || !date) {
    return res.status(400).json({ error: 'accessoryTypeId and date are required' });
  }
  const type = await AccessoryType.findById(accessoryTypeId);
  if (!type) return res.status(404).json({ error: 'Accessory type not found' });

  const { lines: builtLines, totalQty, totalAmount } = await buildPurchaseLines(accessoryTypeId, lines);

  const purchase = new AccessoryPurchase({
    accessoryTypeId, date, vendorInvoiceNumber, supplier,
    lines: builtLines, totalQty, totalAmount, notes,
    createdBy: req.user.userId
  });
  await purchase.save();
  await accessoryService.updateAccessoryBalance(accessoryTypeId);
  await logAction(req.user.userId, 'create_accessory_purchase', 'AccessoryPurchase', purchase._id, `Recorded ${type.name} purchase of ${totalAmount} (${totalQty} ${type.unit})`);

  const populated = await AccessoryPurchase.findById(purchase._id).populate('lines.accessoryItemId', 'name').populate('createdBy', 'username');
  res.status(201).json(populated);
};

const updatePurchase = async (req, res) => {
  const { id } = req.params;
  const { date, vendorInvoiceNumber, supplier, lines, notes } = req.body;
  const purchase = await AccessoryPurchase.findById(id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

  if (date) purchase.date = date;
  if (vendorInvoiceNumber !== undefined) purchase.vendorInvoiceNumber = vendorInvoiceNumber;
  if (supplier !== undefined) purchase.supplier = supplier;
  if (notes !== undefined) purchase.notes = notes;
  if (lines) {
    const { lines: builtLines, totalQty, totalAmount } = await buildPurchaseLines(purchase.accessoryTypeId, lines);
    purchase.lines = builtLines;
    purchase.totalQty = totalQty;
    purchase.totalAmount = totalAmount;
  }
  purchase.updatedBy = req.user.userId;
  purchase.updatedAt = new Date();
  await purchase.save();
  await accessoryService.updateAccessoryBalance(purchase.accessoryTypeId);
  await logAction(req.user.userId, 'update_accessory_purchase', 'AccessoryPurchase', purchase._id, `Updated accessory purchase`);

  const populated = await AccessoryPurchase.findById(purchase._id).populate('lines.accessoryItemId', 'name').populate('createdBy', 'username');
  res.json(populated);
};

// Toggle (or set) a purchase's "paid" marker. Independent of the payment ledger — just a
// per-entry settled flag that disables the row in the UI.
const setPurchasePaid = async (req, res) => {
  const { id } = req.params;
  const { isPaid } = req.body;
  const purchase = await AccessoryPurchase.findById(id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
  purchase.isPaid = isPaid === undefined ? !purchase.isPaid : !!isPaid;
  purchase.paidAt = purchase.isPaid ? new Date() : null;
  purchase.paidBy = purchase.isPaid ? req.user.userId : null;
  await purchase.save();
  await logAction(req.user.userId, 'mark_accessory_purchase_paid', 'AccessoryPurchase', purchase._id, `Marked purchase ${purchase.isPaid ? 'paid' : 'unpaid'}`);
  const populated = await AccessoryPurchase.findById(purchase._id).populate('lines.accessoryItemId', 'name').populate('createdBy', 'username');
  res.json(populated);
};

const deletePurchase = async (req, res) => {
  const { id } = req.params;
  const purchase = await AccessoryPurchase.findById(id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
  const typeId = purchase.accessoryTypeId;
  await AccessoryPurchase.findByIdAndDelete(id);
  await accessoryService.updateAccessoryBalance(typeId);
  await logAction(req.user.userId, 'delete_accessory_purchase', 'AccessoryPurchase', id, `Deleted accessory purchase`);
  res.json({ message: 'Purchase deleted successfully' });
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

const getPayments = async (req, res) => {
  const { typeId, page = 1, limit = 10 } = req.query;
  if (!typeId) return res.status(400).json({ error: 'typeId is required' });
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, parseInt(limit, 10) || 10);
  const filter = { accessoryTypeId: typeId };
  const [rows, total] = await Promise.all([
    AccessoryPayment.find(filter)
      .populate('createdBy', 'username')
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip((pageNum - 1) * lim)
      .limit(lim),
    AccessoryPayment.countDocuments(filter),
  ]);
  res.json({ rows, total, page: pageNum, limit: lim });
};

const addPayment = async (req, res) => {
  const { accessoryTypeId, amount, paymentDate, paymentMode, referenceNumber, notes, paymentType } = req.body;
  if (!accessoryTypeId || amount === undefined || !paymentDate) {
    return res.status(400).json({ error: 'accessoryTypeId, amount and paymentDate are required' });
  }
  const type = await AccessoryType.findById(accessoryTypeId);
  if (!type) return res.status(404).json({ error: 'Accessory type not found' });

  const entry = new AccessoryPayment({
    accessoryTypeId,
    paymentType: paymentType === 'adjustment' ? 'adjustment' : 'payment',
    amount,
    paymentDate,
    paymentMode: paymentMode || 'cash',
    referenceNumber,
    notes,
    createdBy: req.user.userId
  });
  await entry.save();
  await accessoryService.updateAccessoryBalance(accessoryTypeId);
  await accessoryService.recordPaymentHistory(entry._id, accessoryTypeId, entry.paymentType, 'create', null, {
    amount: entry.amount, paymentDate: entry.paymentDate, paymentMode: entry.paymentMode, referenceNumber: entry.referenceNumber, notes: entry.notes
  }, req.user.userId);
  await logAction(req.user.userId, 'add_accessory_payment', 'AccessoryPayment', entry._id, `Recorded ${type.name} ${entry.paymentType} of ${amount}`);

  const populated = await AccessoryPayment.findById(entry._id).populate('createdBy', 'username');
  res.status(201).json(populated);
};

const updatePayment = async (req, res) => {
  const { id } = req.params;
  const { amount, paymentDate, paymentMode, referenceNumber, notes } = req.body;
  const entry = await AccessoryPayment.findById(id);
  if (!entry) return res.status(404).json({ error: 'Payment entry not found' });

  const beforeData = {
    amount: entry.amount, paymentDate: entry.paymentDate, paymentMode: entry.paymentMode, referenceNumber: entry.referenceNumber, notes: entry.notes
  };

  if (amount !== undefined) entry.amount = amount;
  if (paymentDate) entry.paymentDate = paymentDate;
  if (paymentMode !== undefined) entry.paymentMode = paymentMode;
  if (referenceNumber !== undefined) entry.referenceNumber = referenceNumber;
  if (notes !== undefined) entry.notes = notes;
  entry.updatedBy = req.user.userId;
  entry.updatedAt = new Date();
  await entry.save();
  await accessoryService.updateAccessoryBalance(entry.accessoryTypeId);
  await accessoryService.recordPaymentHistory(entry._id, entry.accessoryTypeId, entry.paymentType, 'update', beforeData, {
    amount: entry.amount, paymentDate: entry.paymentDate, paymentMode: entry.paymentMode, referenceNumber: entry.referenceNumber, notes: entry.notes
  }, req.user.userId);

  const populated = await AccessoryPayment.findById(entry._id).populate('createdBy', 'username');
  res.json(populated);
};

const deletePayment = async (req, res) => {
  const { id } = req.params;
  const entry = await AccessoryPayment.findById(id);
  if (!entry) return res.status(404).json({ error: 'Payment entry not found' });
  const typeId = entry.accessoryTypeId;
  const beforeData = {
    amount: entry.amount, paymentDate: entry.paymentDate, paymentMode: entry.paymentMode, referenceNumber: entry.referenceNumber, notes: entry.notes
  };
  await AccessoryPayment.findByIdAndDelete(id);
  await accessoryService.updateAccessoryBalance(typeId);
  await accessoryService.recordPaymentHistory(id, typeId, entry.paymentType, 'delete', beforeData, null, req.user.userId);
  res.json({ message: 'Payment entry deleted successfully' });
};

const getPaymentHistory = async (req, res) => {
  const history = await accessoryService.getPaymentHistory(req.params.id);
  res.json(history);
};

// ─── BALANCE / STOCK / CONSUMPTION ──────────────────────────────────────────────

const getBalance = async (req, res) => {
  const { typeId } = req.query;
  if (!typeId) return res.status(400).json({ error: 'typeId is required' });
  const balance = await accessoryService.getAccessoryBalance(typeId);
  res.json(balance);
};

// PATCH /opening-balance — set/seed the per-type opening balance (outstanding carried
// from before this system). Recomputes remaining = opening + purchased − paid − adj.
const setOpeningBalance = async (req, res) => {
  const { accessoryTypeId, openingBalance } = req.body;
  if (!accessoryTypeId) return res.status(400).json({ error: 'accessoryTypeId is required' });
  const type = await AccessoryType.findById(accessoryTypeId);
  if (!type) return res.status(404).json({ error: 'Accessory type not found' });

  let balance = await AccessoryBalance.findOne({ accessoryTypeId });
  if (!balance) balance = new AccessoryBalance({ accessoryTypeId });
  balance.openingBalance = Number(openingBalance) || 0;
  await balance.save();
  const updated = await accessoryService.updateAccessoryBalance(accessoryTypeId);
  await logAction(req.user.userId, 'set_accessory_opening_balance', 'AccessoryType', accessoryTypeId, `Set ${type.name} opening balance to ${openingBalance}`);
  res.json(updated);
};

const getStock = async (req, res) => {
  const { typeId } = req.query;
  if (!typeId) return res.status(400).json({ error: 'typeId is required' });
  const stock = await accessoryService.getAccessoryStock(typeId);
  res.json(stock);
};

const getStockSummary = async (req, res) => {
  await accessoryService.seedAccessoryTypes();
  const summary = await accessoryService.getStockSummary();
  res.json(summary);
};

// Consumption rows for a lot+stage — used to prefill the stitching/finishing edit form.
const getConsumption = async (req, res) => {
  const { lotId, stage } = req.query;
  if (!lotId) return res.status(400).json({ error: 'lotId is required' });
  const filter = { lotId };
  if (stage) filter.stage = stage;
  const rows = await AccessoryConsumption.find(filter).sort({ createdAt: 1 });
  res.json(rows);
};

module.exports = {
  getTypes,
  getItems,
  getApplicableItems,
  getFinishingItems,
  createItem,
  updateItem,
  toggleItemActive,
  getPurchases,
  createPurchase,
  updatePurchase,
  setPurchasePaid,
  deletePurchase,
  getPayments,
  addPayment,
  updatePayment,
  deletePayment,
  getPaymentHistory,
  getBalance,
  setOpeningBalance,
  getStock,
  getStockSummary,
  getConsumption
};
