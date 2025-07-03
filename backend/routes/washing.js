const express = require('express');
const router = express.Router();
const { createWashing, updateWashing, updateWashingStatus, getWashing } = require('../controllers/washingController');
const { authenticateToken } = require('../middleware/auth');

router.post('/washing', authenticateToken, createWashing);
router.post('/washing-update/:id', authenticateToken, updateWashing);
router.put('/washing/:id', authenticateToken, updateWashingStatus);
router.get('/washing', authenticateToken, getWashing);

module.exports = router;