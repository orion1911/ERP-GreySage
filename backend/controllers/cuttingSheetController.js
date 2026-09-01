// Cutting Book — Stage #0. One CuttingSheet = one section of the physical cutting register
// = one Lot. Saving a sheet in `new` mode GENERATES the LotNumber (`series/firstRow/lastRow`)
// and creates the Lot at status 1 (Cut); `attach` mode files a book entry against a lot that
// was created stitching-first, keeping its existing lot number.
//
// Leftover fabric ledger: a row that only partially uses a roll (rollMeters > meters) parks
// the remainder as an `available` FabricLeftover; a later sheet of the same fabric folds it
// into a row as carryInMeters and marks it `used`. Convenience, not hard reconciliation —
// manual carry-ins (pre-ledger leftovers) are always allowed.
const mongoose = require('mongoose');
const { CuttingSheet, FabricLeftover, Lot, Stitching, Counter } = require('../mongodb_schema');
const { parseLotNumber, validateLotNumber, formatLotNumber, deriveWaistSize } = require('../utils/lotNumber');
const { invalidateDashboard } = require('../services/dashboardCache');

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round2 = (n) => Math.round(n * 100) / 100;

// Concurrency guard for lot-number generation. Two users saving sheets in the same series
// at once could BOTH pass the range-overlap check before either lot is inserted (the Lot
// unique index only catches identical strings, not overlapping ranges like Y/37/45 vs
// Y/40/50). Bumping a per-series Counter doc INSIDE the transaction takes a write lock on
// it: a second transaction touching the same doc aborts with WriteConflict, so the overlap
// check + insert are serialised per series. The doc itself is meaningless — it's a mutex.
const lockSeries = (series, session) => Counter.findOneAndUpdate(
  { _id: `seriesLock:${series}` },
  { $inc: { sequence: 1 } },
  { upsert: true, new: true, session }
);
const isWriteConflict = (err) =>
  err && (err.code === 112 || err.code === 11000 || err.codeName === 'WriteConflict' ||
    (typeof err.hasErrorLabel === 'function' && err.hasErrorLabel('TransientTransactionError')));
const CONFLICT_MSG = (series) => `Another user is saving a sheet in series ${series} right now — please try again.`;

// Validate + normalize the sheet body shared by create and update.
// Returns { error } or { sizes, rows, totals, range }.
const normalizeSheetBody = (body) => {
  // Size columns: ascending unique integers.
  let sizes = Array.isArray(body.sizes) ? body.sizes.map((s) => parseInt(s, 10)) : [];
  sizes = [...new Set(sizes)].filter((s) => !isNaN(s)).sort((a, b) => a - b);
  if (sizes.length === 0) return { error: 'At least one size column is required' };

  if (!Array.isArray(body.rows) || body.rows.length === 0) return { error: 'At least one row is required' };

  const rows = [];
  for (const r of body.rows) {
    const bookLotNo = parseInt(r.bookLotNo, 10);
    if (isNaN(bookLotNo) || bookLotNo < 1) return { error: 'Each row needs a valid book lot number' };
    const meters = Number(r.meters);
    if (isNaN(meters) || meters < 0) return { error: `Lot ${bookLotNo}: meters must be a non-negative number` };
    const carryInMeters = Number(r.carryInMeters) || 0;
    if (carryInMeters < 0) return { error: `Lot ${bookLotNo}: carry-in meters cannot be negative` };
    if (meters + carryInMeters <= 0) return { error: `Lot ${bookLotNo}: consumed meters must be greater than 0` };
    let rollMeters;
    if (r.rollMeters !== undefined && r.rollMeters !== null && r.rollMeters !== '') {
      rollMeters = Number(r.rollMeters);
      if (isNaN(rollMeters) || rollMeters < 0) return { error: `Lot ${bookLotNo}: roll meters must be a non-negative number` };
      if (rollMeters < meters) return { error: `Lot ${bookLotNo}: roll meters (${rollMeters}) cannot be less than consumed meters (${meters})` };
    }

    const qtyBySize = {};
    for (const sq of r.sizeQty || []) {
      const size = parseInt(sq.size, 10);
      const qty = parseInt(sq.qty, 10) || 0;
      if (!sizes.includes(size)) continue; // ignore quantities for columns not on the sheet
      if (qty < 0) return { error: `Lot ${bookLotNo}: quantities cannot be negative` };
      qtyBySize[size] = (qtyBySize[size] || 0) + qty;
    }
    const sizeQty = sizes.map((size) => ({ size, qty: qtyBySize[size] || 0 }));
    const totalPcs = sizeQty.reduce((s, x) => s + x.qty, 0);
    if (totalPcs <= 0) return { error: `Lot ${bookLotNo}: total pieces must be greater than 0` };

    rows.push({
      bookLotNo,
      meters,
      carryInMeters,
      ...(rollMeters !== undefined ? { rollMeters } : {}),
      appliedLeftoverId: r.appliedLeftoverId || null,
      sizeQty,
      totalPcs
    });
  }

  // Rows must be the consecutive run the lot number encodes (Y/8/16 ⇒ 8,9,…,16).
  rows.sort((a, b) => a.bookLotNo - b.bookLotNo);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].bookLotNo !== rows[0].bookLotNo + i) {
      return { error: 'Book lot numbers must be consecutive (e.g., 8, 9, 10 … with no gaps or duplicates)' };
    }
  }
  const range = { start: rows[0].bookLotNo, end: rows[rows.length - 1].bookLotNo };

  const totalMeters = round2(rows.reduce((s, r) => s + r.meters + r.carryInMeters, 0));
  const totalPcs = rows.reduce((s, r) => s + r.totalPcs, 0);
  const avgConsumption = totalPcs > 0 ? round2(totalMeters / totalPcs) : 0;

  return { sizes, rows, totals: { totalMeters, totalPcs, avgConsumption }, range };
};

