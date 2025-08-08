// routes/finishing.js
const express = require('express');
const router = express.Router();
const {
  createFinishing,
  updateFinishing,
  updateFinishingStatus,
  getFinishing
} = require('../controllers/finishingController');
const { authenticateToken } = require('../middleware/auth');

router.post('/finishing', authenticateToken, createFinishing);
router.post('/finishing-update/:id', authenticateToken, updateFinishing);
router.put('/finishing/:id', authenticateToken, updateFinishingStatus);
router.get('/finishing', authenticateToken, getFinishing);

module.exports = router;
