const express = require('express');
const router = express.Router();
const { createCuttingMaster, getCuttingMasters, toggleCuttingMasterActive, updateCuttingMaster, reorderCuttingMasters } = require('../controllers/cuttingMasterController');
const { authenticateToken } = require('../middleware/auth');

router.post('/cutting-masters', authenticateToken, createCuttingMaster);
router.get('/cutting-masters', authenticateToken, getCuttingMasters);
// Must precede '/cutting-masters/:id' so "reorder" isn't captured as an id.
router.patch('/cutting-masters/reorder', authenticateToken, reorderCuttingMasters);
router.put('/cutting-masters/:id/toggle-active', authenticateToken, toggleCuttingMasterActive);
router.patch('/cutting-masters/:id', authenticateToken, updateCuttingMaster);

module.exports = router;
