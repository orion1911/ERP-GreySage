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
  FitStyle,
  ManualDispatch,
  ManualDispatchHistory,
  CompanySettings
} = require('../mongodb_schema');
const { withSession, sessionOpts } = require('../utils/transaction');

const DEFAULT_INVOICE_PREFIX = 'INV';
// India has no DST, so a fixed +05:30 offset is exact for financial-year boundaries.
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Derive the final dispatchable pcs for a lot from production records.
 * Fallback chain: Finishing → Washing → Stitching. Returns 0 if no production exists.
 * `session` is optional — pass it when called inside a transaction.
 */
const getFinalPcsForLot = async (lotId, session = null) => {
  const finishingDocs = await withSession(Finishing.find({ lotId }), session);
  if (finishingDocs.length > 0) {
    return finishingDocs.reduce((sum, f) => sum + (f.quantity - (f.quantityShort || 0)), 0);
  }
  const washingDocs = await withSession(Washing.find({ lotId }), session);
  if (washingDocs.length > 0) {
    let total = 0;
    for (const w of washingDocs) {
      for (const wd of (w.washDetails || [])) {
        total += (wd.quantity - (wd.quantityShort || 0));
      }
    }
    return total;
  }
  const stitchingDocs = await withSession(Stitching.find({ lotId }), session);
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
 * Inside a transaction (session given) it also sees that transaction's own uncommitted writes.
 */
const sumLinePcsForLot = async (lotId, { excludeInvoiceId = null, lineType = 'all', session = null } = {}) => {
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

  const result = await withSession(Invoice.aggregate([
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
  ]), session);
  return result.length > 0 ? result[0].total : 0;
};

// Good (client-dispatchable) pcs invoiced — what Lot.invoicedPcs caches.
const sumGoodInvoicedForLot = (lotId, excludeInvoiceId = null, session = null) =>
  sumLinePcsForLot(lotId, { excludeInvoiceId, lineType: 'good', session });

// Damaged pcs sold to third parties — what Lot.damagedSoldPcs caches.
const sumDamagedSoldForLot = (lotId, excludeInvoiceId = null, session = null) =>
  sumLinePcsForLot(lotId, { excludeInvoiceId, lineType: 'damaged', session });

// Back-compat alias: the historical name meant good/client pcs.
const sumInvoicedPcsForLot = sumGoodInvoicedForLot;

/**
 * The production-stage status a lot's records support, mirroring exactly what the stage
 * controllers set: Stitching create → 2, Washing create → 3, Finishing create → 4,
 * finish-out (Finishing.finishOutDate) → 5. Used only to restore a lot's status after its
 * dispatch is fully reversed. A lot with no stitching record can't have had pcs to dispatch,
 * so the 1 fallback is defensive.
 */
const deriveProductionStatus = async (lotId, session = null) => {
  const fin = await withSession(Finishing.findOne({ lotId }).select('finishOutDate'), session).lean();
  if (fin) return fin.finishOutDate ? 5 : 4;
  if (await withSession(Washing.exists({ lotId }), session)) return 3;
  if (await withSession(Stitching.exists({ lotId }), session)) return 2;
  return 1;
};

/**
 * Recompute and persist BOTH Lot.invoicedPcs (good) and Lot.damagedSoldPcs (damaged),
 * AND keep the lot's dispatch status in sync (reversible):
 *   good dispatched & none remaining → 7 (Dispatched)
 *   good dispatched & some remaining → 6 (Partially Dispatched)
 *   nothing dispatched & was 6/7      → the production stage its records support
 *                                       (deriveProductionStatus) — NOT blindly 5: a lot
 *                                       invoiced straight off stitching/washing never finished
 *   otherwise                         → status untouched (still in production / already 5)
 * Call after every invoice create/update/cancel/delete and after a damaged-pcs edit.
 */
const recalcLotInvoiced = async (lotId, session = null) => {
  if (!lotId) return;
  // Sequential on purpose: operations sharing one transaction session must not run in
  // parallel. Outside a transaction this costs a few ms more than a Promise.all.
  const invoicedPcs = await sumGoodInvoicedForLot(lotId, null, session);
  const damagedSoldPcs = await sumDamagedSoldForLot(lotId, null, session);
  const finalPcs = await getFinalPcsForLot(lotId, session);
  const lot = await withSession(Lot.findById(lotId), session);
  if (!lot) return { invoicedPcs, damagedSoldPcs };

  lot.invoicedPcs = invoicedPcs;
  lot.damagedSoldPcs = damagedSoldPcs;

  // Dispatched = invoiced + manually recorded. Manual entries are pcs-only (no Invoice,
  // no ClientBalance) but count identically towards remaining pcs and lot status, so a
  // legacy lot marked dispatched by hand closes out exactly like an invoiced one.
  const totalDispatched = invoicedPcs + (lot.manualDispatchedPcs || 0);

  const goodRemaining = finalPcs - (lot.damagedPcs || 0) - totalDispatched;
  let nextStatus = lot.status;
  if (totalDispatched > 0) {
    nextStatus = goodRemaining <= 0 ? 7 : 6;
  } else if (lot.status === 6 || lot.status === 7) {
    nextStatus = await deriveProductionStatus(lot._id, session); // dispatch fully reversed
  }
  if (nextStatus !== lot.status) {
    lot.status = nextStatus;
    lot.statusHistory.push({ status: nextStatus, changedAt: new Date() });
  }

  await lot.save(sessionOpts(session));
  return { invoicedPcs, damagedSoldPcs, status: lot.status };
};

/**
 * Get remaining GOOD (client-dispatchable) pcs for a lot:
 * finalPcs - damagedPcs - goodInvoiced (excluding given invoice).
 */
/**
 * Recompute Lot.manualDispatchedPcs / manualDamagedSoldPcs from the ManualDispatch
 * collection, then re-run recalcLotInvoiced so remaining pcs and lot status pick the
 * new figures up. This is the manual-dispatch counterpart of recalcLotInvoiced and
 * MUST be called after every ManualDispatch create/update/delete — same denormalisation
 * contract as vendor/client balances.
 */
const recalcLotManualDispatch = async (lotId, session = null) => {
  if (!lotId) return;
  const agg = await withSession(ManualDispatch.aggregate([
    { $match: { lotId: new mongoose.Types.ObjectId(lotId) } },
    { $group: {
        _id: null,
        good: { $sum: { $ifNull: ['$goodPcs', 0] } },
        damaged: { $sum: { $ifNull: ['$damagedPcs', 0] } }
    } }
  ]), session);
  const good = agg[0]?.good || 0;
  const damaged = agg[0]?.damaged || 0;

  await Lot.updateOne(
    { _id: lotId },
    { $set: { manualDispatchedPcs: good, manualDamagedSoldPcs: damaged } },
    sessionOpts(session)
  );

  // Re-derives status and keeps invoicedPcs authoritative in the same pass.
  return recalcLotInvoiced(lotId, session);
};

/**
 * Capacity check for a manual dispatch, so an operator can't mark more pcs dispatched
 * than the lot physically has. Returns what's still available, optionally ignoring one
 * existing entry (so editing that entry doesn't count itself as already-consumed).
 */
const getManualDispatchCapacity = async (lotId, excludeEntryId = null, session = null) => {
  const lot = await withSession(Lot.findById(lotId), session).lean();
  if (!lot) return null;

  const finalPcs = await getFinalPcsForLot(lotId, session);
  const damagedPcs = lot.damagedPcs || 0;

  const match = { lotId: new mongoose.Types.ObjectId(lotId) };
  if (excludeEntryId) match._id = { $ne: new mongoose.Types.ObjectId(excludeEntryId) };
  const agg = await withSession(ManualDispatch.aggregate([
    { $match: match },
    { $group: {
        _id: null,
        good: { $sum: { $ifNull: ['$goodPcs', 0] } },
        damaged: { $sum: { $ifNull: ['$damagedPcs', 0] } }
    } }
  ]), session);
  const otherManualGood = agg[0]?.good || 0;
  const otherManualDamaged = agg[0]?.damaged || 0;

  const goodTotal = Math.max(0, finalPcs - damagedPcs);
  return {
    finalPcs,
    damagedPcs,
    goodTotal,
    invoicedPcs: lot.invoicedPcs || 0,
    damagedSoldPcs: lot.damagedSoldPcs || 0,
    otherManualGood,
    otherManualDamaged,
    // What THIS entry may claim.
    goodAvailable: Math.max(0, goodTotal - (lot.invoicedPcs || 0) - otherManualGood),
    damagedAvailable: Math.max(0, damagedPcs - (lot.damagedSoldPcs || 0) - otherManualDamaged)
  };
};

const recordManualDispatchHistory = async (entryId, lotId, action, beforeData, afterData, userId, session = null) => {
  await ManualDispatchHistory.create(
    [{ entryId, lotId, action, beforeData, afterData, changedBy: userId }],
    sessionOpts(session)
  );
};

const listManualDispatches = async (lotId) =>
  ManualDispatch.find({ lotId })
    .populate('createdBy', 'username')
    .sort({ dispatchDate: -1, createdAt: -1 })
    .lean();

const getRemainingPcsForLot = async (lotId, excludeInvoiceId = null) => {
  const [finalPcs, invoicedPcs, lot] = await Promise.all([
    getFinalPcsForLot(lotId),
    sumGoodInvoicedForLot(lotId, excludeInvoiceId),
    Lot.findById(lotId).select('damagedPcs manualDispatchedPcs').lean()
  ]);
  return Math.max(0, finalPcs - (lot?.damagedPcs || 0) - invoicedPcs - (lot?.manualDispatchedPcs || 0));
};

/**
 * Pcs one invoice currently holds per lot, split good / damaged. When that invoice is being
 * EDITED, the lot pickers add these back: the cached invoicedPcs / damagedSoldPcs include the
 * invoice's own lines, so without this the edit form would see its own pcs as "already gone".
 * Cancelled or unknown invoices hold nothing.
 */
const getInvoiceHeldPcs = async (invoiceId) => {
  const good = new Map();
  const damaged = new Map();
  if (!invoiceId || !mongoose.isValidObjectId(invoiceId)) return { good, damaged };
  const inv = await Invoice.findById(invoiceId).select('status lines').lean();
  if (!inv || inv.status === 'cancelled') return { good, damaged };
  for (const line of inv.lines || []) {
    const target = line.isDamaged ? damaged : good;
    const parts = (line.sources || []).length
      ? line.sources
      : (line.lotId ? [{ lotId: line.lotId, pcs: line.pcs }] : []); // samples have no lot
    for (const p of parts) {
      const key = String(p.lotId);
      target.set(key, (target.get(key) || 0) + (p.pcs || 0));
    }
  }
  return { good, damaged };
};

/** Append the held lots the main query missed (outside the overfetch window, or another owner). */
const appendHeldLots = async (lots, held, clientFields) => {
  const have = new Set(lots.map((l) => String(l._id)));
  const missing = [...held.keys()].filter((id) => !have.has(id));
  if (!missing.length) return lots;
  const extra = await Lot.find({ _id: { $in: missing } })
    .populate('clientId', clientFields)
    .populate('fitStyleId', 'name');
  return [...lots, ...extra];
};

/**
 * List lots available for dispatch (autocomplete data source).
 * Filters: clientId (optional), search (lotNumber or upstream invoiceNumber substring).
 * Returns lots with finalPcs > invoicedPcs (i.e. remainingPcs > 0).
 *
 * clientId is a PRIORITY, not a hard filter. Lots are routinely billed to a client other
 * than the one they were produced for (full or partial qty), so restricting the picker to
 * `Lot.clientId === clientId` would make a legitimate, common sale impossible to record.
 * Instead:
 *   • crossClient=false (default) → only the client's own lots + any HOUSE-LABEL lots
 *     (Client.isInternal, e.g. GREYSAGE), which are sellable to anyone by definition.
 *   • crossClient=true            → every lot with pcs remaining, any owner.
 * Either way each row carries `isOwnLot` / `isHouseLot` / `clientName` so the UI can rank
 * and visibly flag a foreign lot rather than letting one be picked by accident.
 */
const getLotsAvailableForDispatch = async ({ clientId, search, crossClient = false, includeDispatched = false, excludeInvoiceId = null, limit = 50 } = {}) => {
  const query = {};

  // House-label clients: their lots are always offered, whoever is being billed.
  const houseClientIds = (await Client.find({ isInternal: true }).select('_id').lean()).map((c) => c._id);
  const houseIdSet = new Set(houseClientIds.map(String));

  if (clientId && !crossClient) {
    // Own lots OR house-label lots. Anything else needs the explicit cross-client opt-in.
    query.clientId = { $in: [new mongoose.Types.ObjectId(clientId), ...houseClientIds] };
  }
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const orClauses = [{ lotNumber: re }];
    const asNum = parseInt(search.trim(), 10);
    if (!Number.isNaN(asNum)) orClauses.push({ invoiceNumber: asNum });
    query.$or = orClauses;
  }

  // Overfetch, because `remainingPcs > 0` can only be evaluated after the production
  // rollup below. In cross-client mode the candidate set is every client's lots, so a
  // 3× cushion would let fully-dispatched recent lots crowd the target client's older
  // open ones off the list entirely — widen it to 10×.
  const overfetch = (crossClient && !query.clientId) ? limit * 10 : limit * 3;
  // Editing an invoice: its own pcs count as available again, and every lot it holds is offered
  // even if it falls outside the overfetch window or belongs to another client.
  const held = (await getInvoiceHeldPcs(excludeInvoiceId)).good;
  const fetched = await Lot.find(query)
    .populate('clientId', 'name clientCode isInternal')
    .populate('fitStyleId', 'name')
    .sort({ createdAt: -1 })
    .limit(overfetch);
  const lots = (search && search.trim()) ? fetched : await appendHeldLots(fetched, held, 'name clientCode isInternal');

  // One batched read for all fetched lots (3 aggregations) instead of 1–3 sequential
  // queries per lot. The loop below is now pure in-memory — no awaits.
  const lotIds = lots.map((l) => l._id);
  const finalPcsByLot = await getFinalPcsForLots(lotIds);
  // Which of these lots have reached finishing (i.e. have a Finishing record — presence only,
  // finish-out date is NOT required). Drives a warn-don't-block flag: a lot can be dispatched
  // straight off stitching/washing, but the UI flags that it isn't finished yet.
  const finishedLotIds = new Set(
    (await Finishing.distinct('lotId', { lotId: { $in: lotIds } })).map(String)
  );

  const results = [];
  for (const lot of lots) {
    const finalPcs = finalPcsByLot.get(String(lot._id)) || 0;
    const damagedPcs = lot.damagedPcs || 0;
    const invoicedPcs = lot.invoicedPcs || 0;
    const manualDispatchedPcs = lot.manualDispatchedPcs || 0;
    const heldPcs = held.get(String(lot._id)) || 0; // this invoice's own pcs (edit mode)
    // Good remaining excludes damaged pcs (sold combined to a third party) AND anything
    // already marked dispatched by hand — otherwise a legacy lot could be invoiced for
    // pcs that physically left the building years ago.
    const remainingPcs = Math.max(0, finalPcs - damagedPcs - (invoicedPcs - heldPcs) - manualDispatchedPcs);
    // includeDispatched: Tax Invoice lines reference lots without consuming them (the Bill of
    // Supply owns dispatch accounting), so the Tax Invoice picker still offers dispatched lots.
    if (remainingPcs <= 0 && !includeDispatched) continue;
    const ownerId = String(lot.clientId?._id || '');
    const isHouseLot = houseIdSet.has(ownerId);
    results.push({
      _id: lot._id,
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      invoiceNumber: lot.invoiceNumber, // upstream invoice on the lot
      clientId: lot.clientId?._id,
      clientName: lot.clientId?.name,
      clientCode: lot.clientId?.clientCode,
      // Ownership vs the client being billed. The picker shows all three kinds together,
      // so the UI needs to tell them apart: own lots are the normal case, house lots are
      // free stock, and anything else is a cross-client sale that must be flagged.
      isHouseLot,                                                    // GREYSAGE-style label
      isOwnLot: !!clientId && ownerId === String(clientId),           // produced for the billed client
      isCrossClient: !!clientId && !isHouseLot && ownerId !== String(clientId),
      fitStyleId: lot.fitStyleId?._id,
      fitStyleName: lot.fitStyleId?.name,
      fabric: lot.fabric,
      waistSize: lot.waistSize,
      date: lot.date,
      finalPcs,
      damagedPcs,
      invoicedPcs,
      manualDispatchedPcs,
      remainingPcs,
      heldPcs,
      notFinished: !finishedLotIds.has(String(lot._id)) // no Finishing record yet → warn, don't block
    });
  }

  // Rank before truncating, so the target client's own lots are never pushed off the end
  // of the list by another client's newer stock. Own → house → foreign, newest first
  // within each band. Mongo can't express this ordering (it depends on the requesting
  // client), hence the in-memory pass.
  const OWNER_RANK = (r) => (r.isOwnLot ? 0 : (r.isHouseLot ? 1 : 2));
  results.sort((a, b) => {
    const rank = OWNER_RANK(a) - OWNER_RANK(b);
    if (rank !== 0) return rank;
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });
  // Keep every lot the edited invoice holds, even past the limit — dropping one would blank its line.
  const top = results.slice(0, limit);
  results.slice(limit).forEach((r) => { if (r.heldPcs > 0) top.push(r); });
  return top;
};