// ─── Leftover ledger reconciliation (all run inside the caller's transaction) ─────────────

// Mark the leftovers this sheet's rows draw from as used. Throws if one is no longer available.
const consumeAppliedLeftovers = async (sheet, session) => {
  for (const row of sheet.rows) {
    if (!row.appliedLeftoverId) continue;
    const updated = await FabricLeftover.findOneAndUpdate(
      {
        _id: row.appliedLeftoverId,
        $or: [{ status: 'available' }, { usedBySheetId: sheet._id }] // idempotent for re-saves
      },
      {
        status: 'used',
        usedBySheetId: sheet._id,
        usedByBookLotNo: row.bookLotNo,
        usedLabel: `${sheet.series}/${row.bookLotNo}`
      },
      { new: true, session }
    );
    if (!updated) {
      throw new Error(`The applied leftover for lot ${row.bookLotNo} is no longer available (used by another sheet). Remove it and re-save.`);
    }
  }
};

// Release leftovers this sheet consumed but no longer references (edit/delete).
const releaseUnappliedLeftovers = async (sheet, session, keepIds = []) => {
  const keep = keepIds.filter(Boolean).map(String);
  await FabricLeftover.updateMany(
    { usedBySheetId: sheet._id, _id: { $nin: keep } },
    { status: 'available', $unset: { usedBySheetId: 1, usedByBookLotNo: 1, usedLabel: 1 } },
    { session }
  );
};

// Bring the leftovers CREATED by this sheet (partially-used rolls) in line with its rows.
// A leftover already consumed by another sheet is immovable: the row that produced it must
// still exist with the same remainder, otherwise the edit is rejected.
const syncCreatedLeftovers = async (sheet, session) => {
  const desired = new Map(); // fromBookLotNo → remainder meters
  for (const row of sheet.rows) {
    if (row.rollMeters !== undefined && row.rollMeters !== null && row.rollMeters > row.meters) {
      desired.set(row.bookLotNo, round2(row.rollMeters - row.meters));
    }
  }

  const existing = await FabricLeftover.find({ fromSheetId: sheet._id }).session(session);
  for (const lo of existing) {
    const want = desired.get(lo.fromBookLotNo);
    if (lo.status === 'used') {
      if (want === undefined || round2(lo.meters) !== want || lo.fabric !== sheet.fabric) {
        throw new Error(`The ${lo.meters}m leftover from ${lo.sourceLabel} was already used by sheet ${lo.usedLabel || ''} — its source row cannot be changed or removed.`);
      }
      desired.delete(lo.fromBookLotNo); // unchanged and in use — keep as-is
    } else if (want !== undefined && round2(lo.meters) === want && lo.fabric === sheet.fabric) {
      desired.delete(lo.fromBookLotNo); // unchanged — keep
    } else {
      await FabricLeftover.deleteOne({ _id: lo._id }, { session }); // stale + unused — drop
    }
  }

  const toCreate = [...desired.entries()].map(([fromBookLotNo, meters]) => ({
    fabric: sheet.fabric,
    meters,
    sourceLabel: `${sheet.series}/${fromBookLotNo}`,
    fromSheetId: sheet._id,
    fromBookLotNo
  }));
  if (toCreate.length > 0) await FabricLeftover.create(toCreate, { session, ordered: true });
};

