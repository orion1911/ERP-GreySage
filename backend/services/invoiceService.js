const mongoose = require('mongoose');
const {
  Invoice,
  InvoiceHistory,
  Lot,
  Stitching,
  Washing,
  Finishing,
  Counter,
  Client,
  FitStyle
} = require('../mongodb_schema');

/**
 * Derive the final dispatchable pcs for a lot from production records.
 * Fallback chain: Finishing → Washing → Stitching. Returns 0 if no production exists.
 */
const getFinalPcsForLot = async (lotId) => {
  const finishingDocs = await Finishing.find({ lotId });
  if (finishingDocs.length > 0) {
    return finishingDocs.reduce((sum, f) => sum + (f.quantity - (f.quantityShort || 0)), 0);
  }
  const washingDocs = await Washing.find({ lotId });
  if (washingDocs.length > 0) {
    let total = 0;
    for (const w of washingDocs) {
      for (const wd of (w.washDetails || [])) {
        total += (wd.quantity - (wd.quantityShort || 0));
      }
    }
    return total;
  }
  const stitchingDocs = await Stitching.find({ lotId });
  return stitchingDocs.reduce((sum, s) => sum + (s.quantity - (s.quantityShort || 0)), 0);
};

/**
 * Sum of pcs across all non-cancelled invoice lines that reference this lot.
 * Excludes a given invoiceId (used during update to ignore the current invoice).
 */
const sumInvoicedPcsForLot = async (lotId, excludeInvoiceId = null) => {
  const match = {
    status: { $ne: 'cancelled' },
    'lines.lotId': new mongoose.Types.ObjectId(lotId)
  };
  if (excludeInvoiceId) {
    match._id = { $ne: new mongoose.Types.ObjectId(excludeInvoiceId) };
  }
  const result = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    { $match: { 'lines.lotId': new mongoose.Types.ObjectId(lotId) } },
    { $group: { _id: null, total: { $sum: '$lines.pcs' } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
};

/**
 * Recompute and persist Lot.invoicedPcs. Call after every invoice create/update/cancel.
 */
const recalcLotInvoiced = async (lotId) => {
  if (!lotId) return;
  const invoicedPcs = await sumInvoicedPcsForLot(lotId);
  await Lot.findByIdAndUpdate(lotId, { invoicedPcs });
  return invoicedPcs;
};

/**
 * Get remaining dispatchable pcs for a lot: finalPcs - invoicedPcs (excluding given invoice).
 */
const getRemainingPcsForLot = async (lotId, excludeInvoiceId = null) => {
  const [finalPcs, invoicedPcs] = await Promise.all([
    getFinalPcsForLot(lotId),
    sumInvoicedPcsForLot(lotId, excludeInvoiceId)
  ]);
  return Math.max(0, finalPcs - invoicedPcs);
};

/**
 * List lots available for dispatch (autocomplete data source).
 * Filters: clientId (optional), search (lotNumber or upstream invoiceNumber substring).
 * Returns lots with finalPcs > invoicedPcs (i.e. remainingPcs > 0).
 */
const getLotsAvailableForDispatch = async ({ clientId, search, limit = 50 } = {}) => {
  const query = {};
  if (clientId) query.clientId = clientId;
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const orClauses = [{ lotNumber: re }];
    const asNum = parseInt(search.trim(), 10);
    if (!Number.isNaN(asNum)) orClauses.push({ invoiceNumber: asNum });
    query.$or = orClauses;
  }

  const lots = await Lot.find(query)
    .populate('clientId', 'name clientCode')
    .populate('fitStyleId', 'name')
    .sort({ createdAt: -1 })
    .limit(limit * 3); // overfetch; we filter remaining > 0 below

  const results = [];
  for (const lot of lots) {
    const finalPcs = await getFinalPcsForLot(lot._id);
    const invoicedPcs = lot.invoicedPcs || 0;
    const remainingPcs = Math.max(0, finalPcs - invoicedPcs);
    if (remainingPcs <= 0) continue;
    results.push({
      _id: lot._id,
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      invoiceNumber: lot.invoiceNumber, // upstream invoice on the lot
      clientId: lot.clientId?._id,
      clientName: lot.clientId?.name,
      clientCode: lot.clientId?.clientCode,
      fitStyleId: lot.fitStyleId?._id,
      fitStyleName: lot.fitStyleId?.name,
      fabric: lot.fabric,
      waistSize: lot.waistSize,
      date: lot.date,
      finalPcs,
      invoicedPcs,
      remainingPcs
    });
    if (results.length >= limit) break;
  }
  return results;
};

/**
 * Fiscal year code "YYYY-1,YYYY-2 short" e.g. for May 2026 → '2627'.
 * FY starts April 1.
 */
const fyShortFor = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? year : year - 1; // months are 0-indexed
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
};

