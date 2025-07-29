const express = require('express');
const router = express.Router();
const { createFitStyle, getFitStyles, toggleFitStyleActive, updateFitStyle } = require('../controllers/fitStyleController');
const { authenticateToken } = require('../middleware/auth');

router.post('/fitstyles', authenticateToken, createFitStyle);
router.get('/fitstyles', authenticateToken, getFitStyles);
router.put('/fitstyles/:id/toggle-active', authenticateToken, toggleFitStyleActive);
router.patch('/fitstyles/:id', authenticateToken, updateFitStyle);

module.exports = router;