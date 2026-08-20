const mongoose = require('mongoose');
const {
  Invoice,
  Client,
  Lot,
  CompanySettings,
  ManualDispatch
} = require('../mongodb_schema');
const {
  getLotsAvailableForDispatch,
  getLotsWithDamagedAvailable,
  getPendingDispatch,
  getFinalPcsForLot,
  sumGoodInvoicedForLot,
  sumDamagedSoldForLot,
  recalcLotInvoiced,
  recalcLotManualDispatch,
  getManualDispatchCapacity,
  recordManualDispatchHistory,
  listManualDispatches,
  generateInvoiceNumber,
  generateInvoiceInternalId,
  recomputeInvoiceTotals,
  recordInvoiceHistory,
  getInvoiceHistory
} = require('../services/invoiceService');
const { updateClientBalance } = require('../services/clientBalanceService');
const { bumpVersion } = require('../services/cache');
const { invalidateDashboard } = require('../services/dashboardCache');
const CLEDGER = 'cledger'; // must match clientBalanceController's client-ledger cache namespace
const { logAction } = require('../utils/logger');

const toPlainAddress = (addr) => (addr?.toObject ? addr.toObject() : (addr || {}));

/**
 * Snapshot a client into the shape stored on the Invoice. Frozen at issue time.
 * When `firm` (a Client.billingFirms subdoc) is given, its identity (billingName/gstin/pan
 * + billing/shipping address) is what gets frozen; otherwise the client-level default is used.
 * `name`/`clientCode`/`phone`/`email` always come from the client.
 */
const snapshotClient = (client, firm = null) => ({
  clientSnapshot: {
    name: client.name,
    // Firm name printed on the invoice. Falls back to display name if blank.
    billingName: (firm?.billingName) || client.billingName || client.name,
    clientCode: client.clientCode,
    gstin: firm ? firm.gstin : client.gstin,
    pan: firm ? firm.pan : client.pan,
    phone: (firm ? firm.contact : client.contact) || client.contact,
    email: client.email
  },
  billTo: toPlainAddress(firm ? firm.billingAddress : client.billingAddress),
  shipTo: toPlainAddress(firm ? firm.shippingAddress : client.shippingAddress)
});

/**
 * Every lot id touched by a set of lines — both a single-lot line's `lotId` and a merged
 * line's `sources[].lotId` — as a de-duplicated array of strings. Used to fan out
 * recalcLotInvoiced() after a create/update/cancel/delete so every affected lot is recomputed.
 */
const collectLotIds = (lines = []) => {
  const ids = new Set();
  for (const l of lines) {
    if (l.lotId) ids.add(String(l.lotId));
    for (const s of (l.sources || [])) {
      if (s.lotId) ids.add(String(s.lotId));
    }
  }
  return [...ids];
};

/**
 * Validate the incoming line payload — return the line subdoc shape after enrichment.
 * Each line draws from either the lot's GOOD pool (finalPcs − damagedPcs) or, when
 * `isDamaged` is set, the DAMAGED pool (damagedPcs). Verifies pcs ≤ remaining for the
 * relevant pool (excluding the invoice we're editing).
 *
 * `invoiceClientId` is the party being BILLED. It is deliberately NOT required to match
 * the lot's owner — full or partial qty of a lot produced for one client is routinely
 * sold to another. What the mismatch does trigger is:
 *   • lotClientIdSnapshot frozen onto the line/source, so the sale stays reconcilable
 *     against production attribution forever, and
 *   • a mandatory remark on GOOD cross-client lines, so a mis-picked lot can't be billed
 *     to the wrong client silently. Damaged and house-label lines are exempt: both are
 *     cross-client by design, not by exception.
 */
