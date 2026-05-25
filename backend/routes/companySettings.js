const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/companySettingsController');
const { authenticateToken, restrictTo } = require('../middleware/auth');

router.get('/', authenticateToken, getSettings);
router.put('/', authenticateToken, restrictTo('admin'), updateSettings);

module.exports = router;
