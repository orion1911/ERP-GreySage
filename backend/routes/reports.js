const express = require('express');
const router = express.Router();
const { generateReport, getReports } = require('../controllers/reportController');
const { getStitchingReport } = require('../controllers/stitchingReportController');
const { authenticateToken } = require('../middleware/auth');

router.get('/reports/stitching', authenticateToken, getStitchingReport);
router.post('/reports', authenticateToken, generateReport);
router.get('/reports', authenticateToken, getReports);

module.exports = router;