// ─── Reads ────────────────────────────────────────────────────────────────────────────────

// GET /api/cutting-sheets?search=&page=&limit=
// Search matches series, fabric, or the generated lot number. Each sheet carries
// `hasStitching` so the UI knows when the row range is locked.
const getCuttingSheets = async (req, res) => {
  const { search } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

  const query = {};
  if (search) {
    const re = { $regex: escRe(search.trim()), $options: 'i' };
    const lotIds = await Lot.find({ lotNumber: re }).distinct('_id');
    query.$or = [{ series: re }, { fabric: re }, { lotId: { $in: lotIds } }];
  }

  const [total, sheets] = await Promise.all([
    CuttingSheet.countDocuments(query),
    CuttingSheet.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('clientId', 'name')
      .populate('fitStyleId', 'name')
      .populate('stitchingVendorId', 'name defaultRate')
      .populate('masterId', 'name')
      .populate('lotId', 'lotNumber status invoiceNumber')
      .lean()
  ]);

  // Row-range lock flag: once stitching exists, the lot number (and thus the range) is frozen.
  const stitchedLotIds = new Set(
    (await Stitching.find({ lotId: { $in: sheets.map((s) => s.lotId?._id).filter(Boolean) } }).distinct('lotId'))
      .map(String)
  );
  for (const s of sheets) s.hasStitching = s.lotId ? stitchedLotIds.has(String(s.lotId._id)) : false;

  res.json({ sheets, total, page, limit });
};

// GET /api/cutting-sheets/next-lot-no?series=Y
// Suggests the next book lot number by scanning ALL lots in the series (manual stitching-first
// lots occupy ranges too, not just sheet-generated ones). Also returns the known series list.
const getNextLotNo = async (req, res) => {
  const series = String(req.query.series || '').toUpperCase().trim();
  const lots = await Lot.find({}, { lotNumber: 1 }).lean();

  const knownSeries = new Set();
  let maxEnd = 0;
  for (const lot of lots) {
    let parsed;
    try { parsed = parseLotNumber(lot.lotNumber); } catch (_) { continue; }
    knownSeries.add(parsed.series);
    if (series && parsed.series === series && parsed.lotNum > maxEnd) maxEnd = parsed.lotNum;
  }

  res.json({
    series,
    nextBookLotNo: maxEnd + 1,
    knownSeries: [...knownSeries].sort()
  });
};

// GET /api/cutting-sheets/check-lot?series=Y&start=37&end=45[&excludeLotId=]
// Live validation for the sheet editor as the user types series + range. Advisory only —
// createCuttingSheet / updateCuttingSheet re-run the same check inside a series-locked
// transaction, so a concurrent save can't slip past this.
const checkLotNumber = async (req, res) => {
  const series = String(req.query.series || '').toUpperCase().trim();
  const start = parseInt(req.query.start, 10);
  const end = parseInt(req.query.end, 10);
  if (!series || !/^[A-Z]+$/.test(series)) return res.json({ available: false, message: 'Series must be uppercase letters' });
  if (isNaN(start) || isNaN(end) || start < 1 || end < start) return res.json({ available: false, message: 'Invalid lot range' });
  const lotNumber = formatLotNumber(series, start, end);
  try {
    await validateLotNumber(lotNumber, req.query.excludeLotId || null);
    res.json({ available: true, lotNumber });
  } catch (e) {
    res.json({ available: false, lotNumber, message: e.message });
  }
};

// GET /api/cutting-sheets/available-lots — lots with no book entry yet (attach-mode picker).
const getAvailableLots = async (req, res) => {
  const lots = await Lot.find({ cuttingSheetId: null })
    .sort({ createdAt: -1 })
    .limit(300)
    .select('lotNumber invoiceNumber clientId fitStyleId fabric waistSize date status')
    .populate('clientId', 'name')
    .populate('fitStyleId', 'name')
    .lean();
  res.json(lots);
};

