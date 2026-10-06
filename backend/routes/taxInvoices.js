const express = require('express');
const router = express.Router();
const {
  previewTaxInvoice,
  createTaxInvoice,
  getTaxInvoiceById,
  updateTaxInvoice,
  cancelTaxInvoice,
  deleteTaxInvoice,
  getTaxInvoiceHistory
} = require('../controllers/taxInvoiceController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Listing is shared with Bills of Supply: GET /api/sales-invoices?documentType=TAX_INVOICE|ALL
router.post('/preview', authenticateToken, previewTaxInvoice); // must stay above '/:id'
router.post('/', authenticateToken, createTaxInvoice);
router.get('/:id', authenticateToken, getTaxInvoiceById);
router.get('/:id/history', authenticateToken, getTaxInvoiceHistory);
router.patch('/:id', requireAdmin, updateTaxInvoice);
router.post('/:id/cancel', requireAdmin, cancelTaxInvoice);
router.delete('/:id', requireAdmin, deleteTaxInvoice);

module.exports = router;
