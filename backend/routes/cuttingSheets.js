const express = require('express');
const router = express.Router();
const {
  getCuttingSheets, getNextLotNo, checkLotNumber, getAvailableLots, getCutLots, getLeftovers,
  createCuttingSheet, updateCuttingSheet, deleteCuttingSheet
} = require('../controllers/cuttingSheetController');
const { authenticateToken } = require('../middleware/auth');

// Specific paths must stay above '/cutting-sheets/:id' or Express swallows them.
router.get('/cutting-sheets/next-lot-no', authenticateToken, getNextLotNo);
router.get('/cutting-sheets/check-lot', authenticateToken, checkLotNumber);
router.get('/cutting-sheets/available-lots', authenticateToken, getAvailableLots);
router.get('/cutting-sheets/cut-lots', authenticateToken, getCutLots);
router.get('/cutting-sheets/leftovers', authenticateToken, getLeftovers);
router.get('/cutting-sheets', authenticateToken, getCuttingSheets);
router.post('/cutting-sheets', authenticateToken, createCuttingSheet);
router.patch('/cutting-sheets/:id', authenticateToken, updateCuttingSheet);
router.delete('/cutting-sheets/:id', authenticateToken, deleteCuttingSheet);

module.exports = router;
