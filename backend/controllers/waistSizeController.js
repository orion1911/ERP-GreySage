const { WaistSize } = require('../mongodb_schema');
const { getOrSet, bumpVersion, TTL } = require('../services/cache');

// Cache namespace + TTL for the waist-size catalog. Near-static: seeded 26–42 by
// cutting-book-init.js; the only routine write is toggling which sizes are default.
const WAISTSIZES = 'waistsizes';
const WAISTSIZES_TTL = TTL.masters;

const createWaistSize = async (req, res) => {
  const size = parseInt(req.body.size, 10);
  if (isNaN(size)) return res.status(400).json({ error: 'Size must be a number' });
  if (size < 26 || size > 42) return res.status(400).json({ error: 'Size must be between 26 and 42' });

  const waistSize = new WaistSize({ size, isDefault: !!req.body.isDefault });
  await waistSize.save(); // duplicate size → unique-index error, translated by middleware/error.js
  await bumpVersion(WAISTSIZES);
  res.status(201).json(waistSize);
};

const getWaistSizes = async (req, res) => {
  const { showInactive } = req.query;
  const sizes = await getOrSet(WAISTSIZES, [showInactive], WAISTSIZES_TTL, async () => {
    const query = {};
    if (showInactive !== 'true') query.isActive = true;
    return WaistSize.find(query).sort({ size: 1 }); // sizes always list numerically
  });
  res.json(sizes);
};

// Default sizes are pre-selected as the columns of a NEW cutting sheet (the book's usual
// 28–36); non-default active sizes (26, 38, 40, 42) sit in the "add column" pool.
const toggleWaistSizeDefault = async (req, res) => {
  const waistSize = await WaistSize.findById(req.params.id);
  if (!waistSize) return res.status(404).json({ error: 'Waist Size not found' });

  waistSize.isDefault = !waistSize.isDefault;
  await waistSize.save();
  await bumpVersion(WAISTSIZES);
  res.json(waistSize);
};

const toggleWaistSizeActive = async (req, res) => {
  const waistSize = await WaistSize.findById(req.params.id);
  if (!waistSize) return res.status(404).json({ error: 'Waist Size not found' });

  waistSize.isActive = !waistSize.isActive;
  if (!waistSize.isActive) waistSize.isDefault = false; // an inactive size can't be a default
  await waistSize.save();
  await bumpVersion(WAISTSIZES);
  res.json(waistSize);
};

module.exports = { createWaistSize, getWaistSizes, toggleWaistSizeDefault, toggleWaistSizeActive };
