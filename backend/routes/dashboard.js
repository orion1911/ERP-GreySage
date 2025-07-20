const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getOrdersByStatus, getOrderStatusSummary, getAllClientCompletedQuantities, getProductionStages, getInvoiceStatus, getVendorPerformance, getAuditLog, getTopFitStyles } = require('../controllers/dashboardController');

// Role-based access middleware
const checkRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};

router.get('/dashboard/orders/status', authenticateToken, getOrdersByStatus);
router.get('/dashboard/orders/status-summary', authenticateToken, getOrderStatusSummary);
router.get('/dashboard/orders/status-summary-clients', authenticateToken, getAllClientCompletedQuantities);
router.get('/dashboard/production/stages', authenticateToken, getProductionStages);
router.get('/dashboard/financial/invoices', authenticateToken, getInvoiceStatus);
router.get('/dashboard/vendors/performance', authenticateToken, checkRole(['admin']), getVendorPerformance);
router.get('/dashboard/audit/log', authenticateToken, checkRole(['admin']), getAuditLog);
router.get('/dashboard/fitstyles/top', authenticateToken, getTopFitStyles);

module.exports = router;