/**
 * List lots that have damaged pcs still available to sell — CROSS-CLIENT (not filtered by
 * clientId), since the combined-damaged invoice goes to a third-party buyer while the lots
 * belong to their original clients. Returns lots where damagedPcs - damagedSoldPcs > 0.
 * Data source for the "Combined Damaged Sale" lot picker.
 */
const getLotsWithDamagedAvailable = async ({ search, excludeInvoiceId = null, limit = 50 } = {}) => {
  const query = { damagedPcs: { $gt: 0 } };
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const orClauses = [{ lotNumber: re }];
    const asNum = parseInt(search.trim(), 10);
    if (!Number.isNaN(asNum)) orClauses.push({ invoiceNumber: asNum });
    query.$or = orClauses;
  }

  const held = (await getInvoiceHeldPcs(excludeInvoiceId)).damaged; // edit mode: this invoice's own damaged pcs
  const fetched = await Lot.find(query)
    .populate('clientId', 'name clientCode')
    .populate('fitStyleId', 'name')
    .sort({ createdAt: -1 })
    .limit(limit * 3); // overfetch; filter damagedAvailable > 0 below
  const lots = (search && search.trim()) ? fetched : await appendHeldLots(fetched, held, 'name clientCode');

  const results = [];
  for (const lot of lots) {
    // Nets off manually-recorded damaged sales too — damaged pcs disposed of outside the
    // invoicing flow are gone and must not be offered again in the combined-sale picker.
    const damagedAvailable = Math.max(
      0,
      (lot.damagedPcs || 0) - ((lot.damagedSoldPcs || 0) - (held.get(String(lot._id)) || 0)) - (lot.manualDamagedSoldPcs || 0)
    );
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
      manualDamagedSoldPcs: lot.manualDamagedSoldPcs || 0,
      damagedAvailable
    });
    if (results.length >= limit && !held.size) break; // editing: keep scanning so held lots aren't dropped
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
    .select('lotId lotNumber invoiceNumber clientId fitStyleId fabric waistSize date damagedPcs invoicedPcs damagedSoldPcs manualDispatchedPcs manualDamagedSoldPcs createdAt')
    .populate('clientId', 'name clientCode isInternal')
    .populate('fitStyleId', 'name')
    .sort({ date: 1, createdAt: 1 }) // oldest first — this board is a backlog to work down
    .lean();

  // Batch the production lookup: one set of 3 aggregations for ALL lots instead of
  // 1–3 sequential queries per lot (the old per-lot getFinalPcsForLot loop blew past
  // the request timeout in prod once the lot count grew).
  const finalPcsByLot = await getFinalPcsForLots(lots.map((l) => l._id));

  const rows = [];
  for (const lot of lots) {
    const finalPcs = finalPcsByLot.get(String(lot._id)) || 0;
    if (finalPcs <= 0) continue; // nothing produced yet → not dispatch-relevant
    const damagedPcs = lot.damagedPcs || 0;
    const invoicedPcs = lot.invoicedPcs || 0;
    const damagedSoldPcs = lot.damagedSoldPcs || 0;
    const manualDispatchedPcs = lot.manualDispatchedPcs || 0;
    const manualDamagedSoldPcs = lot.manualDamagedSoldPcs || 0;

    // Invoiced and manually-recorded pcs are interchangeable for dispatch purposes —
    // both mean "these left the building". Only the money differs, and manual entries
    // deliberately carry none.
    const dispatchedPcs = invoicedPcs + manualDispatchedPcs;
    const damagedGonePcs = damagedSoldPcs + manualDamagedSoldPcs;

    const goodTotal = Math.max(0, finalPcs - damagedPcs);
    const goodRemaining = Math.max(0, goodTotal - dispatchedPcs);
    const damagedRemaining = Math.max(0, damagedPcs - damagedGonePcs);
    const dispatchStatus = dispatchedPcs <= 0 ? 'pending' : (goodRemaining > 0 ? 'partial' : 'dispatched');
    if (status && status !== dispatchStatus) continue;
    rows.push({
      _id: lot._id,
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      invoiceNumber: lot.invoiceNumber,
      clientId: lot.clientId?._id,
      clientName: lot.clientId?.name,
      clientCode: lot.clientId?.clientCode,
      // House label (GREYSAGE): the lot has no buyer yet, so the invoice this row launches
      // must ask who is buying rather than assuming the lot's owner.
      isHouseLot: !!lot.clientId?.isInternal,
      fitStyleId: lot.fitStyleId?._id,
      fitStyleName: lot.fitStyleId?.name,
      fabric: lot.fabric,
      waistSize: lot.waistSize,
      date: lot.date,
      finalPcs,
      damagedPcs,
      damagedSoldPcs,
      invoicedPcs,
      manualDispatchedPcs,
      manualDamagedSoldPcs,
      dispatchedPcs,
      goodTotal,
      goodRemaining,
      damagedRemaining,
      dispatchStatus
    });
  }

  // Oldest pending first. dispatchStatus is computed in memory above (it depends on
  // production + invoice + manual figures, none of which are sortable in Mongo), so the
  // ordering is applied here — before pagination slices the page, so page 1 really is
  // the oldest outstanding work rather than the oldest slice of an arbitrary order.
  //
  // Outstanding lots rank above fully-dispatched ones: an old lot that's already gone
  // out is history, not backlog, and shouldn't push genuinely pending work down the
  // list. Drop STATUS_RANK from the comparator below for a pure oldest-first date sort.
  const STATUS_RANK = { pending: 0, partial: 1, dispatched: 2 };
  rows.sort((a, b) => {
    const rank = (STATUS_RANK[a.dispatchStatus] ?? 9) - (STATUS_RANK[b.dispatchStatus] ?? 9);
    if (rank !== 0) return rank;
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB; // oldest first
    return String(a.lotNumber || '').localeCompare(String(b.lotNumber || ''));
  });

  const total = rows.length;
  const start = page * limit;
  return { rows: rows.slice(start, start + limit), total };
};

