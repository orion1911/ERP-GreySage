const express = require('express');
const router = express.Router();
const { createClient, getClients, toggleClientActive, updateClient } = require('../controllers/clientController');
const { authenticateToken } = require('../middleware/auth');

router.post('/clients', authenticateToken, createClient);
router.get('/clients', authenticateToken, getClients);
router.put('/clients/:id/toggle-active', authenticateToken, toggleClientActive);
router.patch('/clients/:id', authenticateToken, updateClient);

module.exports = router;