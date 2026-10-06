const mongoose = require('mongoose');
const {
  Invoice,
  Client,
  Lot,
  CompanySettings,
  ManualDispatch,
  ClientPaymentEntry,
  Counter
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
  getInvoiceHistory,
  fyShortFor,
  isValidFyShort,
  parseInvoiceNumber,
  getInvoicePrefix,
  lockLotsForDispatch,
  DEFAULT_INVOICE_PREFIX
} = require('../services/invoiceService');
const { updateClientBalance } = require('../services/clientBalanceService');
const { bumpVersion } = require('../services/cache');
const { invalidateDashboard } = require('../services/dashboardCache');
const CLEDGER = 'cledger'; // must match clientBalanceController's client-ledger cache namespace
const { logAction } = require('../utils/logger');
const { HttpError } = require('../utils/httpError');
const { runInTransaction, withSession, sessionOpts } = require('../utils/transaction');

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

// ─── Request parsing helpers ─────────────────────────────────────────────────
// All throw HttpError(400) so middleware/error.js returns the message to the user.

const DOCUMENT_TYPES = ['BILL_OF_SUPPLY', 'TAX_INVOICE'];
// Round-off only nudges the total to a whole rupee, so it must stay strictly inside ±1.
const MAX_ABS_ROUND_OFF = 1;
const MIN_CANCEL_REASON_LENGTH = 3;

const hasAtMost2Decimals = (n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

const parseInvoiceDate = (value) => {
  const d = new Date(value);
  if (value === undefined || value === null || value === '' || Number.isNaN(d.getTime())) {
    throw new HttpError(400, 'Date is invalid');
  }
  return d;
};

const parseRoundOff = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Round off must be a number');
  if (Math.abs(n) >= MAX_ABS_ROUND_OFF) {
    throw new HttpError(400, `Round off must be between -0.99 and 0.99 (got ${n})`);
  }
  if (!hasAtMost2Decimals(n)) throw new HttpError(400, 'Round off can have at most 2 decimal places');
  return n;
};

const parseDocumentType = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (!DOCUMENT_TYPES.includes(value)) throw new HttpError(400, `Unknown document type: ${value}`);
  return value;
};

// Only the two fields the schema stores; anything else in the request is ignored.
const parsePlaceOfSupply = (value) => {
  if (!value || typeof value !== 'object') return null;
  return {
    stateCode: value.stateCode ? String(value.stateCode).trim() : '',
    stateName: value.stateName ? String(value.stateName).trim() : ''
  };
};

/**
 * Lot ids referenced by a RAW request payload, before validation — used to lock lots before
 * any availability is read. Mirrors the fields buildAndValidateLines consumes; malformed
 * entries are skipped here and rejected by the validator itself.
 */
const rawLotIds = (lines) => {
  if (!Array.isArray(lines)) return [];
  const ids = new Set();
  for (const l of lines) {
    if (!l || typeof l !== 'object' || l.isSample) continue;
    if (l.lotId) ids.add(String(l.lotId));
    if (Array.isArray(l.sources)) {
      for (const s of l.sources) if (s && s.lotId) ids.add(String(s.lotId));
    }
  }
  return [...ids];
};

/**
 * Validate the incoming line payload — return the line subdoc shape after enrichment.
 * Each line draws from either the lot's GOOD pool (finalPcs − damagedPcs) or, when
 * `isDamaged` is set, the DAMAGED pool (damagedPcs). Verifies pcs ≤ remaining for the
 * relevant pool, net of other invoices (excluding the one being edited) AND of pcs recorded
 * as manually dispatched — the lot picker already hides those, but the picker is only a UI
 * filter; this is the authoritative check.
 *
 * Call inside runInTransaction AFTER lockLotsForDispatch(), passing the session, so the
 * figures read here can't change before the invoice is saved.
 *
 * `invoiceClientId` is the party being BILLED. It is deliberately NOT required to match
 * the lot's owner — full or partial qty of a lot produced for one client is routinely
 * sold to another. What the mismatch does trigger is:
 *   • lotClientIdSnapshot frozen onto the line/source, so the sale stays reconcilable
 *     against production attribution forever, and
 *   • a mandatory internal note on GOOD cross-client lines, so a mis-picked lot can't be
 *     billed to the wrong client silently. Damaged and house-label lines are exempt: both
 *     are cross-client by design, not by exception.
 */
