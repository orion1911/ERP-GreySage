const express = require('express');
const router = express.Router();
const {
  createFabricVendor,
  createStitchingVendor,
  createWashingVendor,
  createFinishingVendor,
  getFabricVendors,
  getStitchingVendors,
  getWashingVendors,
  getFinishingVendors,
  toggleFabricVendorActive,
  toggleStitchingVendorActive,
  toggleWashingVendorActive,
  toggleFinishingVendorActive,
  updateFabricVendor,
  updateStitchingVendor,
  updateWashingVendor,
  updateFinishingVendor
} = require('../controllers/vendorController');
const { authenticateToken } = require('../middleware/auth');

router.post('/fabric-vendors', authenticateToken, createFabricVendor);
router.post('/stitching-vendors', authenticateToken, createStitchingVendor);
router.post('/washing-vendors', authenticateToken, createWashingVendor);
router.post('/finishing-vendors', authenticateToken, createFinishingVendor);
router.get('/fabric-vendors', authenticateToken, getFabricVendors);
router.get('/stitching-vendors', authenticateToken, getStitchingVendors);
router.get('/washing-vendors', authenticateToken, getWashingVendors);
router.get('/finishing-vendors', authenticateToken, getFinishingVendors);
router.put('/fabric-vendors/:id/toggle-active', authenticateToken, toggleFabricVendorActive);
router.put('/stitching-vendors/:id/toggle-active', authenticateToken, toggleStitchingVendorActive);
router.put('/washing-vendors/:id/toggle-active', authenticateToken, toggleWashingVendorActive);
router.put('/finishing-vendors/:id/toggle-active', authenticateToken, toggleFinishingVendorActive);
router.patch('/fabric-vendors/:id', authenticateToken, updateFabricVendor);
router.patch('/stitching-vendors/:id', authenticateToken, updateStitchingVendor);
router.patch('/washing-vendors/:id', authenticateToken, updateWashingVendor);
router.patch('/finishing-vendors/:id', authenticateToken, updateFinishingVendor);

module.exports = router;