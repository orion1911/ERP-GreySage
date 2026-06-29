const express = require('express');
const router = express.Router();
const { lowStockDigest } = require('../controllers/cronController');

// Machine-triggered (Vercel Cron). No JWT — guarded by CRON_SECRET inside the handler.
router.get('/low-stock-digest', lowStockDigest);

module.exports = router;