const buildAndValidateLines = async (rawLines, excludeInvoiceId = null, invoiceClientId = null, session = null) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new HttpError(400, 'Invoice must have at least one line item');
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
      const c = await withSession(Client.findById(cid).select('isInternal'), session).lean();
      internalByClient.set(key, !!c?.isInternal);
    }
    return internalByClient.get(key);
  };

  // Reserve `pcs` from one lot's good/damaged pool, validating against what remains plus
  // what earlier lines/sources in THIS invoice already consumed. Returns the lot's frozen
  // snapshot fields. Shared by single-lot lines AND each source of a merged line, so a lot
  // referenced from several lines/sources is still validated against one shared pool.
  const consumeFromLot = async (lotId, pcs, isDamaged, label) => {
    const lot = await withSession(Lot.findById(lotId), session).lean();
    if (!lot) throw new HttpError(400, `${label}: lot not found`);
    const damagedPcs = lot.damagedPcs || 0;

    if (isDamaged) {
      // Combined-damaged third-party sale — draws from the lot's damaged pool.
      const otherSold = await sumDamagedSoldForLot(lot._id, excludeInvoiceId, session);
      const manualSold = lot.manualDamagedSoldPcs || 0; // disposed of outside invoicing
      const already = damagedInThisInvoice.get(String(lot._id)) || 0;
      const remaining = damagedPcs - otherSold - manualSold - already;
      if (pcs > remaining) {
        throw new HttpError(400,
          `${label}: lot ${lot.lotNumber} only has ${Math.max(0, remaining)} DAMAGED pcs available ` +
          `(damaged ${damagedPcs}, already sold elsewhere ${otherSold}` +
          (manualSold > 0 ? `, recorded sold manually ${manualSold}` : '') +
          (already > 0 ? `, in this invoice ${already}` : '') + ')'
        );
      }
      damagedInThisInvoice.set(String(lot._id), already + pcs);
    } else {
      // Good dispatch — draws from finalPcs − damagedPcs.
      const finalPcs = await getFinalPcsForLot(lot._id, session);
      const otherInvoicedPcs = await sumGoodInvoicedForLot(lot._id, excludeInvoiceId, session);
      const manualDispatched = lot.manualDispatchedPcs || 0; // left the building without an invoice
      const already = goodInThisInvoice.get(String(lot._id)) || 0;
      const remaining = finalPcs - damagedPcs - otherInvoicedPcs - manualDispatched - already;
      if (pcs > remaining) {
        throw new HttpError(400,
          `${label}: lot ${lot.lotNumber} only has ${Math.max(0, remaining)} pcs remaining ` +
          `(final ${finalPcs}, damaged set-aside ${damagedPcs}, already invoiced elsewhere ${otherInvoicedPcs}` +
          (manualDispatched > 0 ? `, marked dispatched manually ${manualDispatched}` : '') +
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
    if (!raw || typeof raw !== 'object') throw new HttpError(400, `${label}: invalid line`);
    const isSample = !!raw.isSample;
    // Sample lines are non-chargeable regardless of any rate the client sends.
    const rate = isSample ? 0 : Number(raw.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new HttpError(400, `${label}: rate must be a non-negative number`);
    }
    if (!hasAtMost2Decimals(rate)) {
      throw new HttpError(400, `${label}: rate can have at most 2 decimal places (got ${raw.rate})`);
    }
    if (!raw.description || !String(raw.description).trim()) {
      throw new HttpError(400, `${label}: description is required`);
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
        throw new HttpError(400, `${label}: sample pcs must be a positive integer`);
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
        if (!s || typeof s !== 'object') throw new HttpError(400, `${sLabel}: invalid source`);
        const sPcs = parseInt(s.pcs, 10);
        if (!Number.isInteger(sPcs) || sPcs < 1) {
          throw new HttpError(400, `${sLabel}: pcs must be a positive integer`);
        }
        if (!s.lotId) throw new HttpError(400, `${sLabel}: lotId is required`);
        const { needsJustification, ...snap } = await consumeFromLot(s.lotId, sPcs, isDamaged, sLabel);
        if (needsJustification) crossClientLine = true;
        builtSources.push({ ...snap, pcs: sPcs });
        total += sPcs;
      }
      // A merged line needs at least two sources to be meaningful, but one is allowed.
      // If the client also sent an explicit pcs, it must agree with the sources.
      const rawPcs = raw.pcs;
      if (rawPcs !== undefined && rawPcs !== null && rawPcs !== '' && parseInt(rawPcs, 10) !== total) {
        throw new HttpError(400, `${label}: pcs (${parseInt(rawPcs, 10)}) must equal the sum of its source pcs (${total})`);
      }
      line.pcs = total;
      line.sources = builtSources;
      line.isDamaged = isDamaged;
    } else {
      const pcs = parseInt(raw.pcs, 10);
      if (!Number.isInteger(pcs) || pcs < 1) {
        throw new HttpError(400, `${label}: pcs must be a positive integer`);
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
      throw new HttpError(400,
        `${label}: this lot was produced for another client. Add an internal note explaining ` +
        `the reassignment (not printed on the invoice).`
      );
    }

    line.amount = (line.pcs * Math.round(rate * 100)) / 100; // recomputeInvoiceTotals re-derives it
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
 * Guards against stranding already-dispatched good pcs (invoiced OR marked manually) or
 * unsetting already-sold damaged pcs (invoiced OR recorded manually).
 */
const updateLotDamaged = async (req, res) => {
  const { lotId } = req.params;
  const damagedPcs = parseInt(req.body.damagedPcs, 10);
  if (!Number.isInteger(damagedPcs) || damagedPcs < 0) {
    return res.status(400).json({ error: 'damagedPcs must be a non-negative integer' });
  }

  const r = await runInTransaction(async (session) => {
    await lockLotsForDispatch([lotId], session);
    const lot = await withSession(Lot.findById(lotId), session);
    if (!lot) throw new HttpError(404, 'Lot not found');

    const finalPcs = await getFinalPcsForLot(lot._id, session);
    const invoicedPcs = lot.invoicedPcs || 0;
    const manualDispatchedPcs = lot.manualDispatchedPcs || 0;
    const goodDispatched = invoicedPcs + manualDispatchedPcs;
    const damagedSoldPcs = lot.damagedSoldPcs || 0;
    const manualDamagedSoldPcs = lot.manualDamagedSoldPcs || 0;
    const damagedGone = damagedSoldPcs + manualDamagedSoldPcs;

    // Can't set aside more than what's left after good dispatch.
    if (damagedPcs > finalPcs - goodDispatched) {
      throw new HttpError(400,
        `Cannot set ${damagedPcs} damaged — only ${Math.max(0, finalPcs - goodDispatched)} pcs remain undispatched ` +
        `(final ${finalPcs}, good invoiced ${invoicedPcs}` +
        (manualDispatchedPcs > 0 ? `, marked dispatched manually ${manualDispatchedPcs}` : '') + ').'
      );
    }
    // Can't drop the pool below what's already been sold to third parties.
    if (damagedPcs < damagedGone) {
      throw new HttpError(400,
        `Cannot set ${damagedPcs} damaged — ${damagedGone} damaged pcs have already been sold` +
        (manualDamagedSoldPcs > 0 ? ` (${manualDamagedSoldPcs} of them recorded manually)` : '') + '.'
      );
    }

    lot.damagedPcs = damagedPcs;
    await lot.save(sessionOpts(session));
    await recalcLotInvoiced(lot._id, session); // keep caches consistent

    return {
      _id: lot._id,
      lotNumber: lot.lotNumber,
      finalPcs,
      damagedPcs,
      damagedSoldPcs,
      manualDamagedSoldPcs,
      invoicedPcs,
      manualDispatchedPcs,
      goodRemaining: Math.max(0, finalPcs - damagedPcs - goodDispatched),
      damagedRemaining: Math.max(0, damagedPcs - damagedGone)
    };
  });

  await logAction(req.user.userId, 'update_lot_damaged', 'Lot', r._id,
    `Set damaged pcs to ${damagedPcs} for lot ${r.lotNumber}`);
  await invalidateDashboard(); // damagedPcs feeds the awaiting-dispatch subtraction

  res.json(r);
};

/**
 * POST /api/sales-invoices
 *
 * Everything that reads availability or writes money/pcs happens in ONE transaction:
 *   lock lots → validate lines → allocate number → save → recalc lots → client balance → history.
 * If any step fails the counter increment rolls back too, so a failed save no longer burns
 * an invoice number. Cache bumps and the audit log run after commit (both fail-open).
 */
const createInvoice = async (req, res) => {
  const { date, clientId, billingFirmId, placeOfSupply, lines, roundOff, documentType } = req.body;

  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  const invoiceDate = parseInvoiceDate(date);
  const roundOffValue = parseRoundOff(roundOff);
  const requestedDocType = parseDocumentType(documentType);
  const requestedPos = parsePlaceOfSupply(placeOfSupply);

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

  // Derive Place of Supply from the chosen firm's shipping address (fall back to billing),
  // then to the client's. An explicit placeOfSupply in the request still overrides it.
  const ship = (firm ? firm.shippingAddress : client.shippingAddress);
  const bill = (firm ? firm.billingAddress : client.billingAddress);
  const posSrc = (ship?.state || ship?.stateCode) ? ship : bill;
  const derivedPos = {
    stateName: posSrc?.state || '',
    stateCode: posSrc?.stateCode || ''
  };

  const invoice = await runInTransaction(async (session) => {
    // 1. Lock every referenced lot BEFORE reading availability (see lockLotsForDispatch).
    await lockLotsForDispatch(rawLotIds(lines), session);

    // 2. Validate against the locked pools.
    const builtLines = await buildAndValidateLines(lines, null, clientId, session);

    const settings = await withSession(CompanySettings.findOne(), session);
    const prefix = settings?.defaultInvoicePrefix || DEFAULT_INVOICE_PREFIX;
    const docType = requestedDocType || settings?.defaultDocumentType || 'BILL_OF_SUPPLY';

    const doc = new Invoice({
      documentType: docType,
      date: invoiceDate,
      clientId,
      billingFirmId: firm?._id || null,
      ...snapshotClient(client, firm),
      placeOfSupply: requestedPos || derivedPos,
      lines: builtLines,
      roundOff: roundOffValue,
      status: 'issued',
      createdBy: req.user.userId
    });
    recomputeInvoiceTotals(doc);
    if (doc.total < 0) throw new HttpError(400, 'Invoice total cannot be negative — check the round off');

    // 3. Number allocated last, inside the transaction — rolls back with any failure.
    doc.invoiceNumber = await generateInvoiceNumber(invoiceDate, prefix, session);
    doc.invoiceId = await generateInvoiceInternalId(session);
    await doc.save(sessionOpts(session));

    // 4. Derived caches + history, same transaction.
    for (const lotId of collectLotIds(builtLines)) {
      await recalcLotInvoiced(lotId, session);
    }
    await updateClientBalance(clientId, session);
    await recordInvoiceHistory(doc._id, 'create', null, doc.toObject(), req.user.userId, session);
    return doc;
  });

  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs
  await logAction(req.user.userId, 'create_invoice', 'Invoice', invoice._id,
    `Created invoice ${invoice.invoiceNumber} for ${client.name}`);

  res.status(201).json(invoice);
};

/**
 * PATCH /api/sales-invoices/:id — update an issued invoice. ADMIN ONLY (route layer).
 * The date may change only within the invoice number's financial year.
 */
const updateInvoice = async (req, res) => {
  const { id } = req.params;
  const { date, placeOfSupply, lines, roundOff, documentType } = req.body;

  // Parse up front so a malformed field fails before any transaction work.
  const newDate = (date !== undefined && date !== null && date !== '') ? parseInvoiceDate(date) : null;
  const newRoundOff = roundOff !== undefined ? parseRoundOff(roundOff) : undefined;
  const newDocType = parseDocumentType(documentType);
  const newPos = parsePlaceOfSupply(placeOfSupply);

  const invoice = await runInTransaction(async (session) => {
    const existing = await withSession(Invoice.findById(id), session);
    if (!existing) throw new HttpError(404, 'Invoice not found');
    if (existing.status === 'cancelled') throw new HttpError(400, 'Cancelled invoices cannot be edited');

    const before = existing.toObject();
    const prevLotIds = collectLotIds(existing.lines);
    // Lock lots on the invoice now AND lots the edit adds.
    await lockLotsForDispatch([...prevLotIds, ...rawLotIds(lines)], session);

    if (Array.isArray(lines)) {
      // existing.clientId, not the request — the bill-to party is frozen at issue and an edit
      // must be judged cross-client against the same client the invoice was raised for.
      existing.lines = await buildAndValidateLines(lines, existing._id, existing.clientId, session);
    }

    if (newDate && newDate.getTime() !== new Date(existing.date).getTime()) {
      // The number encodes the FY. Re-dating across FYs would leave e.g. INV2627/12 dated in
      // FY 2025-26 — refuse; the fix is cancel + re-issue in the right year.
      const numbered = parseInvoiceNumber(existing.invoiceNumber);
      const invoiceFy = numbered ? numbered.fy : fyShortFor(existing.date);
      const newFy = fyShortFor(newDate);
      if (newFy !== invoiceFy) {
        throw new HttpError(400,
          `${existing.invoiceNumber} belongs to FY ${invoiceFy}; the new date falls in FY ${newFy}. ` +
          `Cancel this invoice and raise a new one in the correct year instead.`
        );
      }
      existing.date = newDate;
    }
    if (newPos) existing.placeOfSupply = newPos;
    if (newRoundOff !== undefined) existing.roundOff = newRoundOff;
    if (newDocType) existing.documentType = newDocType;

    // Client snapshot is FROZEN at issue — never refreshed on edit.

    existing.updatedBy = req.user.userId;
    existing.updatedAt = new Date();
    recomputeInvoiceTotals(existing);
    if (existing.total < 0) throw new HttpError(400, 'Invoice total cannot be negative — check the round off');
    await existing.save(sessionOpts(session));

    // Recalc every lot that was ever on this invoice (added, removed, or kept).
    const allAffected = new Set([...prevLotIds, ...collectLotIds(existing.lines)]);
    for (const lotId of allAffected) {
      await recalcLotInvoiced(lotId, session);
    }
    await updateClientBalance(existing.clientId, session);
    await recordInvoiceHistory(existing._id, 'update', before, existing.toObject(), req.user.userId, session);
    return existing;
  });

  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs
  await logAction(req.user.userId, 'update_invoice', 'Invoice', invoice._id,
    `Updated invoice ${invoice.invoiceNumber}`);

  res.json(invoice);
};

/**
 * POST /api/sales-invoices/:id/cancel — body { reason }. ADMIN ONLY (route layer).
 * Soft-cancel: lots return to the remaining pool; the invoice keeps its number so the
 * series has no gap.
 */
const cancelInvoice = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < MIN_CANCEL_REASON_LENGTH) {
    return res.status(400).json({ error: 'A cancellation reason is required' });
  }

  const invoice = await runInTransaction(async (session) => {
    const doc = await withSession(Invoice.findById(id), session);
    if (!doc) throw new HttpError(404, 'Invoice not found');
    if (doc.status === 'cancelled') throw new HttpError(400, 'Already cancelled');

    const before = doc.toObject();
    const lotIds = collectLotIds(doc.lines);
    await lockLotsForDispatch(lotIds, session);

    doc.status = 'cancelled';
    doc.cancelReason = reason;
    doc.cancelledAt = new Date();
    doc.cancelledBy = req.user.userId;
    doc.updatedBy = req.user.userId;
    doc.updatedAt = new Date();
    await doc.save(sessionOpts(session));

    for (const lotId of lotIds) {
      await recalcLotInvoiced(lotId, session);
    }
    await updateClientBalance(doc.clientId, session);
    await recordInvoiceHistory(doc._id, 'cancel', before, doc.toObject(), req.user.userId, session);
    return doc;
  });

  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs
  await logAction(req.user.userId, 'cancel_invoice', 'Invoice', invoice._id,
    `Cancelled invoice ${invoice.invoiceNumber}: ${reason}`);

  res.json(invoice);
};

/**
 * DELETE /api/sales-invoices/:id — hard delete. ADMIN ONLY (route layer).
 *
 * Allowed ONLY for the most recently allocated number of its FY (counter.sequence equals the
 * invoice's sequence); the counter is rolled back in the same transaction so that number is
 * reissued — the series never gets a gap. Any other invoice must be cancelled instead.
 * Same rule scripts/rollbackInvoices.js applies by hand.
 */
const deleteInvoice = async (req, res) => {
  const { id } = req.params;

  const deleted = await runInTransaction(async (session) => {
    const doc = await withSession(Invoice.findById(id), session);
    if (!doc) throw new HttpError(404, 'Invoice not found');

    const numbered = parseInvoiceNumber(doc.invoiceNumber);
    if (!numbered) {
      throw new HttpError(409,
        `${doc.invoiceNumber} doesn't follow the {prefix}{FY}/{n} format, so its place in the ` +
        `series can't be verified. Cancel it instead.`);
    }
    const counterId = `invoice-${numbered.fy}`;
    const counter = await withSession(Counter.findById(counterId), session).lean();
    if (!counter || counter.sequence !== numbered.seq) {
      throw new HttpError(409,
        `Only the most recently issued number can be deleted — FY ${numbered.fy} is at ` +
        `/${counter?.sequence ?? 0}, so deleting ${doc.invoiceNumber} would leave a gap. ` +
        `Cancel it instead; a cancelled invoice keeps its number.`);
    }

    const paymentCount = await withSession(ClientPaymentEntry.countDocuments({ invoiceId: doc._id }), session);
    if (paymentCount > 0) {
      throw new HttpError(409,
        `${doc.invoiceNumber} has ${paymentCount} payment/adjustment ` +
        `entr${paymentCount === 1 ? 'y' : 'ies'} recorded against it. Remove those first, or cancel the invoice instead.`);
    }

    const before = doc.toObject();
    const lotIds = collectLotIds(doc.lines);
    await lockLotsForDispatch(lotIds, session);

    await Invoice.deleteOne({ _id: doc._id }, sessionOpts(session));
    // Roll the series back so the freed number is reissued. Conditional on the value just
    // checked; a concurrent allocation would conflict on this doc and be retried anyway.
    await Counter.updateOne(
      { _id: counterId, sequence: numbered.seq },
      { $set: { sequence: numbered.seq - 1 } },
      sessionOpts(session)
    );

    for (const lotId of lotIds) {
      await recalcLotInvoiced(lotId, session);
    }
    await updateClientBalance(doc.clientId, session);
    await recordInvoiceHistory(doc._id, 'delete', before, null, req.user.userId, session);
    return { id: doc._id, invoiceNumber: doc.invoiceNumber };
  });

  await bumpVersion(CLEDGER); // invalidate cached client ledgers (invoice changes totalInvoiced)
  await invalidateDashboard(); // invoicedPcs recalc moves Dispatched / Pending Dispatch KPIs
  await logAction(req.user.userId, 'delete_invoice', 'Invoice', deleted.id,
    `Deleted invoice ${deleted.invoiceNumber} (counter rolled back)`);

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
 * `sequence` is the last issued number; the next invoice for this FY will be sequence + 1.
 * If `fyShort` is omitted, derives it from today's date (IST).
 */
const getInvoiceCounter = async (req, res) => {
  const fy = req.query.fyShort ? String(req.query.fyShort).trim() : fyShortFor(new Date());
  if (!isValidFyShort(fy)) {
    return res.status(400).json({ error: 'fyShort must look like 2627 (FY 2026-27)' });
  }
  const counter = await Counter.findById(`invoice-${fy}`).lean();
  const prefix = await getInvoicePrefix();
  const sequence = counter?.sequence || 0;
  res.json({
    fyShort: fy,
    prefix,
    sequence,
    nextInvoiceNumber: `${prefix}${fy}/${sequence + 1}`
  });
};

/**
 * PUT /api/sales-invoices/counter — body { fyShort: '2627', sequence: 28 } → next is /29.
 * Admin-only (route layer).
 *
 * SAFETY: refuses to go LOWER than the highest sequence already used in that FY, under any
 * prefix (the counter is per FY, not per prefix). Runs in a transaction so it serialises
 * against invoice creation, which writes the same counter document.
 */
const setInvoiceCounter = async (req, res) => {
  const { fyShort, sequence } = req.body;
  const fy = fyShort ? String(fyShort).trim() : fyShortFor(new Date());
  if (!isValidFyShort(fy)) {
    return res.status(400).json({ error: 'fyShort must look like 2627 (FY 2026-27)' });
  }
  const newSeq = parseInt(sequence, 10);
  if (!Number.isInteger(newSeq) || newSeq < 0) {
    return res.status(400).json({ error: 'sequence must be a non-negative integer' });
  }

  const counter = await runInTransaction(async (session) => {
    // fy is validated as 4 digits, so it is safe to embed in the pattern.
    const existing = await withSession(
      Invoice.find({ invoiceNumber: new RegExp(`${fy}/\\d+\\s*$`) }).select('invoiceNumber'),
      session
    ).lean();
    let highest = 0;
    for (const inv of existing) {
      const p = parseInvoiceNumber(inv.invoiceNumber);
      if (p && p.fy === fy && p.seq > highest) highest = p.seq;
    }
    if (newSeq < highest) {
      throw new HttpError(400,
        `Cannot set counter to ${newSeq} — /${highest} already exists in FY ${fy}. Minimum allowed is ${highest}.`);
    }
    return Counter.findByIdAndUpdate(
      { _id: `invoice-${fy}` },
      { sequence: newSeq },
      { new: true, upsert: true, ...sessionOpts(session) }
    );
  });

  const prefix = await getInvoicePrefix();
  res.json({
    fyShort: fy,
    prefix,
    sequence: counter.sequence,
    nextInvoiceNumber: `${prefix}${fy}/${counter.sequence + 1}`
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

  const { entry, lotNumber } = await runInTransaction(async (session) => {
    await lockLotsForDispatch([lotId], session);
    const lot = await withSession(Lot.findById(lotId).select('lotNumber'), session).lean();
    if (!lot) throw new HttpError(404, 'Lot not found');

    const cap = await getManualDispatchCapacity(lotId, null, session);
    if (goodPcs > cap.goodAvailable) {
      throw new HttpError(400,
        `Cannot dispatch ${goodPcs} good pcs — only ${cap.goodAvailable} available ` +
        `(total ${cap.goodTotal}, invoiced ${cap.invoicedPcs}, already marked ${cap.otherManualGood}).`);
    }
    if (damagedPcs > cap.damagedAvailable) {
      throw new HttpError(400,
        `Cannot dispatch ${damagedPcs} damaged pcs — only ${cap.damagedAvailable} available ` +
        `(damaged pool ${cap.damagedPcs}, sold ${cap.damagedSoldPcs}, already marked ${cap.otherManualDamaged}).`);
    }

    const [created] = await ManualDispatch.create([{
      lotId, goodPcs, damagedPcs,
      dispatchDate: new Date(dispatchDate),
      reference: reference || '',
      notes: notes || '',
      createdBy: req.user.userId
    }], sessionOpts(session));

    await recalcLotManualDispatch(lotId, session);
    await recordManualDispatchHistory(created._id, lotId, 'create', null, created.toObject(), req.user.userId, session);
    return { entry: created, lotNumber: lot.lotNumber };
  });

  await logAction(req.user.userId, 'create_manual_dispatch', 'ManualDispatch', entry._id,
    `Manually dispatched ${goodPcs} good + ${damagedPcs} damaged pcs for lot ${lotNumber}`);
  await invalidateDashboard(); // manual dispatch changes Lot.manualDispatchedPcs -> Pending Dispatch

  const updated = await Lot.findById(lotId).lean();
  res.status(201).json({ entry, lot: { _id: updated._id, status: updated.status, manualDispatchedPcs: updated.manualDispatchedPcs, manualDamagedSoldPcs: updated.manualDamagedSoldPcs } });
};

/**
 * PUT /api/sales-invoices/manual-dispatch/:id
 */
const updateManualDispatch = async (req, res) => {
  const { id } = req.params;
  // The lot must be known to lock it before reading capacity. An entry's lotId never changes.
  const probe = await ManualDispatch.findById(id).select('lotId').lean();
  if (!probe) return res.status(404).json({ error: 'Manual dispatch entry not found' });

  const { entry, goodPcs, damagedPcs } = await runInTransaction(async (session) => {
    await lockLotsForDispatch([probe.lotId], session);
    const doc = await withSession(ManualDispatch.findById(id), session);
    if (!doc) throw new HttpError(404, 'Manual dispatch entry not found');

    const before = doc.toObject();
    let good = doc.goodPcs;
    let damaged = doc.damagedPcs;
    try {
      if (req.body.goodPcs !== undefined) good = parsePcs(req.body.goodPcs, 'Good pcs');
      if (req.body.damagedPcs !== undefined) damaged = parsePcs(req.body.damagedPcs, 'Damaged pcs');
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    if (good + damaged <= 0) throw new HttpError(400, 'Enter at least one piece to dispatch');

    // Exclude this entry so its own current pcs don't count against it.
    const cap = await getManualDispatchCapacity(doc.lotId, doc._id, session);
    if (good > cap.goodAvailable) {
      throw new HttpError(400, `Cannot set ${good} good pcs — only ${cap.goodAvailable} available.`);
    }
    if (damaged > cap.damagedAvailable) {
      throw new HttpError(400, `Cannot set ${damaged} damaged pcs — only ${cap.damagedAvailable} available.`);
    }

    doc.goodPcs = good;
    doc.damagedPcs = damaged;
    if (req.body.dispatchDate) doc.dispatchDate = new Date(req.body.dispatchDate);
    if (req.body.reference !== undefined) doc.reference = req.body.reference;
    if (req.body.notes !== undefined) doc.notes = req.body.notes;
    doc.updatedBy = req.user.userId;
    doc.updatedAt = new Date();
    await doc.save(sessionOpts(session));

    await recalcLotManualDispatch(doc.lotId, session);
    await recordManualDispatchHistory(doc._id, doc.lotId, 'update', before, doc.toObject(), req.user.userId, session);
    return { entry: doc, goodPcs: good, damagedPcs: damaged };
  });

  await logAction(req.user.userId, 'update_manual_dispatch', 'ManualDispatch', entry._id,
    `Updated manual dispatch to ${goodPcs} good + ${damagedPcs} damaged pcs`);
  await invalidateDashboard(); // manual dispatch edit re-derives dispatch caches

  res.json(entry);
};

/**
 * DELETE /api/sales-invoices/manual-dispatch/:id
 * Reverses the entry — pcs return to the available pool and lot status re-derives,
 * dropping back to its production stage if nothing else is dispatched.
 */
const deleteManualDispatch = async (req, res) => {
  const { id } = req.params;
  const probe = await ManualDispatch.findById(id).select('lotId').lean();
  if (!probe) return res.status(404).json({ error: 'Manual dispatch entry not found' });

  const before = await runInTransaction(async (session) => {
    await lockLotsForDispatch([probe.lotId], session);
    const doc = await withSession(ManualDispatch.findById(id), session);
    if (!doc) throw new HttpError(404, 'Manual dispatch entry not found');

    const snapshot = doc.toObject();
    await ManualDispatch.deleteOne({ _id: doc._id }, sessionOpts(session));
    await recalcLotManualDispatch(snapshot.lotId, session);
    await recordManualDispatchHistory(id, snapshot.lotId, 'delete', snapshot, null, req.user.userId, session);
    return snapshot;
  });

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
