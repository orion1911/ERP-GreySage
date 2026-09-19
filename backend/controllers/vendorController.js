const { FabricVendor, StitchingVendor, WashingVendor, FinishingVendor } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');
const { getOrSet, bumpVersion, TTL } = require('../services/cache');

// Each vendor type is its own cache namespace (keyed by vendorType, e.g. 'FabricVendor').
const VENDORS_TTL = TTL.masters; // env CACHE_TTL_MASTERS; writes bump the version for instant freshness

const createVendor = async (req, res, Model, vendorType) => {
  
  const name = req.body.name;
  const normalizedName = name.replace(/\s\s+/g, ' ').trim();

  // Construct a regex to match the normalized term, allowing for any amount of whitespace
  // between characters in the stored field
  const regex = new RegExp(normalizedName.split('').join('\\s*'), 'i'); // 'i' for case-insensitive
  const vendorExist = await Model.findOne({ name: { $regex: regex } });
  if (vendorExist) return res.status(400).json({ error: `${vendorExist.name} vendor already exists` });

  const vendor = new Model(req.body);
  // Place new vendors at the END of the custom display order (highest sortOrder + 1).
  const lastOrdered = await Model.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  vendor.sortOrder = (lastOrdered?.sortOrder ?? -1) + 1;
  await vendor.save();
  await bumpVersion(vendorType); // invalidate cached lists for this vendor type
  // await logAction(req.user.userId, `create_${vendorType}_vendor`, vendorType, vendor._id, `Created ${vendorType} vendor: ${vendor.name}`);
  res.status(201).json(vendor);
};

const getVendors = async (req, res, Model, vendorType) => {
  const { search, showInactive } = req.query;
  // Read-through cache keyed by the two query params that vary the result.
  const vendors = await getOrSet(vendorType, [search, showInactive], VENDORS_TTL, async () => {
    // Default to active-only; include inactive (alongside active) when the catalog toggle is on.
    const query = {};
    if (showInactive !== 'true') query.isActive = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    // Honour the user-defined display order; fall back to name for ties / legacy rows.
    return Model.find(query).sort({ sortOrder: 1, name: 1 });
  });
  res.json(vendors);
};

// Bulk-persist a new display order. Body: { order: [vendorId, ...] } in the desired sequence.
const reorderVendors = async (req, res, Model, vendorType) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of vendor ids' });
  }
  try {
    await Model.bulkWrite(order.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } }
    })));
    await bumpVersion(vendorType); // invalidate cached lists for this vendor type
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const toggleVendorActive = async (req, res, Model, vendorType) => {
  const vendor = await Model.findById(req.params.id);
  if (!vendor) return res.status(404).json({ error: `${vendorType} not found` });

  vendor.isActive = !vendor.isActive;
  await vendor.save();
  await bumpVersion(vendorType); // invalidate cached lists for this vendor type
  // await logAction(req.user.userId, `toggle_${vendorType}_active`, vendorType, vendor._id, `${vendorType} ${vendor.name} ${vendor.isActive ? 'enabled' : 'disabled'}`);
  res.json(vendor);
};

const updateVendor = async (req, res, Model, vendorType) => {
  const vendor = await Model.findById(req.params.id);
  if (!vendor) return res.status(404).json({ error: `${vendorType} not found` });

  const { name, contact, address, isActive, defaultRate } = req.body;
  if (name !== undefined) vendor.name = name;
  if (contact !== undefined) vendor.contact = contact;
  if (address !== undefined) vendor.address = address;
  if (defaultRate !== undefined) vendor.defaultRate = defaultRate;
  if (isActive !== undefined) vendor.isActive = isActive;

  await vendor.save();
  await bumpVersion(vendorType); // invalidate cached lists for this vendor type
  // await logAction(req.user.userId, `update_${vendorType}_vendor`, vendorType, vendor._id, `Updated ${vendorType} vendor: ${vendor.name}`);
  res.status(200).json(vendor);
};

const createFabricVendor = async (req, res) => createVendor(req, res, FabricVendor, 'FabricVendor');
const createStitchingVendor = async (req, res) => createVendor(req, res, StitchingVendor, 'StitchingVendor');
const createWashingVendor = async (req, res) => createVendor(req, res, WashingVendor, 'WashingVendor');
const createFinishingVendor = async (req, res) => createVendor(req, res, FinishingVendor, 'FinishingVendor');

const getFabricVendors = async (req, res) => getVendors(req, res, FabricVendor, 'FabricVendor');
const getStitchingVendors = async (req, res) => getVendors(req, res, StitchingVendor, 'StitchingVendor');
const getWashingVendors = async (req, res) => getVendors(req, res, WashingVendor, 'WashingVendor');
const getFinishingVendors = async (req, res) => getVendors(req, res, FinishingVendor, 'FinishingVendor');

const toggleFabricVendorActive = async (req, res) => toggleVendorActive(req, res, FabricVendor, 'FabricVendor');
const toggleStitchingVendorActive = async (req, res) => toggleVendorActive(req, res, StitchingVendor, 'StitchingVendor');
const toggleWashingVendorActive = async (req, res) => toggleVendorActive(req, res, WashingVendor, 'WashingVendor');
const toggleFinishingVendorActive = async (req, res) => toggleVendorActive(req, res, FinishingVendor, 'FinishingVendor');

const updateFabricVendor = async (req, res) => updateVendor(req, res, FabricVendor, 'FabricVendor');
const updateStitchingVendor = async (req, res) => updateVendor(req, res, StitchingVendor, 'StitchingVendor');
const updateWashingVendor = async (req, res) => updateVendor(req, res, WashingVendor, 'WashingVendor');
const updateFinishingVendor = async (req, res) => updateVendor(req, res, FinishingVendor, 'FinishingVendor');

const reorderFabricVendors = async (req, res) => reorderVendors(req, res, FabricVendor, 'FabricVendor');
const reorderStitchingVendors = async (req, res) => reorderVendors(req, res, StitchingVendor, 'StitchingVendor');
const reorderWashingVendors = async (req, res) => reorderVendors(req, res, WashingVendor, 'WashingVendor');
const reorderFinishingVendors = async (req, res) => reorderVendors(req, res, FinishingVendor, 'FinishingVendor');

module.exports = {
  createFabricVendor,
  createStitchingVendor,
  createWashingVendor,
  createFinishingVendor,
  getFabricVendors,
  getStitchingVendors,
  getWashingVendors,
  getFinishingVendors,
  toggleFabricVendorActive,
  toggleStitchingVendorActive,
  toggleWashingVendorActive,
  toggleFinishingVendorActive,
  updateFabricVendor,
  updateStitchingVendor,
  updateWashingVendor,
  updateFinishingVendor,
  reorderFabricVendors,
  reorderStitchingVendors,
  reorderWashingVendors,
  reorderFinishingVendors
};