const buildAndValidateLines = async (rawLines, excludeInvoiceId = null, invoiceClientId = null) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error('Invoice must have at least one line item');
  }
  const lines = [];
  // Track per-lot pcs added in this single invoice, separately per pool (good vs damaged).
  const goodInThisInvoice = new Map();
  const damagedInThisInvoice = new Map();
  // Memoised "is this lot's owner a house label?" lookups — a merged line can touch many
  // lots and most invoices reuse the same few owners.
  const internalByClient = new Map();
  const isHouseClient = async (cid) => {
    if (!cid) return false;
    const key = String(cid);
    if (!internalByClient.has(key)) {
      const c = await Client.findById(cid).select('isInternal').lean();
      internalByClient.set(key, !!c?.isInternal);
    }
    return internalByClient.get(key);
  };

  // Reserve `pcs` from one lot's good/damaged pool, validating against what remains (excluding
  // this invoice) plus what earlier lines/sources in THIS invoice already consumed. Returns the
  // lot's frozen snapshot fields. Shared by single-lot lines AND each source of a merged line,
  // so a lot referenced from several lines/sources is still validated against one shared pool.
  const consumeFromLot = async (lotId, pcs, isDamaged, label) => {
    const lot = await Lot.findById(lotId).lean();
    if (!lot) throw new Error(`${label}: lot not found`);
    const damagedPcs = lot.damagedPcs || 0;

    if (isDamaged) {
      // Combined-damaged third-party sale — draws from the lot's damaged pool.
      const otherSold = await sumDamagedSoldForLot(lot._id, excludeInvoiceId);
      const already = damagedInThisInvoice.get(String(lot._id)) || 0;
      const remaining = damagedPcs - otherSold - already;
      if (pcs > remaining) {
        throw new Error(
          `${label}: lot ${lot.lotNumber} only has ${remaining} DAMAGED pcs available ` +
          `(damaged ${damagedPcs}, already sold elsewhere ${otherSold}` +
          (already > 0 ? `, in this invoice ${already}` : '') + ')'
        );
      }
      damagedInThisInvoice.set(String(lot._id), already + pcs);
    } else {
      // Good dispatch to the assigned client — draws from finalPcs − damagedPcs.
      const finalPcs = await getFinalPcsForLot(lot._id);
      const otherInvoicedPcs = await sumGoodInvoicedForLot(lot._id, excludeInvoiceId);
      const already = goodInThisInvoice.get(String(lot._id)) || 0;
      const remaining = finalPcs - damagedPcs - otherInvoicedPcs - already;
      if (pcs > remaining) {
        throw new Error(
          `${label}: lot ${lot.lotNumber} only has ${remaining} pcs remaining ` +
          `(final ${finalPcs}, damaged set-aside ${damagedPcs}, already invoiced elsewhere ${otherInvoicedPcs}` +
          (already > 0 ? `, in this invoice ${already}` : '') + ')'
        );
      }
      goodInThisInvoice.set(String(lot._id), already + pcs);
    }

    // Cross-client = the lot was produced for someone else and this is NOT a house-label
    // lot (which is common stock) and NOT a damaged line (already a third-party sale by
    // definition). Computed here, from the DB, so the caller can never assert it itself.
    const ownerId = String(lot.clientId || '');
    const differs = !!invoiceClientId && ownerId !== String(invoiceClientId);
    const needsJustification = differs && !isDamaged && !(await isHouseClient(lot.clientId));

    return {
      lotId: lot._id,
      lotNumberSnapshot: lot.lotNumber,
      lotInvoiceNumberSnapshot: lot.invoiceNumber,
      lotClientIdSnapshot: lot.clientId || null,
      needsJustification
    };
  };

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const label = `Line ${i + 1}`;
    const isSample = !!raw.isSample;
    // Sample lines are non-chargeable regardless of any rate the client sends.
    const rate = isSample ? 0 : Number(raw.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error(`${label}: rate must be a non-negative number`);
    }
    if (!raw.description || !String(raw.description).trim()) {
      throw new Error(`${label}: description is required`);
    }

    const isMerged = !isSample && Array.isArray(raw.sources) && raw.sources.length > 0;
    const isDamaged = !isSample && !!raw.isDamaged;
    // Set by consumeFromLot when this line (or any of a merged line's sources) draws from
    // another client's lot. Checked after the pools are validated so the operator gets the
    // availability error first when both are wrong.
    let crossClientLine = false;

    const line = {
      lineNo: i + 1,
      description: String(raw.description).trim(),
      remark: raw.remark ? String(raw.remark).trim() : undefined,
      internalNote: raw.internalNote ? String(raw.internalNote).trim() : undefined,
      hsnSac: raw.hsnSac ? String(raw.hsnSac).trim() : undefined,
      unit: raw.unit ? String(raw.unit).trim() : '',
      rate
    };

    if (isSample) {
      // SAMPLE line — no lot, no pool decrement, amount 0. Only needs a positive qty so
      // the printed "samples included" count is meaningful; totalQty picks it up downstream.
      const pcs = parseInt(raw.pcs, 10);
      if (!Number.isInteger(pcs) || pcs < 1) {
        throw new Error(`${label}: sample pcs must be a positive integer`);
      }
      line.pcs = pcs;
      line.isSample = true;
      line.amount = 0;
      lines.push(line);
      continue;
    }

    if (isMerged) {
      // MERGED line — pcs is the sum of its per-lot sources; each source subtracts from its lot,
      // but the line prints as a single row. lotId/lotNumberSnapshot stay blank (description carries it).
      const builtSources = [];
      let total = 0;
      for (let j = 0; j < raw.sources.length; j++) {
        const s = raw.sources[j];
        const sLabel = `${label} source ${j + 1}`;
        const sPcs = parseInt(s.pcs, 10);
        if (!Number.isInteger(sPcs) || sPcs < 1) {
          throw new Error(`${sLabel}: pcs must be a positive integer`);
        }
        if (!s.lotId) throw new Error(`${sLabel}: lotId is required`);
        const { needsJustification, ...snap } = await consumeFromLot(s.lotId, sPcs, isDamaged, sLabel);
        if (needsJustification) crossClientLine = true;
        builtSources.push({ ...snap, pcs: sPcs });
        total += sPcs;
      }
      // A merged line needs at least two sources to be meaningful, but one is allowed.
      // If the client also sent an explicit pcs, it must agree with the sources.
      const rawPcs = raw.pcs;
      if (rawPcs !== undefined && rawPcs !== null && rawPcs !== '' && parseInt(rawPcs, 10) !== total) {
        throw new Error(`${label}: pcs (${parseInt(rawPcs, 10)}) must equal the sum of its source pcs (${total})`);
      }
      line.pcs = total;
      line.sources = builtSources;
      line.isDamaged = isDamaged;
    } else {
      const pcs = parseInt(raw.pcs, 10);
      if (!Number.isInteger(pcs) || pcs < 1) {
        throw new Error(`${label}: pcs must be a positive integer`);
      }
      line.pcs = pcs;
      if (raw.lotId) {
        const snap = await consumeFromLot(raw.lotId, pcs, isDamaged, label);
        line.lotId = snap.lotId;
        line.lotNumberSnapshot = snap.lotNumberSnapshot;
        line.lotInvoiceNumberSnapshot = snap.lotInvoiceNumberSnapshot;
        line.lotClientIdSnapshot = snap.lotClientIdSnapshot;
        line.isDamaged = isDamaged;
        if (snap.needsJustification) crossClientLine = true;
      }
    }

    // Billing another client's goods is allowed but never accidental: without a note there
    // is nothing explaining why ADAM HILL's lot went out on GLOBUS's bill, and a mis-picked
    // lot looks identical to a deliberate reassignment. internalNote — NOT remark — because
    // remark prints on the PDF and the buyer must not see the other client's name.
    if (crossClientLine && !line.internalNote) {
      throw new Error(
        `${label}: this lot was produced for another client. Add an internal note explaining ` +
        `the reassignment (not printed on the invoice).`
      );
    }

    line.amount = line.pcs * rate;
    lines.push(line);
  }
  return lines;
};

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /api/sales-invoices/lots-available?clientId=&search=&crossClient=
 * crossClient=true widens the pool to every client's lots (a lot produced for one client
 * being billed to another). clientId still ranks the results — own lots first.
 */
