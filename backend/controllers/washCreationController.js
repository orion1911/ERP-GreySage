const { WashCreation, WashCreationRate, WashingVendor } = require('../mongodb_schema');
const { getOrSet, bumpVersion, TTL } = require('../services/cache');

// Catalog for wash creations (ICE WASH WISKAR S/SPRAY, …) + the per-vendor rate
// card (WashCreationRate). Same shape/conventions as the vendor catalogs.

const WASH_CREATIONS_TTL = TTL.masters;

const normalizeName = (name) => String(name || '').replace(/\s\s+/g, ' ').trim().toUpperCase();

const createWashCreation = async (req, res) => {
  const name = normalizeName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const exists = await WashCreation.findOne({ name });
  if (exists) return res.status(400).json({ error: `${exists.name} wash creation already exists` });

  const creation = new WashCreation({ name });
  // Place new creations at the END of the custom display order (highest sortOrder + 1).
  const lastOrdered = await WashCreation.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  creation.sortOrder = (lastOrdered?.sortOrder ?? -1) + 1;
  await creation.save();
  await bumpVersion('WashCreation');
  res.status(201).json(creation);
};

const getWashCreations = async (req, res) => {
  const { search, showInactive } = req.query;
  const creations = await getOrSet('WashCreation', [search, showInactive], WASH_CREATIONS_TTL, async () => {
    const query = {};
    if (showInactive !== 'true') query.isActive = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    return WashCreation.find(query).sort({ sortOrder: 1, name: 1 });
  });
  res.json(creations);
};

const reorderWashCreations = async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of ids' });
  }
  try {
    await WashCreation.bulkWrite(order.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } }
    })));
    await bumpVersion('WashCreation');
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const toggleWashCreationActive = async (req, res) => {
  const creation = await WashCreation.findById(req.params.id);
  if (!creation) return res.status(404).json({ error: 'Wash creation not found' });
  creation.isActive = !creation.isActive;
  await creation.save();
  await bumpVersion('WashCreation');
  res.json(creation);
};

const updateWashCreation = async (req, res) => {
  const creation = await WashCreation.findById(req.params.id);
  if (!creation) return res.status(404).json({ error: 'Wash creation not found' });
  if (req.body.name !== undefined) {
    const name = normalizeName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const dup = await WashCreation.findOne({ name, _id: { $ne: creation._id } });
    if (dup) return res.status(400).json({ error: `${dup.name} wash creation already exists` });
    creation.name = name;
  }
  await creation.save();
  await bumpVersion('WashCreation');
  res.json(creation);
};

// ─── Per-vendor rate card ────────────────────────────────────────────────────
// GET /api/wash-creation-rates?vendorId= — every ACTIVE creation with this
// vendor's rate (null = not priced). The UI uses this to render the multi-select
// with per-creation rates and to disable unpriced options.
const getWashCreationRates = async (req, res) => {
  const { vendorId } = req.query;
  if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });
  const vendor = await WashingVendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ error: 'Washing vendor not found' });

  const [creations, rates] = await Promise.all([
    WashCreation.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    WashCreationRate.find({ vendorId }).lean(),
  ]);
  const rateByCreation = new Map(rates.map(r => [String(r.creationId), r.rate]));
  res.json(creations.map(c => ({
    creationId: c._id,
    name: c.name,
    isActive: c.isActive,
    // Unset rates read as 0 (the default) — 0 means "not priced" and blocks a
    // washing entry that selects this creation until it is priced.
    rate: rateByCreation.has(String(c._id)) ? rateByCreation.get(String(c._id)) : 0,
  })));
};

// PUT /api/wash-creation-rates  { vendorId, rates: [{ creationId, rate }] }
// Bulk-save the card. rate 0 / null / blank REMOVES the entry (= "not priced"),
// so a washing entry selecting it is blocked until it is priced again.
const saveWashCreationRates = async (req, res) => {
  const { vendorId, rates } = req.body;
  if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });
  if (!Array.isArray(rates)) return res.status(400).json({ error: 'rates must be an array' });
  const vendor = await WashingVendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ error: 'Washing vendor not found' });

  try {
    const ops = [];
    for (const r of rates) {
      if (!r || !r.creationId) continue;
      const rate = Number(r.rate);
      if (!isFinite(rate) || rate <= 0) {
        ops.push({ deleteOne: { filter: { vendorId, creationId: r.creationId } } });
      } else {
        ops.push({
          updateOne: {
            filter: { vendorId, creationId: r.creationId },
            update: { $set: { rate, updatedAt: new Date() } },
            upsert: true,
          }
        });
      }
    }
    if (ops.length > 0) await WashCreationRate.bulkWrite(ops);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createWashCreation,
  getWashCreations,
  reorderWashCreations,
  toggleWashCreationActive,
  updateWashCreation,
  getWashCreationRates,
  saveWashCreationRates,
};