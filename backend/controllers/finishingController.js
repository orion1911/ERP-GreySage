const mongoose = require('mongoose');
const { Finishing, Washing, Lot } = require('../mongodb_schema');
const { updateVendorBalance } = require('../services/vendorBalanceService');
// const { logAction } = require('../utils/logger');

const createFinishing = async (req, res) => {
  const { invoiceNumber, orderId, vendorId, quantity, quantityShort, rate, date, finishOutDate, description } = req.body;
  let session = null;
  let transactionCommitted = false;
  let finishing = null;

  // Validate required fields
  if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
  if (!orderId) return res.status(400).json({ error: 'Order ID is required' });
  if (!vendorId) return res.status(400).json({ error: 'Vendor ID is required' });
  if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (!rate || rate < 0) return res.status(400).json({ error: 'Rate must be a non-negative number' });

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

  // Validate existing finishing entry against the lot
  const existingFinishing = await Finishing.findOne({ lotId: lot._id });
  if (existingFinishing) {
    return res.status(400).json({ error: 'Finishing record already exists for this lot' });
  }

  // Validate existing Washing entry against the lot
  const washing = await Washing.findOne({ lotId: lot._id });
  if (!washing) {
    return res.status(400).json({ error: 'Washing record not found for this lot' });
  }

  session = await mongoose.startSession();

  try {
    session.startTransaction();

    finishing = new Finishing({
      lotId: lot._id,
      orderId,
      vendorId,
      quantity,
      quantityShort: quantityShort || 0,
      rate,
      date: date,
      finishOutDate,
      description,
      createdAt: new Date(),
    });
    await finishing.save();

    // Update the Order status to 4 (Order in Finishing)
    // const order = await Order.findById(orderId);
    // if (!order) return res.status(404).json({ error: 'Order not found' });
    // if (order.status < 4) {
    //   order.status = 4;
    //   order.statusHistory.push({ status: 4, changedAt: new Date() });
    //   await order.save();
    // }
    lot.status = 4;
    lot.statusHistory.push({ status: 4, changedAt: new Date() });
    await lot.save({ session });

    // Update stitchOutDate in Stitching record if null or empty
    if (!washing.washOutDate) {
      washing.washOutDate = new Date();
      await washing.save({ session });
    }

    // Commit the transaction
    await session.commitTransaction();
    transactionCommitted = true;

    // Populate the finishing record for response
    const populatedFinishing = await Finishing.findById(finishing._id).populate('orderId vendorId lotId').session(null);

    // await updateVendorBalance(vendorId, 'finishing', lot._id, orderId, quantity, rate);
    // await logAction(req.user.userId, 'create_finishing', 'Finishing', finishing._id, `Lot with invoice ${parsedInvoiceNumber} finished`);

    res.status(201).json(populatedFinishing);
  } catch (error) {
    // Abort the transaction on error
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    res.status(400).json({ error: error.message });
  } finally {
    // Always end the session
    if (session) {
      await session.endSession();
    }
  }
};

const updateFinishing = async (req, res) => {
  const { finishOutDate } = req.body;
  try {
    const finishing = await Finishing.findByIdAndUpdate(req.params.id, { finishOutDate }, { new: true });
    if (!finishing) return res.status(404).json({ error: 'Finishing record not found' });

    // Update the Order status to 5 (Order Complete) if finishOutDate is set
    // const order = await Order.findById(finishing.orderId);
    // if (order && finishOutDate && order.status < 5) {
    //   order.status = 5;
    //   order.statusHistory.push({ status: 5, changedAt: new Date() });
    //   await order.save();
    // }

    // await logAction(req.user.userId, 'update_finishing', 'Finishing', finishing._id, 'Finish out date updated, ready for shipment');
    res.json(finishing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getFinishing = async (req, res) => {
  const { search, invoiceNumber } = req.query;
  try {
    let query = {};
    if (search) {
      query.lotId = { $in: await Lot.find({ lotNumber: { $regex: search, $options: 'i' } }).distinct('_id') };
    } else if (invoiceNumber) {
      const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
      if (isNaN(parsedInvoiceNumber)) {
        return res.status(400).json({ error: 'Invoice number must be a valid number' });
      }
      query.lotId = { $in: await Lot.find({ invoiceNumber: parsedInvoiceNumber }).distinct('_id') };
    }
    const finishingRecords = await Finishing.find(query).populate('orderId vendorId lotId');
    res.json(finishingRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { createFinishing, updateFinishing, getFinishing };