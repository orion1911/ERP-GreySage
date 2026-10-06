const { CompanySettings } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

/**
 * GET /api/company-settings — returns the singleton (creates a blank one if missing).
 */
const getSettings = async (req, res) => {
  let settings = await CompanySettings.findOne();
  if (!settings) {
    settings = await CompanySettings.create({ name: 'YOUR COMPANY' });
  }
  res.json(settings);
};

/**
 * PUT /api/company-settings — upsert the singleton. Admin-only.
 *
 * defaultInvoicePrefix is LOCKED: it is part of every issued invoice number, and the per-FY
 * counter doesn't know about prefixes, so changing it mid-series would fork the numbering.
 * It is silently ignored here (older frontends still send it on every save); change it only
 * by a deliberate DB edit. _id is stripped because it is immutable.
 */
const updateSettings = async (req, res) => {
  const payload = { ...(req.body || {}) };
  delete payload.defaultInvoicePrefix;
  delete payload._id;
  payload.updatedAt = new Date();
  const settings = await CompanySettings.findOneAndUpdate(
    {},
    payload,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await logAction(req.user.userId, 'update_company_settings', 'CompanySettings', settings._id, 'Updated company settings');
  res.json(settings);
};

module.exports = { getSettings, updateSettings };
