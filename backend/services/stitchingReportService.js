// Stitching report rows for one client. Totals are NOT computed here: the browser sums the
// rows still ticked, so the screen and both exports always agree.
const mongoose = require('mongoose');
const { Client, Lot, Stitching, CuttingSheet } = require('../mongodb_schema');
const { HttpError } = require('../utils/httpError');

// Keep in sync with frontend/src/features/Reports/stitchingReportUtils.js
const STATUS_LABELS = {
  1: 'Cut', 2: 'Stitching', 3: 'Washing', 4: 'Finishing',
  5: 'Finished', 6: 'Part Dispatch', 7: 'Dispatched',
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Calendar days are IST whatever the server's TZ (Vercel runs in UTC).
const istStart = (day) => new Date(`${day}T00:00:00.000+05:30`);
const istEnd = (day) => new Date(`${day}T23:59:59.999+05:30`);

const parseDay = (day, label) => {
  if (!day) return null;
  if (!DAY_RE.test(day) || Number.isNaN(istStart(day).getTime())) {
    throw new HttpError(400, `${label} must be a date in YYYY-MM-DD form`);
  }
  return day;
};

const natural = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true });

// Maker bill first (same order as the copy clients receive); lots with no bill yet (Cut)
// last; then lot date; then lot number in natural order (A/9 before A/10).
const compareRows = (a, b) => {
  const ai = a.makerInv ?? Infinity;
  const bi = b.makerInv ?? Infinity;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const ad = a.date ? new Date(a.date).getTime() : 0;
  const bd = b.date ? new Date(b.date).getTime() : 0;
  if (ad !== bd) return ad - bd;
  return natural(a.lotNumber, b.lotNumber);
};

const buildStitchingReport = async ({ clientId, from, to, statuses = [] }) => {
  if (!mongoose.isValidObjectId(clientId)) throw new HttpError(400, 'Pick a valid client');
  const fromDay = parseDay(from, 'from');
  const toDay = parseDay(to, 'to');
  if (fromDay && toDay && fromDay > toDay) throw new HttpError(400, '"from" is after "to"');

  const client = await Client.findById(clientId).select('name clientCode').lean();
  if (!client) throw new HttpError(404, 'Client not found');

  const query = { clientId: client._id };
  if (fromDay || toDay) {
    query.date = {};
    if (fromDay) query.date.$gte = istStart(fromDay);
    if (toDay) query.date.$lte = istEnd(toDay);
  }
  if (statuses.length) query.status = { $in: statuses };

  const lots = await Lot.find(query)
    .select('lotNumber invoiceNumber date status fabric waistSize fitStyleId')
    .populate('fitStyleId', 'name')
    .lean();
  if (!lots.length) return { client, rows: [] };

  const lotIds = lots.map((l) => l._id);
  const [stitchings, sheets] = await Promise.all([
    Stitching.find({ lotId: { $in: lotIds } })
      .select('lotId date stitchOutDate quantity quantityShort vendorId')
      .populate('vendorId', 'name')
      .lean(),
    CuttingSheet.find({ lotId: { $in: lotIds } }).select('lotId totalPcs').lean(),
  ]);

  // One Stitching per lot today (createStitchingForCutLot), but sum anyway so a second
  // record could never silently drop pieces from the report.
  const stitchByLot = new Map();
  for (const s of stitchings) {
    const key = String(s.lotId);
    const acc = stitchByLot.get(key)
      || { quantity: 0, short: 0, vendors: new Set(), stitchIn: null, stitchOut: null };
    acc.quantity += Number(s.quantity) || 0;
    acc.short += Number(s.quantityShort) || 0;
    if (s.vendorId?.name) acc.vendors.add(s.vendorId.name);
    if (s.date && (!acc.stitchIn || s.date < acc.stitchIn)) acc.stitchIn = s.date;
    if (s.stitchOutDate && (!acc.stitchOut || s.stitchOutDate > acc.stitchOut)) acc.stitchOut = s.stitchOutDate;
    stitchByLot.set(key, acc);
  }
  const cutByLot = new Map(sheets.map((s) => [String(s.lotId), Number(s.totalPcs) || 0]));

  const rows = lots.map((lot) => {
    const id = String(lot._id);
    const st = stitchByLot.get(id);
    const cutPcs = cutByLot.has(id) ? cutByLot.get(id) : null;
    const net = st ? st.quantity - st.short : null; // same figure cascadeShortageFromStitching passes on
    return {
      lotId: id,
      lotNumber: lot.lotNumber,
      makerInv: lot.invoiceNumber ?? null, // maker bill; null while the lot is at Cut
      date: lot.date,
      fitStyleId: lot.fitStyleId?._id ? String(lot.fitStyleId._id) : '',
      fitStyle: lot.fitStyleId?.name || '(no fit style)',
      fabric: lot.fabric || '',
      waistSize: lot.waistSize || '',
      vendor: st ? [...st.vendors].join(', ') : '',
      stitchIn: st?.stitchIn || null,
      stitchOut: st?.stitchOut || null,
      cutPcs,
      stitched: st ? st.quantity : null,
      short: st ? st.short : null,
      net,
      pcs: net ?? cutPcs ?? 0,
      status: lot.status,
      statusLabel: STATUS_LABELS[lot.status] || `Status ${lot.status}`,
    };
  });

  rows.sort(compareRows);
  return { client, rows };
};

module.exports = { buildStitchingReport, STATUS_LABELS };
