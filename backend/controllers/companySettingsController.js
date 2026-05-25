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
 */
const updateSettings = async (req, res) => {
  const payload = { ...req.body, updatedAt: new Date() };
  const settings = await CompanySettings.findOneAndUpdate(
    {},
    payload,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await logAction(req.user.userId, 'update_company_settings', 'CompanySettings', settings._id, 'Updated company settings');
  res.json(settings);
};

module.exports = { getSettings, updateSettings };
