const express = require('express');
const router = express.Router();
const { lowStockDigest, makingsReconCron } = require('../controllers/cronController');

// Machine-triggered (Vercel Cron). No JWT — guarded by CRON_SECRET inside the handler.
router.get('/low-stock-digest', lowStockDigest);
router.get('/makings-recon', makingsReconCron);

module.exports = router;
