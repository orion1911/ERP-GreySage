// Scheduled / machine-triggered jobs. Currently: the daily low-stock email digest,
// invoked by Vercel Cron (see backend/vercel.json "crons").
const { CompanySettings } = require('../mongodb_schema');
const { getLowStockItems } = require('../services/accessoryService');
const { notifyLowStock } = require('../services/notificationService');
const { runMakingsRecon } = require('../services/makingsReconService');

/**
 * Shared orchestration used by both the cron endpoint and the admin "send test" trigger.
 * Loads settings → computes low items → emails the digest if there are recipients and
 * at least one low item. `force` bypasses the enabled flag (for the manual test).
 * @returns {Promise<{enabled:boolean, low:number, sent:boolean, reason?:string, recipients?:string[]}>}
 */
const runLowStockDigest = async ({ force = false } = {}) => {
  const settings = await CompanySettings.findOne().lean();
  const cfg = settings && settings.notifications && settings.notifications.lowStock;
  const enabled = !!(cfg && cfg.enabled);
  const emails = (cfg && cfg.emails) || [];

  if (!force && !enabled) return { enabled, low: 0, sent: false, reason: 'disabled' };
  if (!emails.length) return { enabled, low: 0, sent: false, reason: 'no recipients' };

  const items = await getLowStockItems();
  if (!items.length) return { enabled, low: 0, sent: false, reason: 'nothing low' };

  const res = await notifyLowStock(items, emails);
  return { enabled, low: items.length, sent: true, recipients: res.recipients };
};

/**
 * GET /api/cron/low-stock-digest — invoked daily by Vercel Cron. Secret-guarded: Vercel
 * sends `Authorization: Bearer <CRON_SECRET>`. Mounted WITHOUT the JWT auth middleware.
 */
const lowStockDigest = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const result = await runLowStockDigest();
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('low-stock digest failed:', err.message);
    return res.status(500).json({ success: false, error: 'Digest failed' });
  }
};

/**
 * GET /api/cron/makings-recon — invoked by Vercel Cron. Downloads + parses the
 * MAKINGS workbook, diffs against MongoDB, and stores the result for the bell.
 * Secret-guarded (Vercel sends `Authorization: Bearer <CRON_SECRET>`); no JWT.
 */
const makingsReconCron = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const doc = await runMakingsRecon();
    return res.json({ success: true, count: doc.count, scannedRows: doc.scannedRows, computedMs: doc.computedMs });
  } catch (err) {
    console.error('makings recon cron failed:', err.message);
    return res.status(500).json({ success: false, error: 'Reconciliation failed' });
  }
};

module.exports = { lowStockDigest, runLowStockDigest, makingsReconCron };