/**
 * Atomically generate the next invoiceNumber for the given date's FY.
 * Uses the Counter collection with _id = "invoice-{fyShort}".
 * Prefix is taken from CompanySettings.defaultInvoicePrefix when caller passes it.
 */
const generateInvoiceNumber = async (date, prefix = 'INV') => {
  const fy = fyShortFor(date);
  const counterId = `invoice-${fy}`;
  const counter = await Counter.findByIdAndUpdate(
    { _id: counterId },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${fy}/${counter.sequence}`;
};

/**
 * Generate internal invoiceId (mirror of LT-…) e.g. INV-20260516007.
 */
const generateInvoiceInternalId = async () => {
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'invoiceInternalId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  const seq = counter.sequence.toString().padStart(3, '0');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${dateStr}${seq}`;
};

/**
 * Recompute subTotal, total, totalQty from lines + roundOff. Mutates `invoice` in place.
 */
const recomputeInvoiceTotals = (invoice) => {
  let subTotal = 0;
  let totalQty = 0;
  invoice.lines.forEach((line, idx) => {
    line.lineNo = idx + 1;
    line.amount = (line.pcs || 0) * (line.rate || 0);
    subTotal += line.amount;
    totalQty += line.pcs || 0;
  });
  invoice.subTotal = subTotal;
  invoice.total = subTotal + (invoice.roundOff || 0);
  invoice.totalQty = totalQty;
  invoice.amountInWords = amountInWordsIndian(invoice.total);
  return invoice;
};

// ─── Amount in Words (Indian numbering: lakhs/crores) ───────────────────────
const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const twoDigits = (n) => {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? ' ' + ones[o] : '');
};

const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (h ? ones[h] + ' hundred' + (rest ? ' and ' : '') : '') + (rest ? twoDigits(rest) : '');
};

const amountInWordsIndian = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '';
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Rupees zero and zero paisa only';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const lastThree = rupees % 1000;

  let words = '';
  if (crore) words += twoDigits(crore) + ' crore ';
  if (lakh) words += twoDigits(lakh) + ' lakh ';
  if (thousand) words += twoDigits(thousand) + ' thousand ';
  if (lastThree) words += threeDigits(lastThree);
  words = words.trim() || 'zero';

  const paiseWords = paise ? twoDigits(paise) + ' paisa' : 'zero paisa';
  return `Rupees ${words} and ${paiseWords} only`.replace(/\s+/g, ' ');
};

/**
 * Record one entry in InvoiceHistory.
 */
const recordInvoiceHistory = async (invoiceId, action, beforeData, afterData, userId) => {
  const entry = new InvoiceHistory({
    invoiceId,
    action,
    beforeData: beforeData || null,
    afterData: afterData || null,
    changedBy: userId
  });
  await entry.save();
  return entry;
};

const getInvoiceHistory = async (invoiceId) => {
  return InvoiceHistory.find({ invoiceId })
    .populate('changedBy', 'username email')
    .sort({ createdAt: -1 });
};

module.exports = {
  getFinalPcsForLot,
  sumInvoicedPcsForLot,
  recalcLotInvoiced,
  getRemainingPcsForLot,
  getLotsAvailableForDispatch,
  fyShortFor,
  generateInvoiceNumber,
  generateInvoiceInternalId,
  recomputeInvoiceTotals,
  amountInWordsIndian,
  recordInvoiceHistory,
  getInvoiceHistory
};
