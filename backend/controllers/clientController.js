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
  const { name, clientCodePrefix, billingName, contact, email, address, gstin, pan, billingAddress, shippingAddress, billingFirms } = req.body;

  const normalizedName = name.replace(/\s\s+/g, ' ').trim();

  // Construct a regex to match the normalized term, allowing for any amount of whitespace
  // between characters in the stored field
  const regex = new RegExp(normalizedName.split('').join('\\s*'), 'i'); // 'i' for case-insensitive
  const clientExist = await Client.findOne({ name: { $regex: regex } });
  if (clientExist) return res.status(400).json({ error: `${clientExist.name} client already exists` });

  const prefix = clientCodePrefix || generateClientCodePrefix(name);
  const number = await getNextClientCodeNumber();
  const clientCode = `${prefix}-${number}`;
  const client = new Client({
    name, clientCode, billingName, contact, email, address,
    gstin, pan,
    billingAddress: billingAddress || {},
    shippingAddress: shippingAddress || {},
    billingFirms: billingFirms || [],
    isActive: true
  });
  await client.save();
  //await logAction(req.user.userId, 'create_client', 'Client', client._id, `Created client: ${client.name}`);
  res.status(201).json(client);
};

const getClients = async (req, res) => {
  const { search, showInactive } = req.query;
  const query = { isActive: showInactive === 'true' ? false : true };
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

const updateClient = async (req, res) => {
  const { id } = req.params;
  const { name, clientCode, billingName, contact, email, address, gstin, pan, billingAddress, shippingAddress, billingFirms } = req.body;

  const client = await Client.findById(id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.name = name || client.name;
  client.clientCode = clientCode || client.clientCode;
  // Optional fields: use `!== undefined` so they can be cleared to blank (a `|| existing`
  // fallback makes them un-blankable). name/clientCode keep the guard (required).
  if (contact !== undefined) client.contact = contact;
  if (email !== undefined) client.email = email;
  if (address !== undefined) client.address = address;
  if (billingName !== undefined) client.billingName = billingName;
  if (gstin !== undefined) client.gstin = gstin;
  if (pan !== undefined) client.pan = pan;
  if (billingAddress !== undefined) client.billingAddress = billingAddress;
  if (shippingAddress !== undefined) client.shippingAddress = shippingAddress;
  if (billingFirms !== undefined) client.billingFirms = billingFirms;

  await client.save();
  //await logAction(req.user.userId, 'update_client', 'Client', client._id, `Updated client: ${client.name}`);
  res.json(client);
};

module.exports = { createClient, getClients, toggleClientActive, updateClient };