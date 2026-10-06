const express = require('express');
const router = express.Router();
const { listGstRates, createGstRate, updateGstRate } = require('../controllers/gstRateController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, listGstRates);
router.post('/', requireAdmin, createGstRate);
router.patch('/:id', requireAdmin, updateGstRate);

module.exports = router;
