// ─── Tax Invoices (GST) ──────────────────────────────────────────────────────
// A Tax Invoice is generated FROM a Bill of Supply and printed for GST. It has its own
// collection and its own number series per FY, and NO business effect: lot pcs, lot status,
// client balance, payments and dashboards are driven by the Bill of Supply only. Hence no
// stock checks here — lines are validated for shape, HSN and lot existence only.
const { Invoice, TaxInvoice, Lot, CompanySettings, Counter } = require('../mongodb_schema');
const {
  fyShortFor,
  parseInvoiceNumber,
  getTaxInvoicePrefix,
  seriesCounterId,
  generateTaxInvoiceNumber,
  generateTaxInvoiceInternalId,
  recordInvoiceHistory,
  getInvoiceHistory
} = require('../services/invoiceService');
const {
  HSN_RE,
  ensureSeedRules,
  loadActiveRules,
  applyTaxRates,
  computeTaxTotals,
  issuerSnapshotFrom
} = require('../services/gstService');
const { hasAtMost2Decimals, parseInvoiceDate, parseRoundOff, parsePlaceOfSupply } = require('../utils/invoiceParsers');
const { HttpError } = require('../utils/httpError');
const { runInTransaction, withSession, sessionOpts } = require('../utils/transaction');
const { logAction } = require('../utils/logger');

const MIN_CANCEL_REASON_LENGTH = 3;

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

// Mode of Transport / Vehicle No always print on the Tax Invoice (blank if empty); the e-way
// bill number is entered manually. `partial` = only fields present in the body (edits).
const parseTransport = (body, { partial = false } = {}) => {
  const out = {};
  const set = (key, transform = (v) => v) => {
    if (partial && body[key] === undefined) return;
    out[key] = transform(clean(body[key]));
  };
  set('transportMode');
  set('vehicleNo', (v) => v.toUpperCase());
  set('ewayBillNo');
  return out;
};

const loadIssuerSettings = async (session) => {
  const settings = await withSession(CompanySettings.findOne(), session).lean();
  if (!settings?.gstin || !settings?.gstStateCode) {
    throw new HttpError(400,
      'Set the company GSTIN and GST State Code under Admin → Company Settings before issuing a Tax Invoice');
  }
  return settings;
};

/** How the Tax Invoice differs from its Bill of Supply — shown as a warning, never blocking. */
const compareToSource = (ti, bos) => ({
  sourceInvoiceNumber: bos.invoiceNumber,
  sourcePcs: bos.totalQty || 0,
  sourceAmount: bos.subTotal || 0,
  pcsDiff: (ti.totalQty || 0) - (bos.totalQty || 0),
  amountDiff: Math.round(((ti.taxableTotal || 0) - (bos.subTotal || 0)) * 100) / 100
});

