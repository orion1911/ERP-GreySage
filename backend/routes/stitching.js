const express = require('express');
const router = express.Router();
const { createStitching, updateStitching, updateStitchingStatus, getStitching } = require('../controllers/stitchingController');
const { authenticateToken } = require('../middleware/auth');

router.post('/stitching', authenticateToken, createStitching);
router.post('/stitching-update/:id', authenticateToken, updateStitching);
router.put('/stitching/:id', authenticateToken, updateStitchingStatus);
router.get('/stitching/', authenticateToken, getStitching);

module.exports = router;