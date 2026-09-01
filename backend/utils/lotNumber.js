// Shared LotNumber helpers — extracted from the top of stitchingController.js when the
// Cutting Book module landed, because sheet-driven lot generation (cuttingSheetController)
// needs the exact same parse/overlap rules as manual entry. Behaviour is unchanged.
//
// A LotNumber like `Y/8/16` means series `Y`, book lots 8 through 16 (one cutting sheet).
// A single batch is written `Y/45`.

const { Lot } = require('../mongodb_schema');

// Parse `SERIES/SUBSERIES[/LOTNUM]` → { series, subSeries, lotNum }.
// For the 2-part form, subSeries === lotNum (a single-batch range).
const parseLotNumber = (lotNumber) => {
  const parts = lotNumber.split('/');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error('Invalid lotNumber format. Expected format: SERIES/SUBSERIES or SERIES/SUBSERIES/NUM');
  }
  const [series, subSeries, lotNum] = parts;
  if (!/^[A-Z]+$/.test(series)) {
    throw new Error('Series must contain one or more uppercase letters only');
  }
  if (!/^\d+$/.test(subSeries)) {
    throw new Error('Sub-series must be a number');
  }
  if (parts.length === 3 && !/^\d+$/.test(lotNum)) {
    throw new Error('Lot number must be a number');
  }
  return {
    series,
    subSeries: parseInt(subSeries, 10),
    lotNum: parts.length === 3 ? parseInt(lotNum, 10) : parseInt(subSeries, 10),
  };
};

// Validate a lotNumber's range doesn't overlap any existing range in the same series.
// excludeLotId skips the lot being edited. Throws on conflict; callers either catch and
// translate, or let express-async-errors route it to the global handler (as before).
const validateLotNumber = async (lotNumber, excludeLotId = null) => {
  const { series, subSeries, lotNum } = parseLotNumber(lotNumber);

  const newRangeStart = subSeries;
  const newRangeEnd = lotNum;

  const query = { lotNumber: { $regex: `^${series}/` } };
  if (excludeLotId) query._id = { $ne: excludeLotId };
  const existingLots = await Lot.find(query);

  for (const lot of existingLots) {
    let range;
    try {
      const { subSeries: s, lotNum: e } = parseLotNumber(lot.lotNumber);
      range = { start: s, end: e };
    } catch (_) {
      continue; // unparseable legacy value — cannot overlap-check, skip
    }
    const overlap =
      (newRangeStart >= range.start && newRangeStart <= range.end) ||
      (newRangeEnd >= range.start && newRangeEnd <= range.end) ||
      (newRangeStart <= range.start && newRangeEnd >= range.end);
    if (overlap) {
      throw new Error(`Lot range already exists! Lot range ${series}/${newRangeStart}/${newRangeEnd} conflicts with existing range ${series}/${range.start}/${range.end}`);
    }
  }
};

// Compose the canonical string for a series + book-lot range: `Y/8/16`, single batch `Y/45`.
const formatLotNumber = (series, start, end) =>
  start === end ? `${series}/${start}` : `${series}/${start}/${end}`;

// Derive the hand-written waist-size shorthand from a sheet's size-wise totals.
//   28:10 30:20 32:10 34:10 36:10  →  "28/36-30D"   (30 cut at double the base ratio)
//   flat 22s across 28–36          →  "28/36"
// Only exact 2× multiples get the D suffix; anything irregular is left to the user to
// adjust in the (editable) Add Stitching field.
const deriveWaistSize = (sizes, rows) => {
  const totals = {};
  for (const row of rows) {
    for (const sq of row.sizeQty || []) {
      if (Number(sq.qty) > 0) totals[sq.size] = (totals[sq.size] || 0) + Number(sq.qty);
    }
  }
  const active = Object.keys(totals).map(Number).sort((a, b) => a - b);
  if (active.length === 0) return '';
  const base = Math.min(...active.map((s) => totals[s]));
  let str = active.length === 1 ? `${active[0]}` : `${active[0]}/${active[active.length - 1]}`;
  for (const s of active) {
    if (base > 0 && totals[s] === base * 2) str += `-${s}D`;
  }
  return str;
};

module.exports = { parseLotNumber, validateLotNumber, formatLotNumber, deriveWaistSize };
