const { Client } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');
const { getOrSet, bumpVersion, TTL } = require('../services/cache');

// Cache namespace + TTL for the client catalog (low write / high read).
const CLIENTS = 'clients';
const CLIENTS_TTL = TTL.masters; // env CACHE_TTL_MASTERS; writes bump the version for instant freshness

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
  // Place new clients at the END of the custom display order (highest sortOrder + 1).
  const lastOrdered = await Client.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  const sortOrder = (lastOrdered?.sortOrder ?? -1) + 1;
  const client = new Client({
    name, clientCode, billingName, contact, email, address,
    gstin, pan,
    billingAddress: billingAddress || {},
    shippingAddress: shippingAddress || {},
    billingFirms: billingFirms || [],
    sortOrder,
    isActive: true
  });
  await client.save();
  await bumpVersion(CLIENTS); // invalidate cached client lists
  //await logAction(req.user.userId, 'create_client', 'Client', client._id, `Created client: ${client.name}`);
  res.status(201).json(client);
};

const getClients = async (req, res) => {
  const { search, showInactive } = req.query;
  // Read-through cache keyed by the two query params that vary the result.
  const clients = await getOrSet(CLIENTS, [search, showInactive], CLIENTS_TTL, async () => {
    // Default to active-only; include inactive (alongside active) when the catalog toggle is on.
    const query = {};
    if (showInactive !== 'true') query.isActive = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    // Honour the user-defined display order; fall back to name for ties / legacy rows.
    return Client.find(query).sort({ sortOrder: 1, name: 1 });
  });
  res.json(clients);
};

// Bulk-persist a new display order. Body: { order: [clientId, ...] } in the desired sequence.
const reorderClients = async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of client ids' });
  }
  try {
    await Client.bulkWrite(order.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } }
    })));
    await bumpVersion(CLIENTS); // invalidate cached client lists
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const toggleClientActive = async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.isActive = !client.isActive;
  await client.save();
  await bumpVersion(CLIENTS); // invalidate cached client lists
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
  await bumpVersion(CLIENTS); // invalidate cached client lists
  //await logAction(req.user.userId, 'update_client', 'Client', client._id, `Updated client: ${client.name}`);
  res.json(client);
};

module.exports = { createClient, getClients, toggleClientActive, updateClient, reorderClients };