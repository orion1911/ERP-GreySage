const express = require('express');
const router = express.Router();
const {
  createWashCreation,
  getWashCreations,
  reorderWashCreations,
  toggleWashCreationActive,
  updateWashCreation,
  getWashCreationRates,
  saveWashCreationRates,
} = require('../controllers/washCreationController');
const { authenticateToken } = require('../middleware/auth');

// Catalog
router.post('/wash-creations', authenticateToken, createWashCreation);
router.get('/wash-creations', authenticateToken, getWashCreations);
// Reorder must precede the '/:id' PATCH so 'reorder' isn't captured as an :id.
router.patch('/wash-creations/reorder', authenticateToken, reorderWashCreations);
router.patch('/wash-creations/:id', authenticateToken, updateWashCreation);
router.put('/wash-creations/:id/toggle-active', authenticateToken, toggleWashCreationActive);

// Per-vendor rate card
router.get('/wash-creation-rates', authenticateToken, getWashCreationRates);
router.put('/wash-creation-rates', authenticateToken, saveWashCreationRates);

module.exports = router;