const { ClientPaymentEntry, Client } = require('../mongodb_schema');
const {
  updateClientBalance,
  getClientBalance,
  recordClientPayment,
  recordClientAdjustment,
  getClientInvoicesWithPayments,
  recordPaymentEntryHistory,
  getPaymentEntryHistory,
  getClientPaymentHistory
} = require('../services/clientBalanceService');
const { logAction } = require('../utils/logger');

/**
 * GET /api/client-balances/clients-with-balance — list of active clients + their balance.
 */
const getClientsWithBalance = async (req, res) => {
  const clients = await Client.find({ isActive: true }).sort({ name: 1 });
  const withBalance = await Promise.all(
    clients.map(async (c) => {
      const balance = await getClientBalance(c._id);
      return {
        ...c.toObject(),
        balance: balance ? {
          openingBalance: balance.openingBalance,
          totalInvoiced: balance.totalInvoiced,
          totalPaid: balance.totalPaid,
          totalAdjustment: balance.totalAdjustment,
          remainingBalance: balance.remainingBalance
        } : { openingBalance: 0, totalInvoiced: 0, totalPaid: 0, totalAdjustment: 0, remainingBalance: 0 }
      };
    })
  );
  res.json(withBalance);
};

/**
 * GET /api/client-balances/client-invoices-payments?clientId=
 */
const getClientLedger = async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const result = await getClientInvoicesWithPayments(clientId);
  res.json(result);
};

/**
 * GET /api/client-balances/client-balance-summary?clientId=
 */
const getClientBalanceSummary = async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const balance = await getClientBalance(clientId);
  res.json(balance);
};

/**
 * PATCH /api/client-balances/opening-balance — set or change opening balance for legacy seed.
 */
const setOpeningBalance = async (req, res) => {
  const { clientId, openingBalance } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const ClientBalance = require('../mongodb_schema').ClientBalance;
  let balance = await ClientBalance.findOne({ clientId });
  if (!balance) balance = new ClientBalance({ clientId });
  balance.openingBalance = Number(openingBalance) || 0;
  await balance.save();
  const updated = await updateClientBalance(clientId);
  await logAction(req.user.userId, 'set_opening_balance', 'ClientBalance', clientId, `Set opening balance to ${openingBalance}`);
  res.json(updated);
};

/**
 * POST /api/client-balances/client-payment
 */
const addClientPayment = async (req, res) => {
  const { clientId, paymentScope, invoiceId, amount, paymentDate, paymentMode, referenceNumber, notes } = req.body;
  if (!clientId || amount === undefined || !paymentDate) {
    return res.status(400).json({ error: 'clientId, amount, and paymentDate required' });
  }
  if (paymentScope === 'invoice' && !invoiceId) {
    return res.status(400).json({ error: 'invoiceId required when paymentScope=invoice' });
  }
  const entry = await recordClientPayment({
    clientId, paymentScope, invoiceId, amount,
    paymentDate, paymentMode, referenceNumber, notes,
    userId: req.user.userId
  });
  await recordPaymentEntryHistory(entry._id, clientId, 'payment', 'create', null, entry.toObject(), req.user.userId);
  await logAction(req.user.userId, 'add_client_payment', 'ClientPayment', clientId, `Recorded payment of ${amount} from client`);
  res.json({ message: 'Payment recorded', entry });
};

/**
 * POST /api/client-balances/client-adjustment — discount / credit note / write-off
 */
const addClientAdjustment = async (req, res) => {
  const { clientId, paymentScope, invoiceId, amount, paymentDate, paymentMode, referenceNumber, notes } = req.body;
  if (!clientId || amount === undefined || !paymentDate) {
    return res.status(400).json({ error: 'clientId, amount, and paymentDate required' });
  }
  if (paymentScope === 'invoice' && !invoiceId) {
    return res.status(400).json({ error: 'invoiceId required when paymentScope=invoice' });
  }
  const entry = await recordClientAdjustment({
    clientId, paymentScope, invoiceId, amount,
    paymentDate, paymentMode, referenceNumber, notes,
    userId: req.user.userId
  });
  await recordPaymentEntryHistory(entry._id, clientId, 'adjustment', 'create', null, entry.toObject(), req.user.userId);
  await logAction(req.user.userId, 'add_client_adjustment', 'ClientPayment', clientId, `Recorded adjustment of ${amount}`);
  res.json({ message: 'Adjustment recorded', entry });
};

