const express = require('express');
const router = express.Router();
const { getCostingBoard, getLotCosting, saveLotCosting } = require('../controllers/costingController');
const { authenticateToken } = require('../middleware/auth');

// 'lot' routes must be declared before any future '/:id'-style route.
router.get('/costing', authenticateToken, getCostingBoard);
router.get('/costing/lot/:lotId', authenticateToken, getLotCosting);
router.put('/costing/lot/:lotId', authenticateToken, saveLotCosting);

module.exports = router;