/**
 * Fiscal-year code, e.g. any date in FY 2026-27 → '2627'. FY starts 1 April, evaluated in
 * IST regardless of the server's timezone (Vercel runs UTC). Previously getMonth() ran in
 * UTC, so an invoice raised 00:00–05:29 IST on 1 April got the PREVIOUS year's series.
 */
const fyShortFor = (date) => {
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1; // months are 0-indexed
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
};

/** '2627' → true; '2628', '26', 'abcd' → false. */
const isValidFyShort = (fy) => {
  const s = String(fy || '');
  if (!/^\d{4}$/.test(s)) return false;
  return (parseInt(s.slice(0, 2), 10) + 1) % 100 === parseInt(s.slice(2), 10);
};

/**
 * Split an invoice number into { fy, seq } — prefix-agnostic, so it works for any prefix
 * ever used. 'INV2627/42' → { fy: '2627', seq: 42 }. Trailing whitespace tolerated (same
 * rule as scripts/rollbackInvoices.js). Returns null for anything else.
 */
const INVOICE_NUMBER_RE = /(\d{4})\/(\d+)\s*$/;
const parseInvoiceNumber = (invoiceNumber) => {
  const m = INVOICE_NUMBER_RE.exec(String(invoiceNumber || ''));
  if (!m || !isValidFyShort(m[1])) return null;
  return { fy: m[1], seq: parseInt(m[2], 10) };
};

