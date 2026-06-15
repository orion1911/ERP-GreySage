const express = require('express');
const router = express.Router();
const { createFitStyle, getFitStyles, toggleFitStyleActive, updateFitStyle, reorderFitStyles } = require('../controllers/fitStyleController');
const { authenticateToken } = require('../middleware/auth');

router.post('/fitstyles', authenticateToken, createFitStyle);
router.get('/fitstyles', authenticateToken, getFitStyles);
// Must precede '/fitstyles/:id' so "reorder" isn't captured as an id.
router.patch('/fitstyles/reorder', authenticateToken, reorderFitStyles);
router.put('/fitstyles/:id/toggle-active', authenticateToken, toggleFitStyleActive);
router.patch('/fitstyles/:id', authenticateToken, updateFitStyle);

module.exports = router;