/**
 * GET /api/client-balances/client-payment-entries?clientId=
 */
const getClientPaymentEntries = async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const entries = await ClientPaymentEntry.find({ clientId })
    .populate('createdBy', 'username')
    .populate('invoiceId', 'invoiceNumber')
    .sort({ paymentDate: -1, createdAt: -1 });
  res.json(entries);
};

/**
 * PUT /api/client-balances/client-payment/:entryId
 */
const updatePaymentEntry = async (req, res) => {
  const { entryId } = req.params;
  const entry = await ClientPaymentEntry.findById(entryId);
  if (!entry) return res.status(404).json({ error: 'Payment entry not found' });

  const before = {
    amount: entry.amount,
    paymentDate: entry.paymentDate,
    paymentScope: entry.paymentScope,
    invoiceId: entry.invoiceId,
    paymentMode: entry.paymentMode,
    referenceNumber: entry.referenceNumber,
    notes: entry.notes
  };

  const { amount, paymentDate, paymentMode, referenceNumber, notes, invoiceId, paymentScope } = req.body;
  if (amount !== undefined) entry.amount = Number(amount);
  if (paymentDate) entry.paymentDate = new Date(paymentDate);
  if (paymentMode) entry.paymentMode = paymentMode;
  if (referenceNumber !== undefined) entry.referenceNumber = referenceNumber;
  if (notes !== undefined) entry.notes = notes;
  if (paymentScope) entry.paymentScope = paymentScope;
  if (invoiceId !== undefined) entry.invoiceId = invoiceId || undefined;
  entry.updatedBy = req.user.userId;
  entry.updatedAt = new Date();
  await entry.save();

  await updateClientBalance(entry.clientId);

  const after = {
    amount: entry.amount,
    paymentDate: entry.paymentDate,
    paymentScope: entry.paymentScope,
    invoiceId: entry.invoiceId,
    paymentMode: entry.paymentMode,
    referenceNumber: entry.referenceNumber,
    notes: entry.notes
  };
  await recordPaymentEntryHistory(entry._id, entry.clientId, entry.paymentType, 'update', before, after, req.user.userId);

  res.json({ message: 'Payment entry updated', entry });
};

/**
 * DELETE /api/client-balances/client-payment/:entryId
 */
const deletePaymentEntry = async (req, res) => {
  const { entryId } = req.params;
  const entry = await ClientPaymentEntry.findById(entryId);
  if (!entry) return res.status(404).json({ error: 'Payment entry not found' });

  const before = {
    amount: entry.amount,
    paymentDate: entry.paymentDate,
    paymentScope: entry.paymentScope,
    invoiceId: entry.invoiceId,
    paymentMode: entry.paymentMode,
    referenceNumber: entry.referenceNumber,
    notes: entry.notes
  };
  const clientId = entry.clientId;
  await ClientPaymentEntry.findByIdAndDelete(entryId);
  await updateClientBalance(clientId);
  await recordPaymentEntryHistory(entryId, clientId, entry.paymentType, 'delete', before, null, req.user.userId);
  res.json({ message: 'Payment entry deleted' });
};

/**
 * GET /api/client-balances/client-payment-history/:entryId
 */
const getEntryHistory = async (req, res) => {
  const history = await getPaymentEntryHistory(req.params.entryId);
  res.json(history);
};

/**
 * GET /api/client-balances/client-payment-changes?clientId=
 */
const getClientHistory = async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const history = await getClientPaymentHistory(clientId);
  res.json(history);
};

module.exports = {
  getClientsWithBalance,
  getClientLedger,
  getClientBalanceSummary,
  setOpeningBalance,
  addClientPayment,
  addClientAdjustment,
  getClientPaymentEntries,
  updatePaymentEntry,
  deletePaymentEntry,
  getEntryHistory,
  getClientHistory
};