/** The invoice-number prefix stored in CompanySettings (locked: the API never updates it). */
const getInvoicePrefix = async (session = null) => {
  const s = await withSession(CompanySettings.findOne().select('defaultInvoicePrefix'), session).lean();
  return s?.defaultInvoicePrefix || DEFAULT_INVOICE_PREFIX;
};

/**
 * Write-lock lots for the rest of the current transaction. Call FIRST inside
 * runInTransaction, before reading any availability figure: a concurrent transaction that
 * touches the same lot then gets a WriteConflict and is retried after this one commits, so
 * its availability check sees our pcs. See Lot.dispatchLockSeq in mongodb_schema.js.
 */
const lockLotsForDispatch = async (lotIds, session) => {
  const ids = [...new Set((lotIds || []).filter(Boolean).map(String))];
  if (!ids.length) return;
  await Lot.updateMany({ _id: { $in: ids } }, { $inc: { dispatchLockSeq: 1 } }, sessionOpts(session));
};

/**
 * Atomically generate the next invoiceNumber for the given date's FY.
 * Counter `_id` = "invoice-{fyShort}" — ONE series per FY shared by every document type.
 * Call inside a transaction so the increment rolls back if the invoice save fails.
 */
const generateInvoiceNumber = async (date, prefix = DEFAULT_INVOICE_PREFIX, session = null) => {
  const fy = fyShortFor(date);
  const counterId = `invoice-${fy}`;
  const counter = await Counter.findByIdAndUpdate(
    { _id: counterId },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, ...sessionOpts(session) }
  );
  return `${prefix}${fy}/${counter.sequence}`;
};

