const express = require('express');
const router = express.Router();
const { sendEmail } = require('../controllers/contactController');
// const { authenticateToken } = require('../middleware/auth'); Anonymous access

router.post('/contact', sendEmail);

module.exports = router;