const express = require('express');
const router = express.Router();
const {
  getLotsAvailable,
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
