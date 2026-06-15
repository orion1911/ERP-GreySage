const express = require('express');
const router = express.Router();
const { createClient, getClients, toggleClientActive, updateClient, reorderClients } = require('../controllers/clientController');
const { authenticateToken } = require('../middleware/auth');

router.post('/clients', authenticateToken, createClient);
router.get('/clients', authenticateToken, getClients);
// Reorder must precede '/clients/:id' so 'reorder' isn't captured as an :id.
router.patch('/clients/reorder', authenticateToken, reorderClients);
router.put('/clients/:id/toggle-active', authenticateToken, toggleClientActive);
router.patch('/clients/:id', authenticateToken, updateClient);

module.exports = router;