// GET /api/cutting-sheets/cut-lots — status-1 lots for the Add Stitching picker, with their
// sheet's vendor + totals for the prefill.
const getCutLots = async (req, res) => {
  const lots = await Lot.find({ status: 1 })
    .sort({ createdAt: -1 })
    .select('lotNumber clientId fitStyleId fabric waistSize date cuttingSheetId description')
    .populate('cuttingSheetId', 'stitchingVendorId totalPcs totalMeters avgConsumption series')
    .lean();
  res.json(lots);
};

// GET /api/cutting-sheets/leftovers?fabric= — available leftovers, optionally for one fabric.
const getLeftovers = async (req, res) => {
  const { fabric } = req.query;
  const query = { status: 'available' };
  if (fabric) query.fabric = { $regex: `^${escRe(fabric.trim())}$`, $options: 'i' };
  const leftovers = await FabricLeftover.find(query).sort({ createdAt: 1 }).limit(50).lean();
  res.json(leftovers);
};

// ─── Writes ───────────────────────────────────────────────────────────────────────────────

// POST /api/cutting-sheets
// mode 'new'    — generates the lot number from series + row range, creates the Lot (status 1).
// mode 'attach' — files the sheet against an existing lot; series/rows must match its number.
const createCuttingSheet = async (req, res) => {
  const { mode = 'new', lotId, date, series, clientId, fitStyleId, fabric, stitchingVendorId, masterId, panna, layerLength, description } = req.body;

  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!fitStyleId) return res.status(400).json({ error: 'Fit Style is required' });
  if (!fabric) return res.status(400).json({ error: 'Fabric is required' });
  if (!stitchingVendorId) return res.status(400).json({ error: 'Stitching Vendor is required' });
  if (!masterId) return res.status(400).json({ error: 'Cutting Master is required' });

  const normalized = normalizeSheetBody(req.body);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const { sizes, rows, totals, range } = normalized;

  const cleanFabric = String(fabric).toUpperCase().trim();
  const cleanSeries = String(series || '').toUpperCase().trim();

  let lot = null;
  let lotNumber = null;

  if (mode === 'attach') {
    if (!lotId) return res.status(400).json({ error: 'lotId is required to attach a sheet to an existing lot' });
    lot = await Lot.findById(lotId);
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    if (lot.cuttingSheetId) return res.status(400).json({ error: `Lot ${lot.lotNumber} already has a cutting sheet` });
    let parsed;
    try { parsed = parseLotNumber(lot.lotNumber); } catch (e) {
      return res.status(400).json({ error: `Lot number ${lot.lotNumber} cannot be parsed into a series/range: ${e.message}` });
    }
    if (parsed.series !== cleanSeries || parsed.subSeries !== range.start || parsed.lotNum !== range.end) {
      return res.status(400).json({ error: `Sheet rows (${cleanSeries}/${range.start}/${range.end}) must match the lot number ${lot.lotNumber}` });
    }
    lotNumber = lot.lotNumber;
  } else {
    if (!cleanSeries || !/^[A-Z]+$/.test(cleanSeries)) return res.status(400).json({ error: 'Series must contain one or more uppercase letters only' });
    lotNumber = formatLotNumber(cleanSeries, range.start, range.end);
    // Overlap check runs INSIDE the transaction below, after the series lock.
  }

  // Generate sheetId via the Counter pattern (same shape as lotId).
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'cuttingSheetId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  const seq = counter.sequence.toString().padStart(3, '0');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const generatedSheetId = `CS-${dateStr}${seq}`;

  const session = await mongoose.startSession();
  let committed = false;
  let sheet = null;

  try {
    session.startTransaction();

    if (mode !== 'attach') {
      await lockSeries(cleanSeries, session);   // serialise per series (see lockSeries)
      await validateLotNumber(lotNumber);       // range-overlap guard, same as manual entry
      // Lot needs its own generated lotId too.
      const lotCounter = await Counter.findByIdAndUpdate(
        { _id: 'lotId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      const lotSeq = lotCounter.sequence.toString().padStart(3, '0');
      lot = new Lot({
        lotId: `LT-${dateStr}${lotSeq}`,
        lotNumber,
        clientId,
        fabric: cleanFabric,
        fitStyleId,
        waistSize: deriveWaistSize(sizes, rows) || `${sizes[0]}/${sizes[sizes.length - 1]}`,
        date,
        status: 1,
        statusHistory: [{ status: 1, changedAt: new Date() }],
        description,
        createdAt: new Date()
      });
      await lot.save({ session });
    }

    sheet = new CuttingSheet({
      sheetId: generatedSheetId,
      date,
      series: cleanSeries,
      clientId,
      fitStyleId,
      fabric: cleanFabric,
      stitchingVendorId,
      masterId,
      panna: panna !== undefined && panna !== null && panna !== '' ? Number(panna) : undefined,
      layerLength: layerLength !== undefined && layerLength !== null && layerLength !== '' ? Number(layerLength) : undefined,
      sizes,
      rows,
      ...totals,
      description,
      lotId: lot._id,
      createdAt: new Date()
    });
    await sheet.save({ session });

    // Back-link + keep the lot's header in sync with the book entry.
    lot.cuttingSheetId = sheet._id;
    if (mode === 'attach') {
      lot.clientId = clientId;
      lot.fabric = cleanFabric;
      lot.fitStyleId = fitStyleId;
    }
    await lot.save({ session });

    await consumeAppliedLeftovers(sheet, session);
    await syncCreatedLeftovers(sheet, session);

    await session.commitTransaction();
    committed = true;
  } catch (err) {
    if (isWriteConflict(err)) {
      await session.abortTransaction().catch(() => {});
      await session.endSession();
      return res.status(409).json({ error: CONFLICT_MSG(cleanSeries) });
    }
    throw err;
  } finally {
    if (!committed && session.inTransaction()) await session.abortTransaction();
    if (!session.hasEnded) await session.endSession();
  }

  await invalidateDashboard(); // new/updated lot moves header-field aggregations
  const populated = await CuttingSheet.findById(sheet._id)
    .populate('clientId', 'name')
    .populate('fitStyleId', 'name')
    .populate('stitchingVendorId', 'name defaultRate')
    .populate('masterId', 'name')
    .populate('lotId', 'lotNumber status invoiceNumber');
  res.status(201).json(populated);
};

// PATCH /api/cutting-sheets/:id
// Everything stays editable EXCEPT: once the lot has a stitching record, the series and row
// range (= the lot number) are frozen. Header fields sync to the Lot; waistSize and date
// only while the lot is still at status 1 (afterwards they belong to the stitching entry).
const updateCuttingSheet = async (req, res) => {
  const sheet = await CuttingSheet.findById(req.params.id);
  if (!sheet) return res.status(404).json({ error: 'Cutting sheet not found' });
  const lot = await Lot.findById(sheet.lotId);
  if (!lot) return res.status(404).json({ error: 'The lot behind this sheet no longer exists' });

  const { date, series, clientId, fitStyleId, fabric, stitchingVendorId, masterId, panna, layerLength, description } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!fitStyleId) return res.status(400).json({ error: 'Fit Style is required' });
  if (!fabric) return res.status(400).json({ error: 'Fabric is required' });
  if (!stitchingVendorId) return res.status(400).json({ error: 'Stitching Vendor is required' });
  if (!masterId) return res.status(400).json({ error: 'Cutting Master is required' });

  const normalized = normalizeSheetBody(req.body);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const { sizes, rows, totals, range } = normalized;

  const cleanFabric = String(fabric).toUpperCase().trim();
  const cleanSeries = String(series || sheet.series).toUpperCase().trim();
  if (!cleanSeries || !/^[A-Z]+$/.test(cleanSeries)) return res.status(400).json({ error: 'Series must contain one or more uppercase letters only' });

  const hasStitching = !!(await Stitching.findOne({ lotId: lot._id }).select('_id').lean());
  const oldParsed = parseLotNumber(lot.lotNumber);
  const rangeChanged = cleanSeries !== oldParsed.series || range.start !== oldParsed.subSeries || range.end !== oldParsed.lotNum;

  if (hasStitching && rangeChanged) {
    return res.status(400).json({ error: `Lot ${lot.lotNumber} already has stitching — its series and row range are locked. Quantities and meters can still be edited.` });
  }

  let newLotNumber = lot.lotNumber;
  if (rangeChanged) newLotNumber = formatLotNumber(cleanSeries, range.start, range.end);

  const session = await mongoose.startSession();
  let committed = false;
  try {
    session.startTransaction();

    if (rangeChanged) {
      await lockSeries(cleanSeries, session);           // serialise per series (see lockSeries)
      await validateLotNumber(newLotNumber, lot._id);   // overlap guard, excluding this lot
    }

    sheet.set({
      date,
      series: cleanSeries,
      clientId,
      fitStyleId,
      fabric: cleanFabric,
      stitchingVendorId,
      masterId,
      panna: panna !== undefined && panna !== null && panna !== '' ? Number(panna) : undefined,
      layerLength: layerLength !== undefined && layerLength !== null && layerLength !== '' ? Number(layerLength) : undefined,
      sizes,
      rows,
      ...totals,
      description
    });
    await sheet.save({ session });

    // One source of truth: the lot mirrors the sheet's header.
    lot.lotNumber = newLotNumber;
    lot.clientId = clientId;
    lot.fabric = cleanFabric;
    lot.fitStyleId = fitStyleId;
    if (description !== undefined) lot.description = description;
    if (lot.status === 1) {
      lot.date = date;
      lot.waistSize = deriveWaistSize(sizes, rows) || lot.waistSize;
    }
    await lot.save({ session });

    // Leftover ledger: release drops, consume additions, re-sync created remainders.
    const stillApplied = sheet.rows.map((r) => r.appliedLeftoverId).filter(Boolean);
    await releaseUnappliedLeftovers(sheet, session, stillApplied);
    await consumeAppliedLeftovers(sheet, session);
    await syncCreatedLeftovers(sheet, session);

    await session.commitTransaction();
    committed = true;
  } catch (err) {
    if (isWriteConflict(err)) {
      await session.abortTransaction().catch(() => {});
      await session.endSession();
      return res.status(409).json({ error: CONFLICT_MSG(cleanSeries) });
    }
    throw err;
  } finally {
    if (!committed && session.inTransaction()) await session.abortTransaction();
    if (!session.hasEnded) await session.endSession();
  }

  await invalidateDashboard();
  const populated = await CuttingSheet.findById(sheet._id)
    .populate('clientId', 'name')
    .populate('fitStyleId', 'name')
    .populate('stitchingVendorId', 'name defaultRate')
    .populate('masterId', 'name')
    .populate('lotId', 'lotNumber status invoiceNumber');
  res.json(populated);
};

