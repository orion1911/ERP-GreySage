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
 * Batched equivalent of getFinalPcsForLot for a SET of lots — 3 aggregations total instead
 * of the 1–3 sequential queries per lot the single-lot version costs. Returns a Map keyed by
 * String(lotId) → finalPcs. Replicates the SAME Finishing → Washing → Stitching fallback:
 * presence of ANY doc in a stage (not a non-zero sum) is what stops the fallback, so a lot
 * with a Washing doc whose washDetails are empty resolves to 0 and does NOT fall through to
 * Stitching — exactly as the per-lot version does.
 */
const getFinalPcsForLots = async (lotIds = []) => {
  const result = new Map();
  if (!lotIds.length) return result;
  const ids = lotIds.map((id) => new mongoose.Types.ObjectId(id));

  // Finishing: flat quantity/quantityShort per doc → sum(quantity - short) grouped by lot.
  const finishingAgg = await Finishing.aggregate([
    { $match: { lotId: { $in: ids } } },
    { $group: { _id: '$lotId', total: { $sum: { $subtract: ['$quantity', { $ifNull: ['$quantityShort', 0] }] } } } }
  ]);
  // Washing: quantities live in a washDetails[] array → reduce the array per doc, sum per lot.
  // Grouping by lotId (not $unwind) means a lot with a Washing doc but empty washDetails still
  // appears with total 0, preserving the fallback-stops-on-presence semantics above.
  const washingAgg = await Washing.aggregate([
    { $match: { lotId: { $in: ids } } },
    { $group: {
        _id: '$lotId',
        total: { $sum: { $reduce: {
          input: { $ifNull: ['$washDetails', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $subtract: ['$$this.quantity', { $ifNull: ['$$this.quantityShort', 0] }] }] }
        } } }
    } }
  ]);
  // Stitching: same flat shape as Finishing.
  const stitchingAgg = await Stitching.aggregate([
    { $match: { lotId: { $in: ids } } },
    { $group: { _id: '$lotId', total: { $sum: { $subtract: ['$quantity', { $ifNull: ['$quantityShort', 0] }] } } } }
  ]);

  const fin = new Map(finishingAgg.map((r) => [String(r._id), r.total]));
  const wash = new Map(washingAgg.map((r) => [String(r._id), r.total]));
  const stitch = new Map(stitchingAgg.map((r) => [String(r._id), r.total]));

  for (const id of lotIds) {
    const key = String(id);
    if (fin.has(key)) result.set(key, fin.get(key));
    else if (wash.has(key)) result.set(key, wash.get(key));
    else result.set(key, stitch.get(key) || 0);
  }
  return result;
};

/**
 * Sum of pcs across non-cancelled invoice lines referencing this lot, filtered by line type.
 * lineType: 'good' (isDamaged != true) | 'damaged' (isDamaged == true) | 'all'.
 * Excludes a given invoiceId (used during update to ignore the current invoice).
 *
 * Attributes pcs from BOTH line shapes:
 *   - single-lot line  → lines.pcs when lines.lotId == lot
 *   - merged line      → sum of lines.sources[].pcs where source.lotId == lot
 * isDamaged is line-level, so the good/damaged filter applies to the whole line either way.
 */
