const mongoose = require('mongoose');
const {
  Invoice,
  Client,
  Lot,
  CompanySettings
} = require('../mongodb_schema');
const {
  getLotsAvailableForDispatch,
  getLotsWithDamagedAvailable,
  getPendingDispatch,
  getFinalPcsForLot,
  sumGoodInvoicedForLot,
  sumDamagedSoldForLot,
  recalcLotInvoiced,
  generateInvoiceNumber,
  generateInvoiceInternalId,
  recomputeInvoiceTotals,
  recordInvoiceHistory,
  getInvoiceHistory
} = require('../services/invoiceService');
const { updateClientBalance } = require('../services/clientBalanceService');
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
 * Validate the incoming line payload — return the line subdoc shape after enrichment.
 * Each line draws from either the lot's GOOD pool (finalPcs − damagedPcs) or, when
 * `isDamaged` is set, the DAMAGED pool (damagedPcs). Verifies pcs ≤ remaining for the
 * relevant pool (excluding the invoice we're editing).
 */
const buildAndValidateLines = async (rawLines, excludeInvoiceId = null) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error('Invoice must have at least one line item');
  }
  const lines = [];
  // Track per-lot pcs added in this single invoice, separately per pool (good vs damaged).
  const goodInThisInvoice = new Map();
  const damagedInThisInvoice = new Map();

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const pcs = parseInt(raw.pcs, 10);
    const rate = Number(raw.rate);
    if (!Number.isInteger(pcs) || pcs < 1) {
      throw new Error(`Line ${i + 1}: pcs must be a positive integer`);
    }
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error(`Line ${i + 1}: rate must be a non-negative number`);
    }
    if (!raw.description || !String(raw.description).trim()) {
      throw new Error(`Line ${i + 1}: description is required`);
    }

    const line = {
      lineNo: i + 1,
      description: String(raw.description).trim(),
      remark: raw.remark ? String(raw.remark).trim() : undefined,
      hsnSac: raw.hsnSac ? String(raw.hsnSac).trim() : undefined,
      pcs,
      unit: raw.unit ? String(raw.unit).trim() : '',
      rate,
      amount: pcs * rate
    };

    if (raw.lotId) {
      const lot = await Lot.findById(raw.lotId).lean();
      if (!lot) throw new Error(`Line ${i + 1}: lot not found`);
      line.lotId = lot._id;
      line.lotNumberSnapshot = lot.lotNumber;
      line.lotInvoiceNumberSnapshot = lot.invoiceNumber;
      line.isDamaged = !!raw.isDamaged;

      const damagedPcs = lot.damagedPcs || 0;

      if (line.isDamaged) {
        // Combined-damaged third-party sale — draws from the lot's damaged pool.
        const otherSold = await sumDamagedSoldForLot(lot._id, excludeInvoiceId);
        const alreadyInThisInvoice = damagedInThisInvoice.get(String(lot._id)) || 0;
        const remaining = damagedPcs - otherSold - alreadyInThisInvoice;
        if (pcs > remaining) {
          throw new Error(
            `Line ${i + 1}: lot ${lot.lotNumber} only has ${remaining} DAMAGED pcs available ` +
            `(damaged ${damagedPcs}, already sold elsewhere ${otherSold}` +
            (alreadyInThisInvoice > 0 ? `, in this invoice ${alreadyInThisInvoice}` : '') + ')'
          );
        }
        damagedInThisInvoice.set(String(lot._id), alreadyInThisInvoice + pcs);
      } else {
        // Good dispatch to the assigned client — draws from finalPcs − damagedPcs.
        const finalPcs = await getFinalPcsForLot(lot._id);
        const otherInvoicedPcs = await sumGoodInvoicedForLot(lot._id, excludeInvoiceId);
        const alreadyInThisInvoice = goodInThisInvoice.get(String(lot._id)) || 0;
        const remaining = finalPcs - damagedPcs - otherInvoicedPcs - alreadyInThisInvoice;
        if (pcs > remaining) {
          throw new Error(
            `Line ${i + 1}: lot ${lot.lotNumber} only has ${remaining} pcs remaining ` +
            `(final ${finalPcs}, damaged set-aside ${damagedPcs}, already invoiced elsewhere ${otherInvoicedPcs}` +
            (alreadyInThisInvoice > 0 ? `, in this invoice ${alreadyInThisInvoice}` : '') + ')'
          );
        }
        goodInThisInvoice.set(String(lot._id), alreadyInThisInvoice + pcs);
      }
    }

    lines.push(line);
  }
  return lines;
};

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /api/sales-invoices/lots-available?clientId=&search=
 */
const getLotsAvailable = async (req, res) => {
  const { clientId, search } = req.query;
  const lots = await getLotsAvailableForDispatch({ clientId, search });
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

  // Resolve the chosen billing firm (sub-biller). null = client default identity.
  const firm = billingFirmId ? client.billingFirms.id(billingFirmId) : null;
  if (billingFirmId && !firm) return res.status(400).json({ error: 'Billing firm not found on client' });

  const builtLines = await buildAndValidateLines(lines);

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
  const affectedLotIds = [...new Set(builtLines.map((l) => l.lotId).filter(Boolean).map(String))];
  await Promise.all(affectedLotIds.map((id) => recalcLotInvoiced(id)));
  await updateClientBalance(clientId);

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
  const prevLotIds = new Set(existing.lines.map((l) => l.lotId).filter(Boolean).map(String));

  const {
    date,
    placeOfSupply,
    lines,
    roundOff,
    documentType
  } = req.body;

  if (Array.isArray(lines)) {
    existing.lines = await buildAndValidateLines(lines, existing._id);
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
  const nextLotIds = new Set(existing.lines.map((l) => l.lotId).filter(Boolean).map(String));
  const allAffected = new Set([...prevLotIds, ...nextLotIds]);
  await Promise.all([...allAffected].map((lid) => recalcLotInvoiced(lid)));
  await updateClientBalance(existing.clientId);

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

  const affectedLotIds = [...new Set(invoice.lines.map((l) => l.lotId).filter(Boolean).map(String))];
  await Promise.all(affectedLotIds.map((lid) => recalcLotInvoiced(lid)));
  await updateClientBalance(invoice.clientId);

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
  const affectedLotIds = [...new Set(invoice.lines.map((l) => l.lotId).filter(Boolean).map(String))];

  await Invoice.findByIdAndDelete(id);
  await Promise.all(affectedLotIds.map((lid) => recalcLotInvoiced(lid)));
  await updateClientBalance(clientId);

  await recordInvoiceHistory(id, 'delete', before, null, req.user.userId);
  await logAction(req.user.userId, 'delete_invoice', 'Invoice', id, `Deleted invoice ${invoice.invoiceNumber}`);

  res.json({ message: 'Invoice deleted' });
};

/**
 * GET /api/sales-invoices?clientId=&from=&to=&status=&search=
 */
const listInvoices = async (req, res) => {
  const { clientId, from, to, status, search } = req.query;
  const query = {};
  if (clientId) query.clientId = clientId;
  if (status) query.status = status;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = new Date(from);
    if (to) query.date.$lte = new Date(to);
  }
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { invoiceNumber: re },
      { 'clientSnapshot.name': re },
      { 'lines.lotNumberSnapshot': re }
    ];
  }
  const invoices = await Invoice.find(query)
    .populate('clientId', 'name clientCode')
    .sort({ date: -1, createdAt: -1 })
    .limit(500);
  res.json(invoices);
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

module.exports = {
  getLotsAvailable,
  getLotsDamagedAvailable,
  getPendingDispatchList,
  updateLotDamaged,
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