// DELETE /api/cutting-sheets/:id
// A sheet whose lot was born here (status 1, no stitching) takes the lot with it. A sheet
// attached to an in-pipeline lot detaches and leaves the lot alone. Blocked while a leftover
// this sheet created is in use elsewhere (deleting would orphan real fabric history).
const deleteCuttingSheet = async (req, res) => {
  const sheet = await CuttingSheet.findById(req.params.id);
  if (!sheet) return res.status(404).json({ error: 'Cutting sheet not found' });
  const lot = await Lot.findById(sheet.lotId);

  const usedElsewhere = await FabricLeftover.findOne({ fromSheetId: sheet._id, status: 'used' }).lean();
  if (usedElsewhere) {
    return res.status(400).json({ error: `The ${usedElsewhere.meters}m leftover from ${usedElsewhere.sourceLabel} was already used by sheet ${usedElsewhere.usedLabel || ''} — remove it there before deleting this sheet.` });
  }

  const hasStitching = lot ? !!(await Stitching.findOne({ lotId: lot._id }).select('_id').lean()) : false;
  const deleteLotToo = lot && lot.status === 1 && !hasStitching;

  const session = await mongoose.startSession();
  let committed = false;
  try {
    session.startTransaction();

    await FabricLeftover.deleteMany({ fromSheetId: sheet._id }, { session }); // all unused (guarded above)
    await releaseUnappliedLeftovers(sheet, session, []); // give back everything this sheet consumed

    await CuttingSheet.deleteOne({ _id: sheet._id }, { session });
    if (deleteLotToo) {
      await Lot.deleteOne({ _id: lot._id }, { session });
    } else if (lot) {
      lot.cuttingSheetId = null;
      await lot.save({ session });
    }

    await session.commitTransaction();
    committed = true;
  } finally {
    if (!committed) await session.abortTransaction();
    await session.endSession();
  }

  await invalidateDashboard();
  res.json({ ok: true, lotDeleted: deleteLotToo });
};

module.exports = {
  getCuttingSheets,
  getNextLotNo,
  checkLotNumber,
  getAvailableLots,
  getCutLots,
  getLeftovers,
  createCuttingSheet,
  updateCuttingSheet,
  deleteCuttingSheet
};
