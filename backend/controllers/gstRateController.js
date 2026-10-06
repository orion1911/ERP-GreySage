// ─── GST rate rules (admin) ──────────────────────────────────────────────────
// To change a rate, ADD a rule with a later effectiveFrom rather than editing the old one:
// Tax Invoices dated before it keep resolving to the old rule. Editing a rule in place
// re-rates any older Tax Invoice that is later re-saved.
const { GstRateRule } = require('../mongodb_schema');
const { ensureSeedRules } = require('../services/gstService');
const { HttpError } = require('../utils/httpError');
const { logAction } = require('../utils/logger');

const parseRate = (v, name, required) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${name} is required`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, `${name} must be between 0 and 100`);
  return n;
};

const parseRule = (body, { partial = false } = {}) => {
  const out = {};
  if (!partial || body.hsnPrefix !== undefined) {
    const p = String(body.hsnPrefix ?? '').trim();
    if (!/^\d{2,8}$/.test(p)) throw new HttpError(400, 'HSN prefix must be 2–8 digits (e.g. 62 or 620342)');
    out.hsnPrefix = p;
  }
  if (!partial || body.rateUpTo !== undefined) out.rateUpTo = parseRate(body.rateUpTo, 'Rate', true);
  if (!partial || body.rateAbove !== undefined) out.rateAbove = parseRate(body.rateAbove, 'Rate above threshold', false);
  if (!partial || body.thresholdPerPiece !== undefined) {
    const t = body.thresholdPerPiece;
    if (t === undefined || t === null || t === '') out.thresholdPerPiece = null;
    else {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Threshold per piece must be a non-negative number');
      out.thresholdPerPiece = n;
    }
  }
  if (!partial || body.effectiveFrom !== undefined) {
    const d = new Date(body.effectiveFrom);
    if (!body.effectiveFrom || Number.isNaN(d.getTime())) throw new HttpError(400, 'Effective-from date is invalid');
    out.effectiveFrom = d;
  }
  if (body.notes !== undefined) out.notes = String(body.notes || '').trim();
  if (body.isActive !== undefined) out.isActive = !!body.isActive;
  return out;
};

// A slab needs both halves: a threshold with no "above" rate would silently fall back to flat.
const assertConsistent = (r) => {
  const hasThreshold = r.thresholdPerPiece !== null && r.thresholdPerPiece !== undefined;
  const hasAbove = r.rateAbove !== null && r.rateAbove !== undefined;
  if (hasThreshold !== hasAbove) {
    throw new HttpError(400, 'Set both the threshold per piece and the rate above it, or neither (flat rate)');
  }
};

/** GET /api/gst-rates — all rules (active and inactive). */
const listGstRates = async (req, res) => {
  await ensureSeedRules();
  res.json(await GstRateRule.find().sort({ hsnPrefix: 1, effectiveFrom: -1 }).lean());
};

/** POST /api/gst-rates — ADMIN ONLY. */
const createGstRate = async (req, res) => {
  const data = parseRule(req.body);
  assertConsistent(data);
  const rule = await GstRateRule.create({ ...data, createdBy: req.user.userId });
  await logAction(req.user.userId, 'create_gst_rate', 'GstRateRule', rule._id,
    `HSN ${rule.hsnPrefix}: ${rule.rateUpTo}% from ${rule.effectiveFrom.toISOString().slice(0, 10)}`);
  res.status(201).json(rule);
};

/** PATCH /api/gst-rates/:id — ADMIN ONLY. Also used to deactivate ({ isActive: false }). */
const updateGstRate = async (req, res) => {
  const rule = await GstRateRule.findById(req.params.id);
  if (!rule) return res.status(404).json({ error: 'GST rate rule not found' });
  Object.assign(rule, parseRule(req.body, { partial: true }));
  assertConsistent(rule);
  rule.updatedBy = req.user.userId;
  rule.updatedAt = new Date();
  await rule.save();
  await logAction(req.user.userId, 'update_gst_rate', 'GstRateRule', rule._id,
    `Updated GST rule for HSN ${rule.hsnPrefix}${rule.isActive ? '' : ' (inactive)'}`);
  res.json(rule);
};

module.exports = { listGstRates, createGstRate, updateGstRate };
