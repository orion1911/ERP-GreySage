const { FitStyle } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');
const { getOrSet, bumpVersion, TTL } = require('../services/cache');

// Cache namespace + TTL for the fit-style catalog (low write / high read).
const FITSTYLES = 'fitstyles';
const FITSTYLES_TTL = TTL.masters; // env CACHE_TTL_MASTERS; writes bump the version for instant freshness

const createFitStyle = async (req, res) => {
  const fitStyle = new FitStyle(req.body);
  // Place new fit styles at the END of the custom display order (highest sortOrder + 1).
  const lastOrdered = await FitStyle.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  fitStyle.sortOrder = (lastOrdered?.sortOrder ?? -1) + 1;
  await fitStyle.save();
  await bumpVersion(FITSTYLES); // invalidate cached fit-style lists
  //await logAction(req.user.userId, 'create_fitstyle', 'FitStyle', fitStyle._id, `Created fit style: ${fitStyle.name}`);
  res.status(201).json(fitStyle);
};

const getFitStyles = async (req, res) => {
  const { search, showInactive } = req.query;
  // Read-through cache keyed by the two query params that vary the result.
  const fitStyles = await getOrSet(FITSTYLES, [search, showInactive], FITSTYLES_TTL, async () => {
    // Default to active-only; include inactive when the catalog toggle is on.
    const query = {};
    if (showInactive !== 'true') query.isActive = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    // Honour the user-defined display order; fall back to name for ties / legacy rows.
    return FitStyle.find(query).sort({ sortOrder: 1, name: 1 });
  });
  res.json(fitStyles);
};

// Bulk-persist a new display order. Body: { order: [fitStyleId, ...] } in the desired sequence.
const reorderFitStyles = async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of fit style ids' });
  }
  try {
    await FitStyle.bulkWrite(order.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } }
    })));
    await bumpVersion(FITSTYLES); // invalidate cached fit-style lists
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const toggleFitStyleActive = async (req, res) => {
  const fitStyle = await FitStyle.findById(req.params.id);
  if (!fitStyle) return res.status(404).json({ error: 'FitStyle not found' });

  fitStyle.isActive = !fitStyle.isActive;
  await fitStyle.save();
  await bumpVersion(FITSTYLES); // invalidate cached fit-style lists
  //await logAction(req.user.userId, 'toggle_fitstyle_active', 'FitStyle', fitStyle._id, `FitStyle ${fitStyle.name} ${fitStyle.isActive ? 'enabled' : 'disabled'}`);
  res.json(fitStyle);
};

const updateFitStyle = async (req, res) => {
  const fitStyle = await FitStyle.findById(req.params.id);
  if (!fitStyle) return res.status(404).json({ error: 'Fit Style not found' });

  const { name, description, isActive } = req.body;
  if (name !== undefined) fitStyle.name = name;
  if (description !== undefined) fitStyle.description = description;
  if (isActive !== undefined) fitStyle.isActive = isActive;

  await fitStyle.save();
  await bumpVersion(FITSTYLES); // invalidate cached fit-style lists
  res.status(200).json(fitStyle);
};

module.exports = { createFitStyle, getFitStyles, toggleFitStyleActive, updateFitStyle, reorderFitStyles };