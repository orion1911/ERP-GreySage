const { buildStitchingReport } = require('../services/stitchingReportService');
const { HttpError } = require('../utils/httpError');

// "2,3,4" → [2, 3, 4]. Empty = every status. Anything outside 1–7 is refused rather than
// dropped, so a typo can't quietly shrink the report.
const parseStatuses = (raw) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return [];
  const nums = String(raw).split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) {
    throw new HttpError(400, 'status must be a comma-separated list of numbers from 1 to 7');
  }
  return [...new Set(nums)];
};

// GET /api/reports/stitching?clientId=&from=YYYY-MM-DD&to=YYYY-MM-DD&status=2,3,4
const getStitchingReport = async (req, res) => {
  const { clientId, from, to, status } = req.query;
  if (!clientId) throw new HttpError(400, 'clientId is required');
  res.json(await buildStitchingReport({ clientId, from, to, statuses: parseStatuses(status) }));
};

module.exports = { getStitchingReport };