/** Shape + HSN validation and lot snapshots. Lots are referenced for the record only. */
const buildTaxInvoiceLines = async (rawLines, session) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new HttpError(400, 'Tax Invoice must have at least one line item');
  }
  const lotCache = new Map();
  const lotSnap = async (lotId, label) => {
    const key = String(lotId);
    if (!lotCache.has(key)) {
      const lot = await withSession(Lot.findById(lotId).select('lotNumber invoiceNumber'), session).lean();
      if (!lot) throw new HttpError(400, `${label}: lot not found`);
      lotCache.set(key, lot);
    }
    const lot = lotCache.get(key);
    return { lotId: lot._id, lotNumberSnapshot: lot.lotNumber, lotInvoiceNumberSnapshot: lot.invoiceNumber };
  };

  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const label = `Line ${i + 1}`;
    if (!raw || typeof raw !== 'object') throw new HttpError(400, `${label}: invalid line`);
    const isSample = !!raw.isSample;
    const rate = isSample ? 0 : Number(raw.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new HttpError(400, `${label}: rate must be a non-negative number`);
    if (!hasAtMost2Decimals(rate)) {
      throw new HttpError(400, `${label}: rate can have at most 2 decimal places (got ${raw.rate})`);
    }
    if (!clean(raw.description)) throw new HttpError(400, `${label}: description is required`);

    const hsn = clean(raw.hsnSac);
    if (!isSample) {
      if (!hsn) throw new HttpError(400, `${label}: HSN is required on a Tax Invoice`);
      if (!HSN_RE.test(hsn)) throw new HttpError(400, `${label}: HSN must be 4, 6 or 8 digits (got ${hsn})`);
    }

    const line = {
      description: clean(raw.description),
      remark: clean(raw.remark) || undefined,
      hsnSac: hsn || undefined,
      unit: clean(raw.unit),
      rate,
      isSample
    };

    if (!isSample && Array.isArray(raw.sources) && raw.sources.length > 0) {
      const sources = [];
      let total = 0;
      for (let j = 0; j < raw.sources.length; j++) {
        const s = raw.sources[j];
        const sLabel = `${label} source ${j + 1}`;
        if (!s || typeof s !== 'object') throw new HttpError(400, `${sLabel}: invalid source`);
        const sPcs = parseInt(s.pcs, 10);
        if (!Number.isInteger(sPcs) || sPcs < 1) throw new HttpError(400, `${sLabel}: pcs must be a positive integer`);
        if (!s.lotId) throw new HttpError(400, `${sLabel}: lotId is required`);
        sources.push({ ...(await lotSnap(s.lotId, sLabel)), pcs: sPcs });
        total += sPcs;
      }
      const rawPcs = raw.pcs;
      if (rawPcs !== undefined && rawPcs !== null && rawPcs !== '' && parseInt(rawPcs, 10) !== total) {
        throw new HttpError(400, `${label}: pcs (${parseInt(rawPcs, 10)}) must equal the sum of its source pcs (${total})`);
      }
      line.pcs = total;
      line.sources = sources;
    } else {
      const pcs = parseInt(raw.pcs, 10);
      if (!Number.isInteger(pcs) || pcs < 1) throw new HttpError(400, `${label}: pcs must be a positive integer`);
      line.pcs = pcs;
      if (!isSample && raw.lotId) Object.assign(line, await lotSnap(raw.lotId, label));
    }
    lines.push(line);
  }
  return lines;
};

/**
 * POST /api/tax-invoices/preview — computes rates, tax and totals without saving or allocating
 * a number (the form's live preview). Validation problems return 200 { ok: false, error }.
 */
const previewTaxInvoice = async (req, res) => {
  const { sourceInvoiceId, date, placeOfSupply, lines, roundOff } = req.body;
  try {
    await ensureSeedRules();
    if (!sourceInvoiceId) throw new HttpError(400, 'sourceInvoiceId (the Bill of Supply) is required');
    const bos = await Invoice.findById(sourceInvoiceId).lean();
    if (!bos) throw new HttpError(404, 'Bill of Supply not found');
    const settings = await loadIssuerSettings(null);
    const d = parseInvoiceDate(date || new Date());
    const doc = {
      placeOfSupply: parsePlaceOfSupply(placeOfSupply) || bos.placeOfSupply || {},
      lines: await buildTaxInvoiceLines(lines, null),
      roundOff: parseRoundOff(roundOff)
    };
    applyTaxRates(doc.lines, lines, { rules: await loadActiveRules(), date: d, allowOverride: req.user?.role === 'admin' });
    computeTaxTotals(doc, settings.gstStateCode);
    res.json({ ok: true, preview: doc, comparedToSource: compareToSource(doc, bos) });
  } catch (err) {
    if (err && err.isHttpError) return res.json({ ok: false, error: err.message });
    throw err;
  }
};

/**
 * POST /api/tax-invoices
 * Body: { sourceInvoiceId, date, placeOfSupply?, transportMode, vehicleNo, ewayBillNo, lines, roundOff }
 * Client, billing firm and addresses come from the Bill of Supply's frozen snapshot.
 */
