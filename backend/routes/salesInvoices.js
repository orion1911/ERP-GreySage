const express = require('express');
const router = express.Router();
const {
  getLotsAvailable,
  getLotsDamagedAvailable,
  getPendingDispatchList,
  updateLotDamaged,
  getManualDispatchForLot,
  createManualDispatch,
  updateManualDispatch,
  deleteManualDispatch,
  createInvoice,
  updateInvoice,
  cancelInvoice,
  deleteInvoice,
  listInvoices,
  getInvoiceById,
  getInvoiceChangeHistory,
  getInvoiceCounter,
  setInvoiceCounter
} = require('../controllers/salesInvoiceController');
const { authenticateToken, restrictTo } = require('../middleware/auth');

router.get('/lots-available', authenticateToken, getLotsAvailable);
router.get('/lots-damaged-available', authenticateToken, getLotsDamagedAvailable);
router.get('/pending-dispatch', authenticateToken, getPendingDispatchList);
router.patch('/lots/:lotId/damaged', authenticateToken, updateLotDamaged);

// ─── Manual dispatch (legacy lots) ───────────────────────────────────────────
// MUST stay above the '/:id' routes below — Express matches in declaration order, so
// '/manual-dispatch/xyz' would otherwise be swallowed by GET '/:id'.
router.get('/manual-dispatch/:lotId', authenticateToken, getManualDispatchForLot);
router.post('/manual-dispatch', authenticateToken, createManualDispatch);
router.put('/manual-dispatch/:id', authenticateToken, updateManualDispatch);
router.delete('/manual-dispatch/:id', authenticateToken, deleteManualDispatch);
router.get('/counter', authenticateToken, getInvoiceCounter);
router.put('/counter', authenticateToken, restrictTo('admin'), setInvoiceCounter);
router.get('/', authenticateToken, listInvoices);
router.post('/', authenticateToken, createInvoice);
router.get('/:id', authenticateToken, getInvoiceById);
router.patch('/:id', authenticateToken, updateInvoice);
router.post('/:id/cancel', authenticateToken, cancelInvoice);
router.delete('/:id', authenticateToken, deleteInvoice);
router.get('/:id/history', authenticateToken, getInvoiceChangeHistory);

module.exports = router;