const getLotsAvailable = async (req, res) => {
  const { clientId, search } = req.query;
  const crossClient = req.query.crossClient === 'true' || req.query.crossClient === '1';
  const lots = await getLotsAvailableForDispatch({ clientId, search, crossClient });
  res.json(lots);
};

/**
 * GET /api/sales-invoices/lots-damaged-available?search=
 * Cross-client list of lots with damaged pcs still available (for the combined-damaged sale).
 */
const getLotsDamagedAvailable = async (req, res) => {
  const { search } = req.query;
  const lots = await getLotsWithDamagedAvailable({ search });
  res.json(lots);
};

/**
 * GET /api/sales-invoices/pending-dispatch?search=&status=&page=&limit=
 * Paginated dispatch-position feed for the Pending Dispatch page → { rows, total }.
 */
const getPendingDispatchList = async (req, res) => {
  const { search, status } = req.query;
  const page = parseInt(req.query.page, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 25;
  const result = await getPendingDispatch({ search, status, page, limit });
  res.json(result);
};

/**
 * PATCH /api/sales-invoices/lots/:lotId/damaged  — body { damagedPcs }
 * Set/adjust the damaged-pieces pool held back from the assigned client.
 * Guards against stranding already-dispatched good pcs or unsetting already-sold damaged pcs.
 */
const updateLotDamaged = async (req, res) => {
  const { lotId } = req.params;
  const damagedPcs = parseInt(req.body.damagedPcs, 10);
  if (!Number.isInteger(damagedPcs) || damagedPcs < 0) {
    return res.status(400).json({ error: 'damagedPcs must be a non-negative integer' });
  }

  const lot = await Lot.findById(lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const finalPcs = await getFinalPcsForLot(lot._id);
  const invoicedPcs = lot.invoicedPcs || 0;     // good pcs already dispatched
  const damagedSoldPcs = lot.damagedSoldPcs || 0; // damaged pcs already sold

  // Can't set aside more than what's left after good dispatch.
  if (damagedPcs > finalPcs - invoicedPcs) {
    return res.status(400).json({
      error: `Cannot set ${damagedPcs} damaged — only ${finalPcs - invoicedPcs} pcs remain undispatched ` +
        `(final ${finalPcs}, good dispatched ${invoicedPcs}).`
    });
  }
  // Can't drop the pool below what's already been sold to third parties.
  if (damagedPcs < damagedSoldPcs) {
    return res.status(400).json({
      error: `Cannot set ${damagedPcs} damaged — ${damagedSoldPcs} damaged pcs have already been sold.`
    });
  }

  lot.damagedPcs = damagedPcs;
  await lot.save();
  await recalcLotInvoiced(lot._id); // keep caches consistent

  await logAction(req.user.userId, 'update_lot_damaged', 'Lot', lot._id,
    `Set damaged pcs to ${damagedPcs} for lot ${lot.lotNumber}`);

  await invalidateDashboard(); // damagedPcs feeds the awaiting-dispatch subtraction

  res.json({
    _id: lot._id,
    lotNumber: lot.lotNumber,
    finalPcs,
    damagedPcs: lot.damagedPcs,
    damagedSoldPcs,
    invoicedPcs,
    goodRemaining: Math.max(0, finalPcs - lot.damagedPcs - invoicedPcs),
    damagedRemaining: Math.max(0, lot.damagedPcs - damagedSoldPcs)
  });
};

/**
 * POST /api/sales-invoices
 */
const createInvoice = async (req, res) => {
  const {
    date,
    clientId,
    billingFirmId,
    placeOfSupply,
    lines,
    roundOff = 0,
    documentType
  } = req.body;

  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!clientId) return res.status(400).json({ error: 'Client is required' });

  const client = await Client.findById(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  // A house label (GREYSAGE) owns lots but is not a customer — there is nobody to bill and
  // no receivable to raise. Its stock is sold BY selecting its lots on a real client's invoice.
  if (client.isInternal) {
    return res.status(400).json({
      error: `${client.name} is an in-house label, not a billable client. ` +
        `Raise the invoice against the buying client and pick ${client.name}'s lots on the lines.`
    });
  }

  // Resolve the chosen billing firm (sub-biller). null = client default identity.
  const firm = billingFirmId ? client.billingFirms.id(billingFirmId) : null;
  if (billingFirmId && !firm) return res.status(400).json({ error: 'Billing firm not found on client' });

  const builtLines = await buildAndValidateLines(lines, null, clientId);

  const settings = await CompanySettings.findOne();
  const prefix = settings?.defaultInvoicePrefix || 'INV';
  const docType = documentType || settings?.defaultDocumentType || 'BILL_OF_SUPPLY';

  const invoiceNumber = await generateInvoiceNumber(date, prefix);
  const invoiceId = await generateInvoiceInternalId();

  // Derive Place of Supply from the chosen firm's shipping address (fall back to billing),
  // then to the client's. Client request may still override with an explicit placeOfSupply.
  const ship = (firm ? firm.shippingAddress : client.shippingAddress);
  const bill = (firm ? firm.billingAddress : client.billingAddress);
  const posSrc = (ship?.state || ship?.stateCode) ? ship : bill;
  const derivedPos = {
    stateName: posSrc?.state || '',
    stateCode: posSrc?.stateCode || ''
  };

  const invoice = new Invoice({
    invoiceId,
    invoiceNumber,
    documentType: docType,
    date: new Date(date),
    clientId,
    billingFirmId: firm?._id || null,
    ...snapshotClient(client, firm),
    placeOfSupply: placeOfSupply || derivedPos,
    lines: builtLines,
    roundOff: Number(roundOff) || 0,
    status: 'issued',
    createdBy: req.user.userId
  });
  recomputeInvoiceTotals(invoice);
  await invoice.save();

  // Update per-lot invoicedPcs cache and the client balance
  const affectedLotIds = collectLotIds(builtLines);
  await Promise.all(affectedLotIds.map((id) => recalcLotInvoiced(id)));
  await updateClientBalance(clientId);
  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs

  await recordInvoiceHistory(invoice._id, 'create', null, invoice.toObject(), req.user.userId);
  await logAction(req.user.userId, 'create_invoice', 'Invoice', invoice._id, `Created invoice ${invoiceNumber} for ${client.name}`);

  res.status(201).json(invoice);
};

/**
 * PATCH /api/sales-invoices/:id  — update an issued invoice
 */
const updateInvoice = async (req, res) => {
  const { id } = req.params;
  const existing = await Invoice.findById(id);
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  if (existing.status === 'cancelled') {
    return res.status(400).json({ error: 'Cancelled invoices cannot be edited' });
  }

  const before = existing.toObject();
  const prevLotIds = new Set(collectLotIds(existing.lines));

  const {
    date,
    placeOfSupply,
    lines,
    roundOff,
    documentType
  } = req.body;

  if (Array.isArray(lines)) {
    // existing.clientId, not the request — the bill-to party is frozen at issue and an edit
    // must be judged cross-client against the same client the invoice was raised for.
    existing.lines = await buildAndValidateLines(lines, existing._id, existing.clientId);
  }
  if (date) existing.date = new Date(date);
  if (placeOfSupply) existing.placeOfSupply = placeOfSupply;
  if (roundOff !== undefined) existing.roundOff = Number(roundOff) || 0;
  if (documentType) existing.documentType = documentType;

  // Refresh client snapshot if the underlying client was updated since issue?
  // Spec: snapshots are FROZEN. Do not refresh.

  existing.updatedBy = req.user.userId;
  existing.updatedAt = new Date();
  recomputeInvoiceTotals(existing);
  await existing.save();

  // Recalc all lots that were ever on this invoice (added, removed, or kept)
  const nextLotIds = new Set(collectLotIds(existing.lines));
  const allAffected = new Set([...prevLotIds, ...nextLotIds]);
  await Promise.all([...allAffected].map((lid) => recalcLotInvoiced(lid)));
  await updateClientBalance(existing.clientId);
  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs

  await recordInvoiceHistory(existing._id, 'update', before, existing.toObject(), req.user.userId);
  await logAction(req.user.userId, 'update_invoice', 'Invoice', existing._id, `Updated invoice ${existing.invoiceNumber}`);

  res.json(existing);
};

/**
 * POST /api/sales-invoices/:id/cancel — soft-cancel; lots return to remaining pool.
 */
const cancelInvoice = async (req, res) => {
  const { id } = req.params;
  const invoice = await Invoice.findById(id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'cancelled') {
    return res.status(400).json({ error: 'Already cancelled' });
  }

  const before = invoice.toObject();
  invoice.status = 'cancelled';
  invoice.updatedBy = req.user.userId;
  invoice.updatedAt = new Date();
  await invoice.save();

  const affectedLotIds = collectLotIds(invoice.lines);
  await Promise.all(affectedLotIds.map((lid) => recalcLotInvoiced(lid)));
  await updateClientBalance(invoice.clientId);
  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs

  await recordInvoiceHistory(invoice._id, 'cancel', before, invoice.toObject(), req.user.userId);
  await logAction(req.user.userId, 'cancel_invoice', 'Invoice', invoice._id, `Cancelled invoice ${invoice.invoiceNumber}`);

  res.json(invoice);
};

/**
 * DELETE /api/sales-invoices/:id — hard delete (admin-only typically; same effect on balances).
 */
const deleteInvoice = async (req, res) => {
  const { id } = req.params;
  const invoice = await Invoice.findById(id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const before = invoice.toObject();
  const clientId = invoice.clientId;
  const affectedLotIds = collectLotIds(invoice.lines);

  await Invoice.findByIdAndDelete(id);
  await Promise.all(affectedLotIds.map((lid) => recalcLotInvoiced(lid)));
  await updateClientBalance(clientId);
  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs

  await recordInvoiceHistory(id, 'delete', before, null, req.user.userId);
  await logAction(req.user.userId, 'delete_invoice', 'Invoice', id, `Deleted invoice ${invoice.invoiceNumber}`);

  res.json({ message: 'Invoice deleted' });
};

// Timezone the invoice DATE is grouped in. `date` is the user-selected invoice date (may carry a
// stray time-of-day), so the default sort groups by CALENDAR DAY (time ignored) then invoice #.
// India-only app → group in IST so the grouped day matches what users pick/see.
const LIST_TZ = 'Asia/Kolkata';

/**
 * Build the $sort spec for the invoices aggregation. `_day` is a 'YYYY-MM-DD' string (date with
 * the time truncated, in IST) so day-level grouping is exact and lexical order == chronological.
 * `createdAt` stands in for invoice # (issued by a monotonic per-FY counter → createdAt order ==
 * issue order, with no "/10 before /2" lexical artifacts). Non-day sorts tie-break by day+invoice.
 */
const buildInvoiceSort = (sortBy, sortDir) => {
  const dir = sortDir === 'asc' ? 1 : -1;
  switch (sortBy) {
    case 'invoice': return { createdAt: dir };
    case 'client': return { 'clientSnapshot.name': dir, _day: -1, createdAt: -1 };
    case 'totalQty': return { totalQty: dir, _day: -1, createdAt: -1 };
    case 'date':
    default: return { _day: dir, createdAt: dir }; // default: date (day, time ignored), then invoice #
  }
};

/**
 * GET /api/sales-invoices?clientId=&from=&to=&status=&search=&page=&limit=&sortBy=&sortDir=
 * Server-side filtered, sorted, and paged. Returns { rows, total }.
 * Uses an aggregation (not find) so the default can sort by calendar day ignoring the time.
 */
const listInvoices = async (req, res) => {
  const { clientId, from, to, status, search, sortBy = 'date', sortDir = 'desc' } = req.query;
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));

  const match = {};
  // Aggregation $match does NOT cast like find(): convert the clientId string to an ObjectId.
  if (clientId) match.clientId = new mongoose.Types.ObjectId(clientId);
  if (status) match.status = status;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // 'i' = case-insensitive
    match.$or = [
      { invoiceNumber: re },
      { 'clientSnapshot.name': re },
      { 'clientSnapshot.billingName': re },     // firm name printed on the invoice
      { 'lines.lotNumberSnapshot': re },        // single-lot lines
      { 'lines.sources.lotNumberSnapshot': re } // merged/combined lines carry lot #s on sources
    ];
  }

  const pipeline = [
    { $match: match },
    { $addFields: { _day: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: LIST_TZ } } } },
    { $sort: buildInvoiceSort(sortBy, sortDir) },
    { $skip: page * limit },
    { $limit: limit },
    // Re-attach a lean clientId (name/clientCode) so the frontend's clientSnapshot fallback still works.
    { $lookup: {
        from: Client.collection.name, localField: 'clientId', foreignField: '_id',
        pipeline: [{ $project: { name: 1, clientCode: 1 } }], as: '_clientArr'
    } },
    { $addFields: { clientId: { $ifNull: [{ $arrayElemAt: ['$_clientArr', 0] }, '$clientId'] } } },
    { $project: { _clientArr: 0, _day: 0 } }
  ];

  const [rows, total] = await Promise.all([
    Invoice.aggregate(pipeline),
    Invoice.countDocuments(match)
  ]);
  res.json({ rows, total });
};

