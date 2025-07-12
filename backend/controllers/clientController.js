const { Client } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

const generateClientCodePrefix = (name) => {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const getNextClientCodeNumber = async () => {
  const lastClient = await Client.findOne()
    .sort({ clientCode: -1 });
  const num = lastClient ? parseInt(lastClient.clientCode.split('-')[1]) + 1 : 100;
  return num;
};

const createClient = async (req, res) => {
  const { name, clientCodePrefix, contact, email, address } = req.body;
  const prefix = clientCodePrefix || generateClientCodePrefix(name);
  const number = await getNextClientCodeNumber();
  const clientCode = `${prefix}-${number}`;
  const client = new Client({ name, clientCode, contact, email, address, isActive: true });
  await client.save();
  //await logAction(req.user.userId, 'create_client', 'Client', client._id, `Created client: ${client.name}`);
  res.status(201).json(client);
};

const getClients = async (req, res) => {
  const { search, showInactive } = req.query;
  const query = { isActive: showInactive === 'true' ? undefined : true };
  if (search) query.name = { $regex: search, $options: 'i' };
  const clients = await Client.find(query);
  res.json(clients);
};

const toggleClientActive = async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.isActive = !client.isActive;
  await client.save();
  //await logAction(req.user.userId, 'toggle_client_active', 'Client', client._id, `Client ${client.name} ${client.isActive ? 'enabled' : 'disabled'}`);
  res.json(client);
};

module.exports = { createClient, getClients, toggleClientActive };