/**
 * Generate internal invoiceId (mirror of LT-…) e.g. INV-20260516007.
 */
const generateInvoiceInternalId = async (session = null) => {
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'invoiceInternalId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, ...sessionOpts(session) }
  );
  const seq = counter.sequence.toString().padStart(3, '0');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${dateStr}${seq}`;
};

// ─── Number series ───────────────────────────────────────────────────────────
// Bills of Supply and Tax Invoices run INDEPENDENT series per FY, each with its own Counter:
//   Bill of Supply → "invoice-{fy}"     → INV2627/36            (unpadded, as before)
//   Tax Invoice    → "taxinvoice-{fy}"  → INV2627/43, INV2728/01 (2-digit minimum)
// The same printed number can therefore exist once per type; uniqueness is per collection.
const BILL_OF_SUPPLY_COUNTER_PREFIX = 'invoice';
const TAX_INVOICE_COUNTER_PREFIX = 'taxinvoice';

const seriesCounterId = (documentType, fy) =>
  `${documentType === 'TAX_INVOICE' ? TAX_INVOICE_COUNTER_PREFIX : BILL_OF_SUPPLY_COUNTER_PREFIX}-${fy}`;

const formatInvoiceNumber = (documentType, prefix, fy, seq) =>
  `${prefix}${fy}/${documentType === 'TAX_INVOICE' ? String(seq).padStart(2, '0') : seq}`;

/** Tax Invoice series prefix from CompanySettings (locked like the Bill of Supply prefix). */
const getTaxInvoicePrefix = async (session = null) => {
  const s = await withSession(CompanySettings.findOne().select('taxInvoicePrefix'), session).lean();
  return s?.taxInvoicePrefix || DEFAULT_INVOICE_PREFIX;
};

/** Next Tax Invoice number for the date's FY. Call inside a transaction (rolls back on failure). */
const generateTaxInvoiceNumber = async (date, prefix = DEFAULT_INVOICE_PREFIX, session = null) => {
  const fy = fyShortFor(date);
  const counter = await Counter.findByIdAndUpdate(
    { _id: seriesCounterId('TAX_INVOICE', fy) },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, ...sessionOpts(session) }
  );
  return formatInvoiceNumber('TAX_INVOICE', prefix, fy, counter.sequence);
};

/** Internal Tax Invoice id, e.g. TI-20261006007. */
const generateTaxInvoiceInternalId = async (session = null) => {
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'taxInvoiceInternalId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, ...sessionOpts(session) }
  );
  const seq = counter.sequence.toString().padStart(3, '0');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TI-${dateStr}${seq}`;
};