/**
 * GET /api/sales-invoices/:id
 */
const getInvoiceById = async (req, res) => {
  const inv = await Invoice.findById(req.params.id)
    .populate('clientId', 'name clientCode gstin pan')
    .populate('createdBy', 'username')
    .populate('updatedBy', 'username');
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
};

/**
 * GET /api/sales-invoices/:id/history
 */
const getInvoiceChangeHistory = async (req, res) => {
  const history = await getInvoiceHistory(req.params.id);
  res.json(history);
};

/**
 * GET /api/sales-invoices/cross-client?fromDate=&toDate=&producedForClientId=&billedToClientId=
 *
 * Every invoice line whose source lot was produced for one client but billed to another —
 * the reconciliation between the two attributions the system now keeps apart:
 *   "produced for" = Lot.clientId   → production dashboards, vendor cost, makings recon
 *   "billed to"    = Invoice.clientId → revenue, ClientBalance, receivables
 * Without this view those two totals diverge with no way to explain the gap.
 *
 * Reads the FROZEN lotClientIdSnapshot, not a live join on Lot — a lot's owner may have been
 * corrected since, and the invoice must report what was true when it was issued.
 * Merged lines are exploded to their per-lot sources so a part-cross-client merged line is
 * attributed correctly rather than counted whole against one side.
 */