const createTaxInvoice = async (req, res) => {
  const { sourceInvoiceId, date, placeOfSupply, lines, roundOff } = req.body;
  if (!sourceInvoiceId) return res.status(400).json({ error: 'sourceInvoiceId (the Bill of Supply) is required' });
  if (!date) return res.status(400).json({ error: 'Date is required' });
  const tiDate = parseInvoiceDate(date);
  const roundOffValue = parseRoundOff(roundOff);
  const requestedPos = parsePlaceOfSupply(placeOfSupply);
  const transport = parseTransport(req.body);
  const allowOverride = req.user?.role === 'admin';
  await ensureSeedRules();

  const { doc, bos } = await runInTransaction(async (session) => {
    // Write to the Bill of Supply FIRST: two generates for it — or a generate racing a
    // cancel/delete of it — collide here and serialise.
    await Invoice.updateOne({ _id: sourceInvoiceId }, { $inc: { taxInvoiceSeq: 1 } }, sessionOpts(session));
    const source = await withSession(Invoice.findById(sourceInvoiceId), session).lean();
    if (!source) throw new HttpError(404, 'Bill of Supply not found');
    if (source.status !== 'issued') {
      throw new HttpError(400, `${source.invoiceNumber} is ${source.status} — only an issued Bill of Supply can generate a Tax Invoice`);
    }
    const active = await withSession(
      TaxInvoice.findOne({ sourceInvoiceId: source._id, status: 'issued' }).select('invoiceNumber'), session
    ).lean();
    if (active) {
      throw new HttpError(409,
        `Tax Invoice ${active.invoiceNumber} is already active for ${source.invoiceNumber}. Cancel it first to generate a new one.`);
    }

    const settings = await loadIssuerSettings(session);
    const builtLines = await buildTaxInvoiceLines(lines, session);
    const pos = requestedPos || source.placeOfSupply || {};
    if (!clean(pos.stateCode)) {
      throw new HttpError(400, 'Place of supply state code is required on a Tax Invoice — set it on the client / billing firm address');
    }

    const ti = new TaxInvoice({
      sourceInvoiceId: source._id,
      sourceInvoiceNumber: source.invoiceNumber,
      date: tiDate,
      clientId: source.clientId,
      billingFirmId: source.billingFirmId || null,
      clientSnapshot: source.clientSnapshot,
      billTo: source.billTo,
      shipTo: source.shipTo,
      placeOfSupply: pos,
      issuerSnapshot: issuerSnapshotFrom(settings),
      ...transport,
      lines: builtLines,
      roundOff: roundOffValue,
      status: 'issued',
      createdBy: req.user.userId
    });
    applyTaxRates(ti.lines, lines, { rules: await loadActiveRules(session), date: tiDate, allowOverride });
    computeTaxTotals(ti, settings.gstStateCode);
    if (ti.total < 0) throw new HttpError(400, 'Tax Invoice total cannot be negative — check the round off');

    // Own series ("taxinvoice-{fy}"), allocated inside the transaction — rolls back on failure.
    ti.invoiceNumber = await generateTaxInvoiceNumber(tiDate, await getTaxInvoicePrefix(session), session);
    ti.taxInvoiceId = await generateTaxInvoiceInternalId(session);
    await ti.save(sessionOpts(session));
    await recordInvoiceHistory(ti._id, 'create', null, ti.toObject(), req.user.userId, session, 'TAX_INVOICE');
    return { doc: ti, bos: source };
  });

  await logAction(req.user.userId, 'create_tax_invoice', 'TaxInvoice', doc._id,
    `Created Tax Invoice ${doc.invoiceNumber} from ${bos.invoiceNumber}`);
  res.status(201).json({ ...doc.toObject(), comparedToSource: compareToSource(doc, bos) });
};

