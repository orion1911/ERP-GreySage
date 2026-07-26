const express = require('express');
const router = express.Router();
const {
  getLotsAvailable,
  getLotsDamagedAvailable,
  getPendingDispatchList,
  updateLotDamaged,
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

// ─── Authorisation note ──────────────────────────────────────────────────────
// Endpoints that DESTROY or RE-BASE financial records are admin-only. Everyday
// recording (creating a payment, an invoice, a purchase) is deliberately left open
// to any authenticated user, because that is the actual day-to-day job of the staff
// using this system — tightening those would break normal workflow.
//
// If you want stricter separation of duties later, `restrictTo('admin')` is the knob;
// apply it per-line below rather than globally.

router.get('/lots-available', authenticateToken, getLotsAvailable);
router.get('/lots-damaged-available', authenticateToken, getLotsDamagedAvailable);
router.get('/pending-dispatch', authenticateToken, getPendingDispatchList);
router.patch('/lots/:lotId/damaged', authenticateToken, updateLotDamaged);
router.get('/counter', authenticateToken, getInvoiceCounter);
router.put('/counter', authenticateToken, restrictTo('admin'), setInvoiceCounter);
router.get('/', authenticateToken, listInvoices);
router.post('/', authenticateToken, createInvoice);
router.get('/:id', authenticateToken, getInvoiceById);
router.patch('/:id', authenticateToken, updateInvoice);
router.post('/:id/cancel', authenticateToken, cancelInvoice);
router.delete('/:id', authenticateToken, restrictTo('admin'), deleteInvoice);
router.get('/:id/history', authenticateToken, getInvoiceChangeHistory);

module.exports = router;
