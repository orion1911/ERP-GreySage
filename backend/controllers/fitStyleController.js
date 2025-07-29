const { FitStyle } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

const createFitStyle = async (req, res) => {
  const fitStyle = new FitStyle(req.body);
  await fitStyle.save();
  //await logAction(req.user.userId, 'create_fitstyle', 'FitStyle', fitStyle._id, `Created fit style: ${fitStyle.name}`);
  res.status(201).json(fitStyle);
};

const getFitStyles = async (req, res) => {
  const { search, showInactive } = req.query;
  const query = { isActive: showInactive === 'true' ? undefined : true };
  if (search) query.name = { $regex: search, $options: 'i' };
  const fitStyles = await FitStyle.find(query);
  res.json(fitStyles);
};

const toggleFitStyleActive = async (req, res) => {
  const fitStyle = await FitStyle.findById(req.params.id);
  if (!fitStyle) return res.status(404).json({ error: 'FitStyle not found' });

  fitStyle.isActive = !fitStyle.isActive;
  await fitStyle.save();
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
  res.status(200).json(fitStyle);
};

module.exports = { createFitStyle, getFitStyles, toggleFitStyleActive, updateFitStyle };