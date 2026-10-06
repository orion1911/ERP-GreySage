// Request parsers shared by the Bill of Supply and Tax Invoice controllers.
// All throw HttpError(400) so middleware/error.js returns the message to the user.
const { HttpError } = require('./httpError');

// Round-off only nudges the total to a whole rupee, so it must stay strictly inside ±1.
const MAX_ABS_ROUND_OFF = 1;

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

// Only the two fields the schema stores; anything else in the request is ignored.
const parsePlaceOfSupply = (value) => {
  if (!value || typeof value !== 'object') return null;
  return {
    stateCode: value.stateCode ? String(value.stateCode).trim() : '',
    stateName: value.stateName ? String(value.stateName).trim() : ''
  };
};

module.exports = { MAX_ABS_ROUND_OFF, hasAtMost2Decimals, parseInvoiceDate, parseRoundOff, parsePlaceOfSupply };
