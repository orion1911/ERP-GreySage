// controllers/finishingController.js
const mongoose = require('mongoose');
const { Finishing, Lot, Order, Washing } = require('../mongodb_schema');
const { recalcFinalQuantity } = require('../services/orderQuantityService');
// const { updateVendorBalance } = require('../services/vendorBalanceService');

const createFinishing = async (req, res) => {
  const { invoiceNumber, orderId, vendorId, quantity, quantityShort, rate, date, finishOutDate, description } = req.body;

  if (!invoiceNumber || !orderId || !vendorId || !quantity || !rate) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  const parsedInvoiceNumber = parseInt(invoiceNumber);
  if (isNaN(parsedInvoiceNumber)) return res.status(400).json({ error: 'Invalid invoice number' });

  const lot = await Lot.findOne({ invoiceNumber: parsedInvoiceNumber, orderId });
  if (!lot) return res.status(400).json({ error: 'Invalid invoice number or order ID' });

  const existing = await Finishing.findOne({ lotId: lot._id });
  if (existing) return res.status(400).json({ error: 'Finishing record already exists for this lot' });

  const washing = await Washing.findOne({ lotId: lot._id });
  if (!washing) return res.status(400).json({ error: 'Washing record not found for this lot' });

  const totalWashQuantity = washing.washDetails.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
  const totalWashShort = washing.washDetails.reduce((sum, item) => sum + parseInt(item.quantityShort || 0), 0);
  const availableQty = totalWashQuantity - totalWashShort;
  if (quantity !== availableQty) {
    return res.status(400).json({ error: `Finishing quantity (${quantity}) must equal available washing quantity (${availableQty}) [wash total: ${totalWashQuantity} - short: ${totalWashShort}]` });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const finishing = new Finishing({
      lotId: lot._id,
      orderId,
      date,
      finishOutDate,
      vendorId,
      quantity,
      quantityShort: quantityShort || 0,
      rate,
      description,
      createdAt: new Date(),
    });

    await finishing.save({ session });

    lot.status = 4;
    lot.statusHistory.push({ status: 4, changedAt: new Date() });
    await lot.save({ session });

    // Update washingOutDate in Washing record if null or empty
    if (!washing.washOutDate) {
      washing.washOutDate = new Date();
      await washing.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Recalculate order's finalTotalQuantity
    await recalcFinalQuantity(orderId);

    const populated = await Finishing.findById(finishing._id).populate('orderId vendorId lotId');
    res.status(201).json(populated);
  } catch (err) {
    if (session) await session.abortTransaction();
    res.status(400).json({ error: err.message });
  } finally {
    if (session) await session.endSession();
  }
};

const updateFinishing = async (req, res) => {
  const { id } = req.params;
  const { vendorId, quantityShort, quantityShortDesc, rate, date, finishOutDate, description, quantity } = req.body;

  const finishing = await Finishing.findById(id);
  if (!finishing) return res.status(404).json({ error: 'Finishing record not found' });

  const washing = await Washing.findOne({ lotId: finishing.lotId._id });
  if (!washing) return res.status(400).json({ error: 'Washing record not found for this lot' });

  const totalWashQuantity = washing.washDetails.reduce((sum, detail) => sum + parseInt(detail.quantity || 0), 0);
  const totalWashShort = washing.washDetails.reduce((sum, detail) => sum + parseInt(detail.quantityShort || 0), 0);
  const availableQty = totalWashQuantity - totalWashShort;
  if (quantity !== undefined && quantity !== availableQty) {
    return res.status(400).json({ error: `Updated quantity (${quantity}) must match available washing quantity (${availableQty}) [wash total: ${totalWashQuantity} - short: ${totalWashShort}]` });
  }

  if (vendorId) finishing.vendorId = vendorId;
  if (rate !== undefined) finishing.rate = rate;
  if (date) finishing.date = date;
  // Update only in case if finishing.finishOutDate already marked i.e., marked as completed yet still need to update the date
  if (finishOutDate && finishing.finishOutDate) finishing.finishOutDate = finishOutDate;

  if (description) finishing.description = description;
  if (quantity !== undefined) finishing.quantity = quantity;
  if (quantityShort !== undefined) finishing.quantityShort = quantityShort;
  if (quantityShortDesc) finishing.quantityShortDesc = quantityShortDesc;

  try {
    await finishing.save();

    // Recalculate order's finalTotalQuantity
    await recalcFinalQuantity(finishing.orderId._id || finishing.orderId);

    const populated = await Finishing.findById(id).populate('lotId orderId vendorId');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const updateFinishingStatus = async (req, res) => {
  const { finishOutDate } = req.body;

  const finishing = await Finishing.findById(req.params.id);
  if (!finishing) return res.status(404).json({ error: 'Finishing record not found' });

  const lot = await Lot.findById(finishing.lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    // const finishing = await Finishing.findByIdAndUpdate(
    //   req.params.id,
    //   { finishOutDate },
    //   { new: true }
    // );
    finishing.finishOutDate = finishOutDate;
    await finishing.save({ session });

    lot.status = 5;
    lot.statusHistory.push({ status: 5, changedAt: new Date() });
    await lot.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populated = await Finishing.findById(finishing._id).populate('orderId vendorId lotId');
    res.status(201).json(populated);

  } catch (err) {
    if (session) await session.abortTransaction();
    res.status(400).json({ error: err.message });
  } finally {
    if (session) await session.endSession();
  }
};

const getFinishing = async (req, res) => {
  const { search, lotId, invoiceNumber } = req.query;
  try {
    let query = {};
    if (search) {
      query.lotId = {
        $in: await Lot.find({ lotNumber: { $regex: search, $options: 'i' } }).distinct('_id'),
      };
    } else if (lotId) {
      query.lotId = lotId;
    } else if (invoiceNumber) {
      const parsed = parseInt(invoiceNumber);
      if (isNaN(parsed)) return res.status(400).json({ error: 'Invalid invoice number' });
      query.lotId = {
        $in: await Lot.find({ invoiceNumber: parsed }).distinct('_id'),
      };
    }
    const records = await Finishing.find(query).populate('orderId vendorId lotId');
    res.json(records);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  createFinishing,
  updateFinishing,
  updateFinishingStatus,
  getFinishing,
};