/** GET /api/tax-invoices/:id — includes `source` (Bill of Supply summary) and the comparison. */
const getTaxInvoiceById = async (req, res) => {
  const ti = await TaxInvoice.findById(req.params.id)
    .populate('clientId', 'name clientCode gstin pan')
    .populate('createdBy', 'username')
    .populate('updatedBy', 'username');
  if (!ti) return res.status(404).json({ error: 'Tax Invoice not found' });
  const source = await Invoice.findById(ti.sourceInvoiceId)
    .select('invoiceNumber status date totalQty subTotal').lean();
  res.json({ ...ti.toObject(), source, comparedToSource: source ? compareToSource(ti, source) : null });
};

/**
 * PATCH /api/tax-invoices/:id — ADMIN ONLY. Fully editable. Rates re-resolve from the rules as of
 * the invoice date unless a line carries taxRateOverride. The issuer snapshot stays frozen.
 */
const updateTaxInvoice = async (req, res) => {
  const { id } = req.params;
  const { date, placeOfSupply, lines, roundOff } = req.body;
  const newDate = (date !== undefined && date !== null && date !== '') ? parseInvoiceDate(date) : null;
  const newRoundOff = roundOff !== undefined ? parseRoundOff(roundOff) : undefined;
  const newPos = parsePlaceOfSupply(placeOfSupply);
  const transport = parseTransport(req.body, { partial: true });
  await ensureSeedRules();

  const { doc, bos } = await runInTransaction(async (session) => {
    const ti = await withSession(TaxInvoice.findById(id), session);
    if (!ti) throw new HttpError(404, 'Tax Invoice not found');
    if (ti.status === 'cancelled') throw new HttpError(400, 'Cancelled Tax Invoices cannot be edited');
    const before = ti.toObject();

    if (newDate && newDate.getTime() !== new Date(ti.date).getTime()) {
      const numbered = parseInvoiceNumber(ti.invoiceNumber);
      const tiFy = numbered ? numbered.fy : fyShortFor(ti.date);
      const newFy = fyShortFor(newDate);
      if (newFy !== tiFy) {
        throw new HttpError(400,
          `${ti.invoiceNumber} belongs to FY ${tiFy}; the new date falls in FY ${newFy}. ` +
          `Cancel this Tax Invoice and generate a new one in the correct year instead.`);
      }
      ti.date = newDate;
    }
    if (Array.isArray(lines)) ti.lines = await buildTaxInvoiceLines(lines, session);
    if (newPos) {
      if (!clean(newPos.stateCode)) throw new HttpError(400, 'Place of supply state code is required on a Tax Invoice');
      ti.placeOfSupply = newPos;
    }
    if (newRoundOff !== undefined) ti.roundOff = newRoundOff;
    Object.assign(ti, transport);

    // Without new lines, keep any existing per-line overrides while re-resolving the rest.
    const rawForRates = Array.isArray(lines)
      ? lines
      : ti.lines.map((l) => ({ taxRateOverride: l.taxRateSource === 'override' ? l.taxRate : undefined }));
    applyTaxRates(ti.lines, rawForRates, { rules: await loadActiveRules(session), date: ti.date, allowOverride: true });
    computeTaxTotals(ti, ti.issuerSnapshot?.gstStateCode);
    if (ti.total < 0) throw new HttpError(400, 'Tax Invoice total cannot be negative — check the round off');

    ti.updatedBy = req.user.userId;
    ti.updatedAt = new Date();
    await ti.save(sessionOpts(session));
    await recordInvoiceHistory(ti._id, 'update', before, ti.toObject(), req.user.userId, session, 'TAX_INVOICE');
    const source = await withSession(
      Invoice.findById(ti.sourceInvoiceId).select('invoiceNumber totalQty subTotal'), session
    ).lean();
    return { doc: ti, bos: source };
  });

  await logAction(req.user.userId, 'update_tax_invoice', 'TaxInvoice', doc._id, `Updated Tax Invoice ${doc.invoiceNumber}`);
  res.json({ ...doc.toObject(), comparedToSource: bos ? compareToSource(doc, bos) : null });
};

/**
 * POST /api/tax-invoices/:id/cancel — body { reason }. ADMIN ONLY. Keeps its number. No stock or
 * balance effect. Afterwards the Bill of Supply can generate a new Tax Invoice, or be cancelled —
 * never deleted (the cancelled Tax Invoice stays on record, linked to it).
 */