// Money is computed in integer paise so float drift (0.1 + 0.2 style) can't reach a stored
// amount. Rates and round-off are validated to ≤ 2 decimals before they get here, so
// toPaise() is exact for them.
const toPaise = (n) => Math.round((Number(n) || 0) * 100);

/**
 * Recompute subTotal, total, totalQty from lines + roundOff. Mutates `invoice` in place.
 */
const recomputeInvoiceTotals = (invoice) => {
  let subTotalPaise = 0;
  let totalQty = 0;
  invoice.lines.forEach((line, idx) => {
    line.lineNo = idx + 1;
    const amountPaise = (line.pcs || 0) * toPaise(line.rate);
    line.amount = amountPaise / 100;
    subTotalPaise += amountPaise;
    totalQty += line.pcs || 0;
  });
  invoice.subTotal = subTotalPaise / 100;
  invoice.total = (subTotalPaise + toPaise(invoice.roundOff)) / 100;
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
const recordInvoiceHistory = async (invoiceId, action, beforeData, afterData, userId, session = null, documentType = 'BILL_OF_SUPPLY') => {
  const entry = new InvoiceHistory({
    invoiceId,
    documentType,
    action,
    beforeData: beforeData || null,
    afterData: afterData || null,
    changedBy: userId
  });
  await entry.save(sessionOpts(session));
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
  deriveProductionStatus,
  recalcLotInvoiced,
  recalcLotManualDispatch,
  getManualDispatchCapacity,
  recordManualDispatchHistory,
  listManualDispatches,
  getRemainingPcsForLot,
  getLotsAvailableForDispatch,
  getLotsWithDamagedAvailable,
  getPendingDispatch,
  fyShortFor,
  isValidFyShort,
  parseInvoiceNumber,
  getInvoicePrefix,
  lockLotsForDispatch,
  DEFAULT_INVOICE_PREFIX,
  generateInvoiceNumber,
  generateInvoiceInternalId,
  BILL_OF_SUPPLY_COUNTER_PREFIX,
  TAX_INVOICE_COUNTER_PREFIX,
  seriesCounterId,
  formatInvoiceNumber,
  getTaxInvoicePrefix,
  generateTaxInvoiceNumber,
  generateTaxInvoiceInternalId,
  recomputeInvoiceTotals,
  amountInWordsIndian,
  recordInvoiceHistory,
  getInvoiceHistory
};
