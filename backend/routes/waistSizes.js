const express = require('express');
const router = express.Router();
const { createWaistSize, getWaistSizes, toggleWaistSizeDefault, toggleWaistSizeActive } = require('../controllers/waistSizeController');
const { authenticateToken } = require('../middleware/auth');

router.post('/waist-sizes', authenticateToken, createWaistSize);
router.get('/waist-sizes', authenticateToken, getWaistSizes);
router.put('/waist-sizes/:id/toggle-default', authenticateToken, toggleWaistSizeDefault);
router.put('/waist-sizes/:id/toggle-active', authenticateToken, toggleWaistSizeActive);

module.exports = router;