const cancelTaxInvoice = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < MIN_CANCEL_REASON_LENGTH) {
    return res.status(400).json({ error: 'A cancellation reason is required' });
  }

  const doc = await runInTransaction(async (session) => {
    const ti = await withSession(TaxInvoice.findById(id), session);
    if (!ti) throw new HttpError(404, 'Tax Invoice not found');
    if (ti.status === 'cancelled') throw new HttpError(400, 'Already cancelled');
    const before = ti.toObject();
    ti.status = 'cancelled';
    ti.cancelReason = reason;
    ti.cancelledAt = new Date();
    ti.cancelledBy = req.user.userId;
    ti.updatedBy = req.user.userId;
    ti.updatedAt = new Date();
    await ti.save(sessionOpts(session));
    await recordInvoiceHistory(ti._id, 'cancel', before, ti.toObject(), req.user.userId, session, 'TAX_INVOICE');
    return ti;
  });

  await logAction(req.user.userId, 'cancel_tax_invoice', 'TaxInvoice', doc._id, `Cancelled Tax Invoice ${doc.invoiceNumber}: ${reason}`);
  res.json(doc);
};

/**
 * DELETE /api/tax-invoices/:id — ADMIN ONLY. Only an ISSUED Tax Invoice that is the most recent
 * number of its FY series; the counter rolls back so the number is reissued.
 */
const deleteTaxInvoice = async (req, res) => {
  const { id } = req.params;

  const deleted = await runInTransaction(async (session) => {
    const ti = await withSession(TaxInvoice.findById(id), session);
    if (!ti) throw new HttpError(404, 'Tax Invoice not found');
    if (ti.status === 'cancelled') {
      throw new HttpError(409, `${ti.invoiceNumber} is cancelled — cancelled Tax Invoices are kept on record and cannot be deleted.`);
    }
    const numbered = parseInvoiceNumber(ti.invoiceNumber);
    if (!numbered) throw new HttpError(409, `${ti.invoiceNumber} doesn't follow the {prefix}{FY}/{n} format — cancel it instead.`);
    const counterId = seriesCounterId('TAX_INVOICE', numbered.fy);
    const counter = await withSession(Counter.findById(counterId), session).lean();
    if (!counter || counter.sequence !== numbered.seq) {
      throw new HttpError(409,
        `Only the most recently issued Tax Invoice can be deleted — FY ${numbered.fy} is at ` +
        `/${counter?.sequence ?? 0}, so deleting ${ti.invoiceNumber} would leave a gap. Cancel it instead.`);
    }
    const before = ti.toObject();
    await TaxInvoice.deleteOne({ _id: ti._id }, sessionOpts(session));
    await Counter.updateOne(
      { _id: counterId, sequence: numbered.seq },
      { $set: { sequence: numbered.seq - 1 } },
      sessionOpts(session)
    );
    await recordInvoiceHistory(ti._id, 'delete', before, null, req.user.userId, session, 'TAX_INVOICE');
    return { id: ti._id, invoiceNumber: ti.invoiceNumber, sourceInvoiceNumber: ti.sourceInvoiceNumber };
  });

  await logAction(req.user.userId, 'delete_tax_invoice', 'TaxInvoice', deleted.id,
    `Deleted Tax Invoice ${deleted.invoiceNumber} (from ${deleted.sourceInvoiceNumber}; counter rolled back)`);
  res.json({ message: 'Tax Invoice deleted' });
};

/** GET /api/tax-invoices/:id/history */
const getTaxInvoiceHistory = async (req, res) => {
  res.json(await getInvoiceHistory(req.params.id));
};

module.exports = {
  previewTaxInvoice,
  createTaxInvoice,
  getTaxInvoiceById,
  updateTaxInvoice,
  cancelTaxInvoice,
  deleteTaxInvoice,
  getTaxInvoiceHistory
};
