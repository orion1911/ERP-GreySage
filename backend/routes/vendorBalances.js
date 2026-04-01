const express = require('express');
const router = express.Router();
const { 
  getVendorsByType,
  getVendorLotsWithPayments,
  addVendorPayment,
  addShortAdjustment,
  getVendorPaymentEntries,
  getVendorBalanceSummary,
  updatePaymentEntry,
  deletePaymentEntry
} = require('../controllers/vendorBalanceController');
const { authenticateToken } = require('../middleware/auth');

// Get all vendors by type with their balances
router.get('/vendors-by-type', authenticateToken, getVendorsByType);

// Get vendor lots with amounts and payments (main dashboard data)
router.get('/vendor-lots-details', authenticateToken, getVendorLotsWithPayments);

// Record a direct payment
router.post('/vendor-payment', authenticateToken, addVendorPayment);

// Record short adjustment (adjusted as payment)
router.post('/short-adjustment', authenticateToken, addShortAdjustment);

// Get all payment entries for a vendor
router.get('/vendor-payment-entries', authenticateToken, getVendorPaymentEntries);

// Get vendor balance summary
router.get('/vendor-balance-summary', authenticateToken, getVendorBalanceSummary);

// Update a payment entry
router.put('/vendor-payment/:entryId', authenticateToken, updatePaymentEntry);

// Delete a payment entry
router.delete('/vendor-payment/:entryId', authenticateToken, deletePaymentEntry);

module.exports = router;