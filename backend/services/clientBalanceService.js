const {
  ClientBalance,
  ClientPaymentEntry,
  ClientPaymentEntryHistory,
  Invoice,
  Client
} = require('../mongodb_schema');

/**
 * Recompute and persist the denormalized ClientBalance for a client.
 * Must be called after every invoice and payment write that affects this client's money.
 */
const updateClientBalance = async (clientId) => {
  // Sum totals from invoices and payment entries in parallel.
  const [invoiceAgg, paymentAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: { clientId: new (require('mongoose')).Types.ObjectId(clientId), status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]),
    ClientPaymentEntry.aggregate([
      { $match: { clientId: new (require('mongoose')).Types.ObjectId(clientId) } },
      { $group: { _id: '$paymentType', total: { $sum: '$amount' } } }
    ])
  ]);

  const totalInvoiced = invoiceAgg.length > 0 ? invoiceAgg[0].total : 0;
  let totalPaid = 0;
  let totalAdjustment = 0;
  for (const row of paymentAgg) {
    if (row._id === 'payment') totalPaid = row.total;
    else if (row._id === 'adjustment') totalAdjustment = row.total;
  }

  let balance = await ClientBalance.findOne({ clientId });
  if (!balance) {
    balance = new ClientBalance({ clientId });
  }
  balance.totalInvoiced = totalInvoiced;
  balance.totalPaid = totalPaid;
  balance.totalAdjustment = totalAdjustment;
  balance.remainingBalance = (balance.openingBalance || 0) + totalInvoiced - totalPaid - totalAdjustment;
  balance.lastUpdated = new Date();
  await balance.save();
  return balance;
};

const getClientBalance = async (clientId) => {
  let balance = await ClientBalance.findOne({ clientId }).populate('clientId', 'name clientCode gstin');
  if (!balance) {
    balance = await updateClientBalance(clientId);
    balance = await ClientBalance.findById(balance._id).populate('clientId', 'name clientCode gstin');
  }
  return balance;
};

/**
 * Record a client payment entry. paymentScope='client' or 'invoice' (with invoiceId).
 */
const recordClientPayment = async ({
  clientId,
  paymentScope = 'client',
  invoiceId = null,
  amount,
  paymentDate,
  paymentMode = 'cash',
  referenceNumber,
  notes,
  userId
}) => {
  const entry = new ClientPaymentEntry({
    clientId,
    paymentScope,
    invoiceId: paymentScope === 'invoice' ? invoiceId : undefined,
    paymentType: 'payment',
    amount,
    paymentDate: new Date(paymentDate),
    paymentMode,
    referenceNumber,
    notes,
    createdBy: userId
  });
  await entry.save();
  await updateClientBalance(clientId);
  return entry;
};

/**
 * Record an adjustment (discount / credit note / write-off). Same shape, different paymentType.
 */
const recordClientAdjustment = async ({
  clientId,
  paymentScope = 'client',
  invoiceId = null,
  amount,
  paymentDate,
  paymentMode = 'other',
  referenceNumber,
  notes,
  userId
}) => {
  const entry = new ClientPaymentEntry({
    clientId,
    paymentScope,
    invoiceId: paymentScope === 'invoice' ? invoiceId : undefined,
    paymentType: 'adjustment',
    amount,
    paymentDate: new Date(paymentDate),
    paymentMode,
    referenceNumber,
    notes,
    createdBy: userId
  });
  await entry.save();
  await updateClientBalance(clientId);
  return entry;
};

/**
 * Per-client ledger: invoices + payment entries together, ready to display.
 */
const getClientInvoicesWithPayments = async (clientId) => {
  const [invoices, payments] = await Promise.all([
    Invoice.find({ clientId, status: { $ne: 'cancelled' } })
      .sort({ date: -1, createdAt: -1 }),
    ClientPaymentEntry.find({ clientId })
      .populate('createdBy', 'username')
      .populate('invoiceId', 'invoiceNumber')
      .sort({ paymentDate: -1, createdAt: -1 })
  ]);

  // Per-invoice rollup: how much of each invoice has been paid (invoice-scoped payments only).
  const invoicePaid = new Map();
  for (const p of payments) {
    if (p.paymentScope === 'invoice' && p.invoiceId) {
      const key = String(p.invoiceId._id || p.invoiceId);
      const cur = invoicePaid.get(key) || { paid: 0, adjustment: 0 };
      if (p.paymentType === 'payment') cur.paid += p.amount;
      else cur.adjustment += p.amount;
      invoicePaid.set(key, cur);
    }
  }

  const invoicesWithBalance = invoices.map((inv) => {
    const rollup = invoicePaid.get(String(inv._id)) || { paid: 0, adjustment: 0 };
    return {
      ...inv.toObject(),
      invoicePaid: rollup.paid,
      invoiceAdjustment: rollup.adjustment,
      invoiceBalance: inv.total - rollup.paid - rollup.adjustment
    };
  });

  return { invoices: invoicesWithBalance, payments };
};

const recordPaymentEntryHistory = async (entryId, clientId, paymentType, action, beforeData, afterData, userId) => {
  const entry = new ClientPaymentEntryHistory({
    entryId,
    clientId,
    action,
    paymentType,
    beforeData: beforeData || null,
    afterData: afterData || null,
    changedBy: userId
  });
  await entry.save();
  return entry;
};

const getPaymentEntryHistory = async (entryId) => {
  return ClientPaymentEntryHistory.find({ entryId })
    .populate('changedBy', 'username email')
    .sort({ createdAt: -1 });
};

const getClientPaymentHistory = async (clientId) => {
  return ClientPaymentEntryHistory.find({ clientId })
    .populate('changedBy', 'username email')
    .sort({ createdAt: -1 });
};

module.exports = {
  updateClientBalance,
  getClientBalance,
  recordClientPayment,
  recordClientAdjustment,
  getClientInvoicesWithPayments,
  recordPaymentEntryHistory,
  getPaymentEntryHistory,
  getClientPaymentHistory
};