const getCrossClientSales = async (req, res) => {
  const { fromDate, toDate, producedForClientId, billedToClientId } = req.query;

  const match = { status: { $ne: 'cancelled' } };
  if (fromDate || toDate) {
    match.date = {};
    if (fromDate) match.date.$gte = new Date(fromDate);
    if (toDate) match.date.$lte = new Date(toDate);
  }

  const pipeline = [
    { $match: match },
    { $unwind: '$lines' },
    // Normalise both line shapes to a `parts` array so one code path handles single-lot
    // and merged lines. A merged line's sources each carry their own owner snapshot.
    {
      $project: {
        invoiceNumber: 1,
        date: 1,
        clientId: 1,
        billedToName: '$clientSnapshot.name',
        rate: '$lines.rate',
        isDamaged: { $ifNull: ['$lines.isDamaged', false] },
        description: '$lines.description',
        internalNote: '$lines.internalNote',
        parts: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$lines.sources', []] } }, 0] },
            '$lines.sources',
            [{
              lotId: '$lines.lotId',
              lotNumberSnapshot: '$lines.lotNumberSnapshot',
              lotClientIdSnapshot: '$lines.lotClientIdSnapshot',
              pcs: '$lines.pcs'
            }]
          ]
        }
      }
    },
    { $unwind: '$parts' },
    // Sample and legacy lines have no lot and no owner — nothing to reconcile.
    { $match: { 'parts.lotClientIdSnapshot': { $ne: null } } },
    { $match: { $expr: { $ne: ['$parts.lotClientIdSnapshot', '$clientId'] } } }
  ];

  if (producedForClientId && mongoose.isValidObjectId(producedForClientId)) {
    pipeline.push({ $match: { 'parts.lotClientIdSnapshot': new mongoose.Types.ObjectId(producedForClientId) } });
  }
  if (billedToClientId && mongoose.isValidObjectId(billedToClientId)) {
    pipeline.push({ $match: { clientId: new mongoose.Types.ObjectId(billedToClientId) } });
  }

  pipeline.push(
    { $lookup: { from: 'clients', localField: 'parts.lotClientIdSnapshot', foreignField: '_id', as: 'owner' } },
    {
      $project: {
        _id: 0,
        invoiceId: '$_id',
        invoiceNumber: 1,
        date: 1,
        billedToClientId: '$clientId',
        billedToName: 1,
        producedForClientId: '$parts.lotClientIdSnapshot',
        producedForName: { $ifNull: [{ $arrayElemAt: ['$owner.name', 0] }, 'Unknown'] },
        producedForIsHouse: { $ifNull: [{ $arrayElemAt: ['$owner.isInternal', 0] }, false] },
        lotId: '$parts.lotId',
        lotNumber: '$parts.lotNumberSnapshot',
        pcs: '$parts.pcs',
        rate: 1,
        amount: { $multiply: ['$parts.pcs', { $ifNull: ['$rate', 0] }] },
        isDamaged: 1,
        description: 1,
        internalNote: 1
      }
    },
    { $sort: { date: -1, invoiceNumber: -1 } }
  );

  const rows = await Invoice.aggregate(pipeline);

  // House-label movement is expected traffic, not an exception, so it's totalled separately —
  // otherwise GREYSAGE's normal sales would swamp the genuine reassignments this report exists
  // to surface.
  const reassigned = rows.filter((r) => !r.producedForIsHouse);
  const summarise = (set) => ({
    lines: set.length,
    pcs: set.reduce((a, r) => a + (r.pcs || 0), 0),
    amount: set.reduce((a, r) => a + (r.amount || 0), 0)
  });

  res.json({
    rows,
    totals: {
      all: summarise(rows),
      reassigned: summarise(reassigned),                              // another client's lot
      houseLabel: summarise(rows.filter((r) => r.producedForIsHouse))  // in-house stock sold on
    }
  });
};

