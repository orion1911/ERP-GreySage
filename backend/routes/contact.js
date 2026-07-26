const express = require('express');
const router = express.Router();
const { sendEmail } = require('../controllers/contactController');
const { contactLimiter } = require('../middleware/rateLimit');

// Deliberately anonymous — this is the public marketing site's contact form.
// Rate limited because it is unauthenticated and spends our Brevo send quota.
router.post('/contact', contactLimiter, sendEmail);

module.exports = router;
