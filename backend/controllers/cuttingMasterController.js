const { CuttingMaster } = require('../mongodb_schema');
const { getOrSet, bumpVersion, TTL } = require('../services/cache');

// Cache namespace + TTL for the cutting-master catalog (low write / high read).
const CUTTINGMASTERS = 'cuttingmasters';
const CUTTINGMASTERS_TTL = TTL.masters; // env CACHE_TTL_MASTERS; writes bump the version for instant freshness

const createCuttingMaster = async (req, res) => {
  const master = new CuttingMaster(req.body);
  // Place new masters at the END of the custom display order (highest sortOrder + 1).
  const lastOrdered = await CuttingMaster.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  master.sortOrder = (lastOrdered?.sortOrder ?? -1) + 1;
  await master.save();
  await bumpVersion(CUTTINGMASTERS); // invalidate cached cutting-master lists
  res.status(201).json(master);
};

const getCuttingMasters = async (req, res) => {
  const { search, showInactive } = req.query;
  // Read-through cache keyed by the two query params that vary the result.
  const masters = await getOrSet(CUTTINGMASTERS, [search, showInactive], CUTTINGMASTERS_TTL, async () => {
    // Default to active-only; include inactive when the catalog toggle is on.
    const query = {};
    if (showInactive !== 'true') query.isActive = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    // Honour the user-defined display order; fall back to name for ties / legacy rows.
    return CuttingMaster.find(query).sort({ sortOrder: 1, name: 1 });
  });
  res.json(masters);
};

// Bulk-persist a new display order. Body: { order: [cuttingMasterId, ...] } in the desired sequence.
const reorderCuttingMasters = async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of cutting master ids' });
  }
  try {
    await CuttingMaster.bulkWrite(order.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } }
    })));
    await bumpVersion(CUTTINGMASTERS); // invalidate cached cutting-master lists
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const toggleCuttingMasterActive = async (req, res) => {
  const master = await CuttingMaster.findById(req.params.id);
  if (!master) return res.status(404).json({ error: 'Cutting Master not found' });

  master.isActive = !master.isActive;
  await master.save();
  await bumpVersion(CUTTINGMASTERS); // invalidate cached cutting-master lists
  res.json(master);
};

const updateCuttingMaster = async (req, res) => {
  const master = await CuttingMaster.findById(req.params.id);
  if (!master) return res.status(404).json({ error: 'Cutting Master not found' });

  const { name, isActive } = req.body;
  if (name !== undefined) master.name = name;
  if (isActive !== undefined) master.isActive = isActive;

  await master.save();
  await bumpVersion(CUTTINGMASTERS); // invalidate cached cutting-master lists
  res.status(200).json(master);
};

module.exports = { createCuttingMaster, getCuttingMasters, toggleCuttingMasterActive, updateCuttingMaster, reorderCuttingMasters };
