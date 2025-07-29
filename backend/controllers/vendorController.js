const { FabricVendor, StitchingVendor, WashingVendor, FinishingVendor } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

const createVendor = async (req, res, Model, vendorType) => {
  const vendor = new Model(req.body);
  await vendor.save();
  // await logAction(req.user.userId, `create_${vendorType}_vendor`, vendorType, vendor._id, `Created ${vendorType} vendor: ${vendor.name}`);
  res.status(201).json(vendor);
};

const getVendors = async (req, res, Model) => {
  const { search, showInactive } = req.query;
  const query = { isActive: showInactive === 'true' ? undefined : true };
  if (search) query.name = { $regex: search, $options: 'i' };
  const vendors = await Model.find(query);
  res.json(vendors);
};

const toggleVendorActive = async (req, res, Model, vendorType) => {
  const vendor = await Model.findById(req.params.id);
  if (!vendor) return res.status(404).json({ error: `${vendorType} not found` });

  vendor.isActive = !vendor.isActive;
  await vendor.save();
  // await logAction(req.user.userId, `toggle_${vendorType}_active`, vendorType, vendor._id, `${vendorType} ${vendor.name} ${vendor.isActive ? 'enabled' : 'disabled'}`);
  res.json(vendor);
};

const updateVendor = async (req, res, Model, vendorType) => {
  const vendor = await Model.findById(req.params.id);
  if (!vendor) return res.status(404).json({ error: `${vendorType} not found` });

  const { name, contact, address, isActive } = req.body;
  if (name !== undefined) vendor.name = name;
  if (contact !== undefined) vendor.contact = contact;
  if (address !== undefined) vendor.address = address;
  if (isActive !== undefined) vendor.isActive = isActive;

  await vendor.save();
  // await logAction(req.user.userId, `update_${vendorType}_vendor`, vendorType, vendor._id, `Updated ${vendorType} vendor: ${vendor.name}`);
  res.status(200).json(vendor);
};

const createFabricVendor = async (req, res) => createVendor(req, res, FabricVendor, 'FabricVendor');
const createStitchingVendor = async (req, res) => createVendor(req, res, StitchingVendor, 'StitchingVendor');
const createWashingVendor = async (req, res) => createVendor(req, res, WashingVendor, 'WashingVendor');
const createFinishingVendor = async (req, res) => createVendor(req, res, FinishingVendor, 'FinishingVendor');

const getFabricVendors = async (req, res) => getVendors(req, res, FabricVendor);
const getStitchingVendors = async (req, res) => getVendors(req, res, StitchingVendor);
const getWashingVendors = async (req, res) => getVendors(req, res, WashingVendor);
const getFinishingVendors = async (req, res) => getVendors(req, res, FinishingVendor);

const toggleFabricVendorActive = async (req, res) => toggleVendorActive(req, res, FabricVendor, 'FabricVendor');
const toggleStitchingVendorActive = async (req, res) => toggleVendorActive(req, res, StitchingVendor, 'StitchingVendor');
const toggleWashingVendorActive = async (req, res) => toggleVendorActive(req, res, WashingVendor, 'WashingVendor');
const toggleFinishingVendorActive = async (req, res) => toggleVendorActive(req, res, FinishingVendor, 'FinishingVendor');

const updateFabricVendor = async (req, res) => updateVendor(req, res, FabricVendor, 'FabricVendor');
const updateStitchingVendor = async (req, res) => updateVendor(req, res, StitchingVendor, 'StitchingVendor');
const updateWashingVendor = async (req, res) => updateVendor(req, res, WashingVendor, 'WashingVendor');
const updateFinishingVendor = async (req, res) => updateVendor(req, res, FinishingVendor, 'FinishingVendor');

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
  updateFinishingVendor
};