/**
 * GET /api/sales-invoices/counter?fyShort=2627
 * Returns the FY's counter state. `sequence` is the last issued number;
 * the next invoice generated for this FY will be `sequence + 1`.
 * If `fyShort` is omitted, derives it from today's date.
 */
const getInvoiceCounter = async (req, res) => {
  const { Counter } = require('../mongodb_schema');
  const { fyShortFor } = require('../services/invoiceService');
  const fy = req.query.fyShort || fyShortFor(new Date());
  const counter = await Counter.findById(`invoice-${fy}`);
  res.json({
    fyShort: fy,
    sequence: counter?.sequence || 0,
    nextInvoiceNumber: `INV${fy}/${(counter?.sequence || 0) + 1}`
  });
};

/**
 * PUT /api/sales-invoices/counter
 * Body: { fyShort: '2627', sequence: 28 } → next generated invoice will be INV2627/29.
 * Admin-only (enforced at the route layer).
 *
 * SAFETY: refuses to set the counter LOWER than the highest existing sequence number for
 * that FY in the Invoice collection — otherwise the next generated invoice number would
 * collide with an existing one and the unique-index save would fail.
 */
const setInvoiceCounter = async (req, res) => {
  const { Counter } = require('../mongodb_schema');
  const { fyShortFor } = require('../services/invoiceService');
  const { fyShort, sequence } = req.body;
  const fy = fyShort || fyShortFor(new Date());
  const newSeq = parseInt(sequence, 10);
  if (!Number.isInteger(newSeq) || newSeq < 0) {
    return res.status(400).json({ error: 'sequence must be a non-negative integer' });
  }

  // Find the highest /N for this FY among existing invoices to prevent collisions
  const re = new RegExp(`^INV${fy}/(\\d+)$`);
  const existing = await Invoice.find({ invoiceNumber: re }).select('invoiceNumber').lean();
  let highest = 0;
  for (const inv of existing) {
    const m = inv.invoiceNumber.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > highest) highest = n;
    }
  }
  if (newSeq < highest) {
    return res.status(400).json({
      error: `Cannot set counter to ${newSeq} — invoice INV${fy}/${highest} already exists. Minimum allowed is ${highest}.`
    });
  }

  const counter = await Counter.findByIdAndUpdate(
    { _id: `invoice-${fy}` },
    { sequence: newSeq },
    { new: true, upsert: true }
  );
  res.json({
    fyShort: fy,
    sequence: counter.sequence,
    nextInvoiceNumber: `INV${fy}/${counter.sequence + 1}`
  });
};


