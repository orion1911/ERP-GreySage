const express = require('express');
const router = express.Router();
const {
  getClientsWithBalance,
  getClientLedger,
  getClientBalanceSummary,
  setOpeningBalance,
  addClientPayment,
  addClientAdjustment,
  getClientPaymentEntries,
  updatePaymentEntry,
  deletePaymentEntry,
  getEntryHistory,
  getClientHistory
} = require('../controllers/clientBalanceController');
const { authenticateToken, restrictTo } = require('../middleware/auth');

// ─── Authorisation note ──────────────────────────────────────────────────────
// Endpoints that DESTROY or RE-BASE financial records are admin-only. Everyday
// recording (creating a payment, an invoice, a purchase) is deliberately left open
// to any authenticated user, because that is the actual day-to-day job of the staff
// using this system — tightening those would break normal workflow.
//
// If you want stricter separation of duties later, `restrictTo('admin')` is the knob;
// apply it per-line below rather than globally.

router.get('/clients-with-balance', authenticateToken, getClientsWithBalance);
router.get('/client-invoices-payments', authenticateToken, getClientLedger);
router.get('/client-balance-summary', authenticateToken, getClientBalanceSummary);
router.patch('/opening-balance', authenticateToken, restrictTo('admin'), setOpeningBalance);

router.post('/client-payment', authenticateToken, addClientPayment);
router.post('/client-adjustment', authenticateToken, addClientAdjustment);

router.get('/client-payment-entries', authenticateToken, getClientPaymentEntries);
router.put('/client-payment/:entryId', authenticateToken, updatePaymentEntry);
router.delete('/client-payment/:entryId', authenticateToken, restrictTo('admin'), deletePaymentEntry);

router.get('/client-payment-history/:entryId', authenticateToken, getEntryHistory);
router.get('/client-payment-changes', authenticateToken, getClientHistory);

module.exports = router;