const sumLinePcsForLot = async (lotId, { excludeInvoiceId = null, lineType = 'all' } = {}) => {
  const lotObjId = new mongoose.Types.ObjectId(lotId);
  const match = {
    status: { $ne: 'cancelled' },
    $or: [{ 'lines.lotId': lotObjId }, { 'lines.sources.lotId': lotObjId }]
  };
  if (excludeInvoiceId) {
    match._id = { $ne: new mongoose.Types.ObjectId(excludeInvoiceId) };
  }
  const lineMatch = {};
  if (lineType === 'good') lineMatch['lines.isDamaged'] = { $ne: true };
  else if (lineType === 'damaged') lineMatch['lines.isDamaged'] = true;

  const result = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    ...(Object.keys(lineMatch).length ? [{ $match: lineMatch }] : []),
    {
      $project: {
        pcsForLot: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$lines.sources', []] } }, 0] },
            // merged line: sum the pcs of the sources that point at this lot
            {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: '$lines.sources',
                      as: 's',
                      cond: { $eq: ['$$s.lotId', lotObjId] }
                    }
                  },
                  as: 's',
                  in: '$$s.pcs'
                }
              }
            },
            // single-lot line: full pcs if it points at this lot, else 0
            { $cond: [{ $eq: ['$lines.lotId', lotObjId] }, '$lines.pcs', 0] }
          ]
        }
      }
    },
    { $group: { _id: null, total: { $sum: '$pcsForLot' } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
};

// Good (client-dispatchable) pcs invoiced — what Lot.invoicedPcs caches.
const sumGoodInvoicedForLot = (lotId, excludeInvoiceId = null) =>
  sumLinePcsForLot(lotId, { excludeInvoiceId, lineType: 'good' });

// Damaged pcs sold to third parties — what Lot.damagedSoldPcs caches.
const sumDamagedSoldForLot = (lotId, excludeInvoiceId = null) =>
  sumLinePcsForLot(lotId, { excludeInvoiceId, lineType: 'damaged' });

// Back-compat alias: the historical name meant good/client pcs.
const sumInvoicedPcsForLot = sumGoodInvoicedForLot;

/**
 * Recompute and persist BOTH Lot.invoicedPcs (good) and Lot.damagedSoldPcs (damaged),
 * AND keep the lot's dispatch status in sync (reversible):
 *   good dispatched & none remaining → 7 (Dispatched)
 *   good dispatched & some remaining → 6 (Partially Dispatched)
 *   nothing dispatched & was 6/7      → 5 (Finished/Ready — e.g. a cancel returned all pcs)
 *   otherwise                         → status untouched (still in production / already 5)
 * Call after every invoice create/update/cancel/delete and after a damaged-pcs edit.
 */
const recalcLotInvoiced = async (lotId) => {
  if (!lotId) return;
  const [invoicedPcs, damagedSoldPcs, finalPcs, lot] = await Promise.all([
    sumGoodInvoicedForLot(lotId),
    sumDamagedSoldForLot(lotId),
    getFinalPcsForLot(lotId),
    Lot.findById(lotId)
  ]);
  if (!lot) return { invoicedPcs, damagedSoldPcs };

  lot.invoicedPcs = invoicedPcs;
  lot.damagedSoldPcs = damagedSoldPcs;

  const goodRemaining = finalPcs - (lot.damagedPcs || 0) - invoicedPcs;
  let nextStatus = lot.status;
  if (invoicedPcs > 0) {
    nextStatus = goodRemaining <= 0 ? 7 : 6;
  } else if (lot.status === 6 || lot.status === 7) {
    nextStatus = 5; // dispatch fully reversed → back to Finished/Ready
  }
  if (nextStatus !== lot.status) {
    lot.status = nextStatus;
    lot.statusHistory.push({ status: nextStatus, changedAt: new Date() });
  }

  await lot.save();
  return { invoicedPcs, damagedSoldPcs, status: lot.status };
};

/**
 * Get remaining GOOD (client-dispatchable) pcs for a lot:
 * finalPcs - damagedPcs - goodInvoiced (excluding given invoice).
 */
const getRemainingPcsForLot = async (lotId, excludeInvoiceId = null) => {
  const [finalPcs, invoicedPcs, lot] = await Promise.all([
    getFinalPcsForLot(lotId),
    sumGoodInvoicedForLot(lotId, excludeInvoiceId),
    Lot.findById(lotId).select('damagedPcs').lean()
  ]);
  return Math.max(0, finalPcs - (lot?.damagedPcs || 0) - invoicedPcs);
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

  // One batched read for all fetched lots (3 aggregations) instead of 1–3 sequential
  // queries per lot. The loop below is now pure in-memory — no awaits.
  const finalPcsByLot = await getFinalPcsForLots(lots.map((l) => l._id));

  const results = [];
  for (const lot of lots) {
    const finalPcs = finalPcsByLot.get(String(lot._id)) || 0;
    const damagedPcs = lot.damagedPcs || 0;
    const invoicedPcs = lot.invoicedPcs || 0;
    // Good remaining excludes damaged pcs (those are sold combined to a third party).
    const remainingPcs = Math.max(0, finalPcs - damagedPcs - invoicedPcs);
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
      damagedPcs,
      invoicedPcs,
      remainingPcs
    });
    if (results.length >= limit) break;
  }
  return results;
};