// ─── Manual dispatch (legacy lots) ───────────────────────────────────────────
// Lots physically dispatched before this system went live will never receive a sales
// Invoice, so invoicedPcs stays 0 and they sit on the Pending Dispatch board forever.
// These handlers record the dispatch by hand.
//
// PCS ONLY. No Invoice document is created, and clientBalanceService is deliberately
// never called — money for these lots was billed outside the system and is carried by
// ClientBalance.openingBalance. Adding a balance write here would double-count it.

const parsePcs = (value, field) => {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${field} must be a non-negative whole number`);
  return n;
};

/**
 * GET /api/sales-invoices/manual-dispatch/:lotId
 * Existing manual entries for a lot, plus how many pcs are still claimable — the modal
 * uses the capacity block to bound its inputs.
 */
const getManualDispatchForLot = async (req, res) => {
  const { lotId } = req.params;
  const lot = await Lot.findById(lotId).select('lotNumber').lean();
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const [entries, capacity] = await Promise.all([
    listManualDispatches(lotId),
    getManualDispatchCapacity(lotId)
  ]);

  res.json({
    lotId,
    lotNumber: lot.lotNumber,
    entries,
    capacity
  });
};

/**
 * POST /api/sales-invoices/manual-dispatch
 * Body: { lotId, goodPcs, damagedPcs, dispatchDate, reference, notes }
 */
const createManualDispatch = async (req, res) => {
  const { lotId, dispatchDate, reference, notes } = req.body;
  if (!lotId) return res.status(400).json({ error: 'lotId is required' });
  if (!dispatchDate) return res.status(400).json({ error: 'Dispatch date is required' });

  const lot = await Lot.findById(lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  let goodPcs, damagedPcs;
  try {
    goodPcs = parsePcs(req.body.goodPcs, 'Good pcs');
    damagedPcs = parsePcs(req.body.damagedPcs, 'Damaged pcs');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (goodPcs + damagedPcs <= 0) {
    return res.status(400).json({ error: 'Enter at least one piece to dispatch' });
  }

  const cap = await getManualDispatchCapacity(lotId);
  if (goodPcs > cap.goodAvailable) {
    return res.status(400).json({
      error: `Cannot dispatch ${goodPcs} good pcs — only ${cap.goodAvailable} available ` +
        `(total ${cap.goodTotal}, invoiced ${cap.invoicedPcs}, already marked ${cap.otherManualGood}).`
    });
  }
  if (damagedPcs > cap.damagedAvailable) {
    return res.status(400).json({
      error: `Cannot dispatch ${damagedPcs} damaged pcs — only ${cap.damagedAvailable} available ` +
        `(damaged pool ${cap.damagedPcs}, sold ${cap.damagedSoldPcs}, already marked ${cap.otherManualDamaged}).`
    });
  }

  const entry = await ManualDispatch.create({
    lotId, goodPcs, damagedPcs,
    dispatchDate: new Date(dispatchDate),
    reference: reference || '',
    notes: notes || '',
    createdBy: req.user.userId
  });

  await recalcLotManualDispatch(lotId);
  await recordManualDispatchHistory(entry._id, lotId, 'create', null, entry.toObject(), req.user.userId);
  await logAction(req.user.userId, 'create_manual_dispatch', 'ManualDispatch', entry._id,
    `Manually dispatched ${goodPcs} good + ${damagedPcs} damaged pcs for lot ${lot.lotNumber}`);
  await invalidateDashboard(); // manual dispatch changes Lot.manualDispatchedPcs -> Pending Dispatch

  const updated = await Lot.findById(lotId).lean();
  res.status(201).json({ entry, lot: { _id: updated._id, status: updated.status, manualDispatchedPcs: updated.manualDispatchedPcs, manualDamagedSoldPcs: updated.manualDamagedSoldPcs } });
};

/**
 * PUT /api/sales-invoices/manual-dispatch/:id
 */
const updateManualDispatch = async (req, res) => {
  const { id } = req.params;
  const entry = await ManualDispatch.findById(id);
  if (!entry) return res.status(404).json({ error: 'Manual dispatch entry not found' });

  const before = entry.toObject();
  let goodPcs = entry.goodPcs;
  let damagedPcs = entry.damagedPcs;
  try {
    if (req.body.goodPcs !== undefined) goodPcs = parsePcs(req.body.goodPcs, 'Good pcs');
    if (req.body.damagedPcs !== undefined) damagedPcs = parsePcs(req.body.damagedPcs, 'Damaged pcs');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (goodPcs + damagedPcs <= 0) {
    return res.status(400).json({ error: 'Enter at least one piece to dispatch' });
  }

  // Exclude this entry so its own current pcs don't count against it.
  const cap = await getManualDispatchCapacity(entry.lotId, entry._id);
  if (goodPcs > cap.goodAvailable) {
    return res.status(400).json({ error: `Cannot set ${goodPcs} good pcs — only ${cap.goodAvailable} available.` });
  }
  if (damagedPcs > cap.damagedAvailable) {
    return res.status(400).json({ error: `Cannot set ${damagedPcs} damaged pcs — only ${cap.damagedAvailable} available.` });
  }

  entry.goodPcs = goodPcs;
  entry.damagedPcs = damagedPcs;
  if (req.body.dispatchDate) entry.dispatchDate = new Date(req.body.dispatchDate);
  if (req.body.reference !== undefined) entry.reference = req.body.reference;
  if (req.body.notes !== undefined) entry.notes = req.body.notes;
  entry.updatedBy = req.user.userId;
  entry.updatedAt = new Date();
  await entry.save();

  await recalcLotManualDispatch(entry.lotId);
  await recordManualDispatchHistory(entry._id, entry.lotId, 'update', before, entry.toObject(), req.user.userId);
  await logAction(req.user.userId, 'update_manual_dispatch', 'ManualDispatch', entry._id,
    `Updated manual dispatch to ${goodPcs} good + ${damagedPcs} damaged pcs`);
  await invalidateDashboard(); // manual dispatch edit re-derives dispatch caches

  res.json(entry);
};

/**
 * DELETE /api/sales-invoices/manual-dispatch/:id
 * Reverses the entry — pcs return to the available pool and lot status re-derives,
 * dropping back to Finished/Ready if nothing else is dispatched.
 */
const deleteManualDispatch = async (req, res) => {
  const { id } = req.params;
  const entry = await ManualDispatch.findById(id);
  if (!entry) return res.status(404).json({ error: 'Manual dispatch entry not found' });

  const before = entry.toObject();
  const lotId = entry.lotId;
  await entry.deleteOne();

  await recalcLotManualDispatch(lotId);
  await recordManualDispatchHistory(id, lotId, 'delete', before, null, req.user.userId);
  await logAction(req.user.userId, 'delete_manual_dispatch', 'ManualDispatch', id,
    `Removed manual dispatch of ${before.goodPcs} good + ${before.damagedPcs} damaged pcs`);
  await invalidateDashboard(); // manual dispatch removal restores Pending Dispatch pcs

  res.json({ success: true });
};

module.exports = {
  getCrossClientSales,
  getLotsAvailable,
  getLotsDamagedAvailable,
  getPendingDispatchList,
  updateLotDamaged,
  getManualDispatchForLot,
  createManualDispatch,
  updateManualDispatch,
  deleteManualDispatch,
  createInvoice,
  updateInvoice,
  cancelInvoice,
  deleteInvoice,
  listInvoices,
  getInvoiceById,
  getInvoiceChangeHistory,
  getInvoiceCounter,
  setInvoiceCounter
};
