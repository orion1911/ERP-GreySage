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
const { authenticateToken } = require('../middleware/auth');

router.get('/clients-with-balance', authenticateToken, getClientsWithBalance);
router.get('/client-invoices-payments', authenticateToken, getClientLedger);
router.get('/client-balance-summary', authenticateToken, getClientBalanceSummary);
router.patch('/opening-balance', authenticateToken, setOpeningBalance);

router.post('/client-payment', authenticateToken, addClientPayment);
router.post('/client-adjustment', authenticateToken, addClientAdjustment);

router.get('/client-payment-entries', authenticateToken, getClientPaymentEntries);
router.put('/client-payment/:entryId', authenticateToken, updatePaymentEntry);
router.delete('/client-payment/:entryId', authenticateToken, deletePaymentEntry);

router.get('/client-payment-history/:entryId', authenticateToken, getEntryHistory);
router.get('/client-payment-changes', authenticateToken, getClientHistory);

module.exports = router;