/**
 * List lots that have damaged pcs still available to sell — CROSS-CLIENT (not filtered by
 * clientId), since the combined-damaged invoice goes to a third-party buyer while the lots
 * belong to their original clients. Returns lots where damagedPcs - damagedSoldPcs > 0.
 * Data source for the "Combined Damaged Sale" lot picker.
 */
const getLotsWithDamagedAvailable = async ({ search, limit = 50 } = {}) => {
  const query = { damagedPcs: { $gt: 0 } };
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
    .limit(limit * 3); // overfetch; filter damagedAvailable > 0 below

  const results = [];
  for (const lot of lots) {
    const damagedAvailable = Math.max(0, (lot.damagedPcs || 0) - (lot.damagedSoldPcs || 0));
    if (damagedAvailable <= 0) continue;
    results.push({
      _id: lot._id,
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      invoiceNumber: lot.invoiceNumber,
      clientId: lot.clientId?._id,
      clientName: lot.clientId?.name, // original owner of the lot (reference only)
      clientCode: lot.clientId?.clientCode,
      fitStyleId: lot.fitStyleId?._id,
      fitStyleName: lot.fitStyleId?.name,
      fabric: lot.fabric,
      waistSize: lot.waistSize,
      date: lot.date,
      damagedPcs: lot.damagedPcs || 0,
      damagedSoldPcs: lot.damagedSoldPcs || 0,
      damagedAvailable
    });
    if (results.length >= limit) break;
  }
  return results;
};

/**
 * Paginated feed for the Pending Dispatch page. Lists production-complete lots with their
 * dispatch position. dispatchStatus is derived on read (NOT persisted to Lot.status, which
 * the production grids own): 'pending' (nothing dispatched), 'partial', 'dispatched' (all
 * good pcs invoiced). Optional `status` filter narrows to one of those.
 */
const getPendingDispatch = async ({ search, status, page = 0, limit = 25 } = {}) => {
  const query = {};
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
    .sort({ createdAt: -1 });

  const rows = [];
  for (const lot of lots) {
    const finalPcs = await getFinalPcsForLot(lot._id);
    if (finalPcs <= 0) continue; // nothing produced yet → not dispatch-relevant
    const damagedPcs = lot.damagedPcs || 0;
    const invoicedPcs = lot.invoicedPcs || 0;
    const damagedSoldPcs = lot.damagedSoldPcs || 0;
    const goodTotal = Math.max(0, finalPcs - damagedPcs);
    const goodRemaining = Math.max(0, goodTotal - invoicedPcs);
    const damagedRemaining = Math.max(0, damagedPcs - damagedSoldPcs);
    const dispatchStatus = invoicedPcs <= 0 ? 'pending' : (goodRemaining > 0 ? 'partial' : 'dispatched');
    if (status && status !== dispatchStatus) continue;
    rows.push({
      _id: lot._id,
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      invoiceNumber: lot.invoiceNumber,
      clientId: lot.clientId?._id,
      clientName: lot.clientId?.name,
      clientCode: lot.clientId?.clientCode,
      fitStyleId: lot.fitStyleId?._id,
      fitStyleName: lot.fitStyleId?.name,
      fabric: lot.fabric,
      waistSize: lot.waistSize,
      date: lot.date,
      finalPcs,
      damagedPcs,
      damagedSoldPcs,
      invoicedPcs,
      goodTotal,
      goodRemaining,
      damagedRemaining,
      dispatchStatus
    });
  }

  const total = rows.length;
  const start = page * limit;
  return { rows: rows.slice(start, start + limit), total };
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
  getFinalPcsForLots,
  sumInvoicedPcsForLot,
  sumGoodInvoicedForLot,
  sumDamagedSoldForLot,
  recalcLotInvoiced,
  getRemainingPcsForLot,
  getLotsAvailableForDispatch,
  getLotsWithDamagedAvailable,
  getPendingDispatch,
  fyShortFor,
  generateInvoiceNumber,
  generateInvoiceInternalId,
  recomputeInvoiceTotals,
  amountInWordsIndian,
  recordInvoiceHistory,
  getInvoiceHistory
};
