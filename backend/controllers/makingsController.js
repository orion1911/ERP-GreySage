// controllers/makingsController.js
// Serves the MAKINGS excel ↔ MongoDB reconciliation to the in-app notification bell.
// The bell READ hits the stored (precomputed) result so it returns instantly; the
// ~15s workbook parse only runs in the cron/precompute job and the manual refresh.
const { getStoredMakingsDiff, runMakingsRecon, resolveLotDiscrepancy } = require('../services/makingsReconService');

// GET /api/makings/diff — fast read of the last stored reconciliation.
const getMakingsDiffController = async (req, res) => {
  try {
    const result = await getStoredMakingsDiff();
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('makings diff read failed:', err.message);
    return res.status(500).json({ success: false, error: 'Could not read MAKINGS reconciliation' });
  }
};

// POST /api/makings/refresh — recompute now (downloads + parses the workbook, ~15s)
// and persist the result, then return it. Triggered by the bell's refresh button.
const refreshMakingsController = async (req, res) => {
  try {
    const result = await runMakingsRecon();
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('makings refresh failed:', err.message);
    // Log the detail; return a generic message (the workbook error text can leak config hints).
    return res.status(502).json({ success: false, error: 'Could not refresh — the MAKINGS workbook could not be read.' });
  }
};

// POST /api/makings/resolve — re-diff a single lot after its record was created/edited
// and update the stored result, so the bell drops the resolved notification immediately.
const resolveMakingsController = async (req, res) => {
  try {
    const { lotNumber, bill } = req.body || {};
    const result = await resolveLotDiscrepancy({ lotNumber, bill });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('makings resolve failed:', err.message);
    return res.status(500).json({ success: false, error: 'Could not update reconciliation' });
  }
};

module.exports = { getMakingsDiffController, refreshMakingsController, resolveMakingsController };
