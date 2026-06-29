const express = require('express');
const router = express.Router();
const {
  getTypes,
  updateType,
  getLowStock,
  sendLowStockTest,
  getItems,
  getApplicableItems,
  getFinishingItems,
  createItem,
  updateItem,
  toggleItemActive,
  getPurchases,
  createPurchase,
  updatePurchase,
  setPurchasePaid,
  deletePurchase,
  getPayments,
  addPayment,
  updatePayment,
  deletePayment,
  getPaymentHistory,
  getBalance,
  setOpeningBalance,
  getStock,
  getStockSummary,
  getConsumption
} = require('../controllers/accessoryController');
const { authenticateToken, restrictTo } = require('../middleware/auth');

// Article types
router.get('/types', authenticateToken, getTypes);
router.patch('/types/:id', authenticateToken, restrictTo('admin'), updateType);

// Low-stock alerts
router.get('/low-stock', authenticateToken, getLowStock);
router.post('/low-stock/test', authenticateToken, restrictTo('admin'), sendLowStockTest);

// Masters / lookup items
router.get('/items', authenticateToken, getItems);
router.get('/items/applicable', authenticateToken, getApplicableItems);
router.get('/finishing-items', authenticateToken, getFinishingItems);
router.post('/items', authenticateToken, createItem);
router.patch('/items/:id', authenticateToken, updateItem);
router.put('/items/:id/toggle-active', authenticateToken, toggleItemActive);

// Purchases
router.get('/purchases', authenticateToken, getPurchases);
router.post('/purchases', authenticateToken, createPurchase);
router.patch('/purchases/:id/paid', authenticateToken, setPurchasePaid);
router.patch('/purchases/:id', authenticateToken, updatePurchase);
router.delete('/purchases/:id', authenticateToken, deletePurchase);

// Payments
router.get('/payments', authenticateToken, getPayments);
router.post('/payments', authenticateToken, addPayment);
router.put('/payments/:id', authenticateToken, updatePayment);
router.delete('/payments/:id', authenticateToken, deletePayment);
router.get('/payments/:id/history', authenticateToken, getPaymentHistory);

// Balance / stock / consumption
router.get('/balance', authenticateToken, getBalance);
router.patch('/opening-balance', authenticateToken, setOpeningBalance);
router.get('/stock', authenticateToken, getStock);
router.get('/stock/summary', authenticateToken, getStockSummary);
router.get('/consumption', authenticateToken, getConsumption);

module.exports = router;
