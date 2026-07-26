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
  deletePaymentEntry,
  getPaymentEntryChangeHistory,
  getVendorPaymentChangeHistory,
  markLotPaid,
  exportLotsToExcel,
  exportPaymentsToExcel
} = require('../controllers/vendorBalanceController');
const { authenticateToken, restrictTo } = require('../middleware/auth');

// Get all vendors by type with their balances
// ─── Authorisation note ──────────────────────────────────────────────────────
// Endpoints that DESTROY or RE-BASE financial records are admin-only. Everyday
// recording (creating a payment, an invoice, a purchase) is deliberately left open
// to any authenticated user, because that is the actual day-to-day job of the staff
// using this system — tightening those would break normal workflow.
//
// If you want stricter separation of duties later, `restrictTo('admin')` is the knob;
// apply it per-line below rather than globally.

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

// Get payment history for a specific entry
router.get('/vendor-payment-history/:entryId', authenticateToken, getPaymentEntryChangeHistory);

// Get all payment changes for a vendor
router.get('/vendor-payment-changes', authenticateToken, getVendorPaymentChangeHistory);
// Export lots data to Excel
router.get('/export-lots-excel', authenticateToken, exportLotsToExcel);

// Export payment entries to Excel
router.get('/export-payments-excel', authenticateToken, exportPaymentsToExcel);
// Update a payment entry
router.put('/vendor-payment/:entryId', authenticateToken, updatePaymentEntry);

// Delete a payment entry
router.delete('/vendor-payment/:entryId', authenticateToken, restrictTo('admin'), deletePaymentEntry);

// Mark a lot (production record) paid/unpaid for a vendor
router.patch('/lot-paid', authenticateToken, markLotPaid);

module.exports = router;