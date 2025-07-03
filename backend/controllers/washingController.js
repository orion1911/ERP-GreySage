const { Washing, Lot, Order, Stitching } = require('../mongodb_schema');
const { updateVendorBalance } = require('../services/vendorBalanceService');
// const { logAction } = require('../utils/logger');

const createWashing = async (req, res) => {
  const { invoiceNumber, orderId, vendorId, quantityShort, rate, date, washOutDate, description, washDetails } = req.body;

  try {
    // Validate required fields
    if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
    if (!orderId) return res.status(400).json({ error: 'Order ID is required' });
    if (!vendorId) return res.status(400).json({ error: 'Vendor ID is required' });
    if (!washDetails || !Array.isArray(washDetails) || washDetails.length === 0) {
      return res.status(400).json({ error: 'washDetails must be a non-empty array' });
    }

    // Validate invoiceNumber as a number
    const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
    if (isNaN(parsedInvoiceNumber)) {
      return res.status(400).json({ error: 'Invoice number must be a valid number' });
    }

    // Validate invoiceNumber and orderId
    const lot = await Lot.findOne({ invoiceNumber: parsedInvoiceNumber, orderId });
    if (!lot) {
      return res.status(400).json({ error: 'Invalid invoiceNumber or orderId' });
    }

    // Validate existing washing entry against each lot
    const existingWashing = await Washing.findOne({ lotId: lot._id });
    if (existingWashing) {
      return res.status(404).json({ error: 'Washing record already exists for this lot' });
    }

    // Validate washDetails quantities against StitchingSchema quantity
    const stitching = await Stitching.findOne({ lotId: lot._id });
    if (!stitching) {
      return res.status(404).json({ error: 'Stitching record not found for this lot' });
    }

    const totalWashQuantity = washDetails.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
    if (totalWashQuantity !== stitching.quantity) {
      return res.status(400).json({ error: `Total quantity in washDetails (${totalWashQuantity}) must equal the stitching quantity (${stitching.quantity})` });
    }

    const washing = new Washing({
      lotId: lot._id,
      orderId,
      date: date,
      washOutDate,
      vendorId,
      washDetails,
      quantityShort: quantityShort || 0,
      rate,
      description,
      createdAt: new Date(),
    });

    await washing.save();

    // Update the Order status to 3 (Order in Washing)
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status < 3) {
      order.status = 3;
      order.statusHistory.push({ status: 3, changedAt: new Date() });
      await order.save();
    }

    // await updateVendorBalance(vendorId, 'washing', lot._id, orderId, totalWashQuantity, rate);
    // await logAction(req.user.userId, 'create_washing', 'Washing', washing._id, `Lot with invoice ${parsedInvoiceNumber} washed`);

    res.status(201).json(washing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateWashing = async (req, res) => {
  const { id } = req.params;
  const { vendorId, quantityShort, rate, date, washOutDate, description, washDetails } = req.body;

  // Find the washing record
  const washing = await Washing.findById(id).populate('lotId orderId vendorId');
  if (!washing) return res.status(404).json({ error: 'Washing record not found' });

  // Validate references
  const stitching = await Stitching.findOne({ lotId: washing.lotId._id });
  if (!stitching) return res.status(404).json({ error: 'Stitching record not found' });

  if (vendorId) {
    // Assuming vendorId is a valid reference; add validation if needed
    // const vendor = await Vendor.findById(vendorId); // Uncomment and implement if Vendor schema exists
    // if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  }

  // Validate washDetails quantities
  if (washDetails) {
    const totalWashQuantity = washDetails.reduce((sum, detail) => sum + parseInt(detail.quantity || 0), 0);
    if (totalWashQuantity !== stitching.quantity) {
      return res.status(400).json({ error: `Total quantity in washDetails (${totalWashQuantity}) must equal the stitching quantity (${stitching.quantity})` });
    }
  }

  // Update fields
  if (vendorId) washing.vendorId = vendorId;
  if (quantityShort !== undefined) washing.quantityShort = quantityShort;
  if (rate !== undefined) washing.rate = rate;
  if (date) washing.date = date;
  if (washOutDate) washing.washOutDate = washOutDate;
  if (description) washing.description = description;
  if (washDetails) washing.washDetails = washDetails;

  try {
    const updatedWashing = await washing.save();
    const populatedWashing = await Washing.findById(id).populate('lotId orderId vendorId');
    // await logAction(req.user.userId, 'update_washing', 'Washing', updatedWashing._id, 'Washing record updated');
    res.json(populatedWashing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateWashingStatus = async (req, res) => {
  const { washOutDate } = req.body;
  try {
    const washing = await Washing.findByIdAndUpdate(req.params.id, { washOutDate }, { new: true });
    if (!washing) return res.status(404).json({ error: 'Washing record not found' });
    // await logAction(req.user.userId, 'update_washing', 'Washing', washing._id, 'Wash out date updated');
    res.json(washing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getWashing = async (req, res) => {
  const { search, lotId, invoiceNumber } = req.query;
  try {
    let query = {};
    if (search) {
      query.lotId = { $in: await Lot.find({ lotNumber: { $regex: search, $options: 'i' } }).distinct('_id') };
    } else if (lotId) {
      query.lotId = lotId;
    } else if (invoiceNumber) {
      const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
      if (isNaN(parsedInvoiceNumber)) {
        return res.status(400).json({ error: 'Invoice number must be a valid number' });
      }
      query.lotId = { $in: await Lot.find({ invoiceNumber: parsedInvoiceNumber }).distinct('_id') };
    }
    const washingRecords = await Washing.find(query).populate('orderId vendorId lotId');
    res.json(washingRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { createWashing, updateWashing, updateWashingStatus, getWashing };