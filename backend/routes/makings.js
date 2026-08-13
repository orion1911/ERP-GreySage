// routes/makings.js — MAKINGS excel vs MongoDB reconciliation (notification bell).
const express = require('express');
const router = express.Router();
const {
  getMakingsDiffController,
  refreshMakingsController,
  resolveMakingsController,
  discardMakingsController,
  restoreMakingsController,
  getMakingsDiscardsController,
} = require('../controllers/makingsController');
const { authenticateToken } = require('../middleware/auth');

// Fast read of the last precomputed reconciliation (bell polls this).
router.get('/makings/diff', authenticateToken, getMakingsDiffController);
// Recompute now + persist (bell's manual refresh button). Runs the ~15s job.
router.post('/makings/refresh', authenticateToken, refreshMakingsController);
// Re-diff a single lot after its record was created/edited (fast; no workbook parse).
router.post('/makings/resolve', authenticateToken, resolveMakingsController);
// Hide / un-hide a stale excel row, and list what's currently hidden. A discard is
// tenant-wide (it disappears for everyone), which is why we record who did it.
router.post('/makings/discard', authenticateToken, discardMakingsController);
router.post('/makings/restore', authenticateToken, restoreMakingsController);
router.get('/makings/discards', authenticateToken, getMakingsDiscardsController);

module.exports = router;
