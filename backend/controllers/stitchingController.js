const mongoose = require('mongoose');
const { Stitching, Order, Lot, Finishing, Washing } = require('../mongodb_schema');
const { updateVendorBalance } = require('../services/vendorBalanceService');
const { logAction } = require('../utils/logger');

// Helper function to parse lotNumber and extract series, sub-series, and lot number
const parseLotNumber = (lotNumber) => {
  const parts = lotNumber.split('/');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error('Invalid lotNumber format. Expected format: SERIES/SUBSERIES or SERIES/SUBSERIES/NUM');
  }
  const [series, subSeries, lotNum] = parts;
  if (!/^[A-Z]+$/.test(series)) {
    throw new Error('Series must contain one or more uppercase letters only');
  }
  if (!/^\d+$/.test(subSeries)) {
    throw new Error('Sub-series must be a number');
  }
  if (parts.length === 3 && !/^\d+$/.test(lotNum)) {
    throw new Error('Lot number must be a number');
  }
  return {
    series,
    subSeries: parseInt(subSeries, 10),
    lotNum: parts.length === 3 ? parseInt(lotNum, 10) : parseInt(subSeries, 10),
  };
};

// Helper function to validate lotNumber against existing lots
const validateLotNumber = async (lotNumber, excludeLotId = null) => {
  const { series, subSeries, lotNum } = parseLotNumber(lotNumber);

  // Define the new range (single lot if subSeries === lotNum)
  const newRangeStart = subSeries;
  const newRangeEnd = lotNum;

  // Find all lots in the same series, excluding the specified lotId (for updates)
  const query = { lotNumber: { $regex: `^${series}/` } };
  if (excludeLotId) query._id = { $ne: excludeLotId };
  const existingLots = await Lot.find(query);

  const lotRanges = [];

  // Parse existing lotNumbers to identify ranges
  for (const lot of existingLots) {
    const { subSeries: existingSubSeries, lotNum: existingLotNum } = parseLotNumber(lot.lotNumber);
    lotRanges.push({
      start: existingSubSeries,
      end: existingLotNum,
    });
  }

  // Validate: new lot's range must not overlap with existing ranges
  for (const range of lotRanges) {
    const overlap =
      (newRangeStart >= range.start && newRangeStart <= range.end) ||
      (newRangeEnd >= range.start && newRangeEnd <= range.end) ||
      (newRangeStart <= range.start && newRangeEnd >= range.end);
    if (overlap) {
      throw new Error(`Lot range already exists! Lot range ${series}/${newRangeStart}/${newRangeEnd} conflicts with existing range ${series}/${range.start}/${range.end}`);
    }
  }
};

const createStitching = async (req, res) => {
  let { lotNumber, orderId, invoiceNumber, vendorId, quantity, quantityShort, rate, threadColors, date, stitchOutDate, description } = req.body;
  let session = null;

  // Validate required fields
  if (!lotNumber) return res.status(400).json({ error: 'Lot number is required' });
  if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
  if (!orderId) return res.status(400).json({ error: 'Order ID is required' });
  if (!vendorId) return res.status(400).json({ error: 'Vendor ID is required' });
  if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (!rate || rate < 0) return res.status(400).json({ error: 'Rate must be a non-negative number' });
  if (typeof invoiceNumber !== 'number' || isNaN(invoiceNumber)) {
    return res.status(400).json({ error: 'Invoice number must be a valid number' });
  }

  quantity = parseInt(quantity);
  threadColors = threadColors.map(tc => ({ color: tc.color.trim(), quantity: Number(tc.quantity)}))

  // Validate threadColors quantities
  const totalThreadQuantity = threadColors.reduce((sum, tc) => sum + parseInt(tc.quantity), 0);
  if (totalThreadQuantity !== quantity) {
    return res.status(400).json({ error: `Sum of thread color quantities (${totalThreadQuantity}) must equal total Lot quantity (${quantity})` });
  }

  // Validate lotNumber format and range constraints
  await validateLotNumber(lotNumber);

  // Check totalQuantity against existing stitching entries
  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const existingStitchings = await Stitching.find({ orderId });
  const totalStitchedQuantity = existingStitchings.reduce((sum, stitching) => sum + stitching.quantity, 0);
  const newTotal = totalStitchedQuantity + quantity;

  if (newTotal > order.totalQuantity) {
    return res.status(400).json({ error: `Total stitched quantity (${newTotal}) exceeds order's totalQuantity (${order.totalQuantity})` });
  }

  // Validate lotNumber and invoiceNumber uniqueness (handled by MongoDB unique index, errors caught by error.js)
  const existingLot = await Lot.findOne({
    $or: [{ lotNumber }, { invoiceNumber }],
  });
  if (existingLot) {
    if (existingLot.lotNumber === lotNumber) {
      return res.status(400).json({ error: `Lot number (${existingLot.lotNumber}) already exists` });
    }
    if (existingLot.invoiceNumber === invoiceNumber) {
      return res.status(400).json({ error: `Invoice number (${existingLot.invoiceNumber}) already exists` });
    }
  }

  // Start a MongoDB session and transaction
  session = await mongoose.startSession();
  let transactionCommitted = false;
  let stitching = null;

  try {
    session.startTransaction();

    // Create Lot document within the transaction
    const lot = new Lot({
      lotNumber,
      invoiceNumber,
      orderId,
      date,
      status: 2,
      statusHistory: [{ status: 2, changedAt: new Date() }],
      description,
      createdAt: new Date(),
    });
    await lot.save({ session });

    // Create Stitching entry within the transaction
    stitching = new Stitching({
      lotId: lot._id,
      orderId,
      vendorId,
      quantity,
      quantityShort: quantityShort || 0,
      rate,
      threadColors,
      date,
      stitchOutDate,
      description,
      createdAt: new Date(),
    });
    await stitching.save({ session });

    // Update the Order status to 2 (Order in Stitching) within the transaction
    if (order.status < 2) {
      order.status = 2;
      // order.statusHistory.push({ status: 2, changedAt: new Date() });
      await order.save({ session });
    }

    // Commit the transaction
    await session.commitTransaction();
    transactionCommitted = true;
  } finally {
    // Abort transaction if not committed
    if (session && !transactionCommitted) {
      await session.abortTransaction();
    }
    // Always end the session
    if (session) {
      await session.endSession();
    }
  }

  // Perform non-transactional updates
  // await updateVendorBalance(vendorId, 'stitching', lot._id, orderId, quantity, rate);
  // await logAction(req.user.userId, 'create_stitching', 'Stitching', stitching._id, `Lot ${lotNumber} with invoice ${invoiceNumber} created`);

  res.status(201).json(stitching);
};

const updateStitching = async (req, res) => {
  const { id } = req.params;
  const { lotNumber, orderId, invoiceNumber, vendorId, quantity, quantityShort, quantityShortDesc, rate, threadColors, date, stitchOutDate, description } = req.body;

  // Validate threadColors quantities
  if (threadColors && quantity) {
    const totalThreadQuantity = threadColors.reduce((sum, tc) => sum + parseInt(tc.quantity), 0);
    if (totalThreadQuantity !== quantity) {
      return res.status(400).json({ error: `Sum of thread color quantities (${totalThreadQuantity}) must equal total Lot quantity (${quantity})` });
    }
  }

  // Find the stitching record
  const stitching = await Stitching.findById(id).populate('lotId orderId vendorId');
  if (!stitching) return res.status(404).json({ error: 'Stitching record not found' });

  // Validate references
  const order = await Order.findById(orderId || stitching.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Validate quantity consistency
  if (quantity && quantity !== stitching.quantity) {
    const existingStitchings = await Stitching.find({ orderId: orderId || stitching.orderId });
    const currentTotal = existingStitchings.reduce((sum, s) => sum + s.quantity, 0) - stitching.quantity + quantity;
    if (currentTotal > order.totalQuantity) {
      return res.status(400).json({ error: `Total stitched quantity (${currentTotal}) exceeds order's totalQuantity (${order.totalQuantity})` });
    }
  }

  // Validate lotNumber if provided
  if (lotNumber) {
    await validateLotNumber(lotNumber, stitching.lotId._id);
  }

  // Validate lotNumber and invoiceNumber uniqueness (excluding current record)
  if (lotNumber || invoiceNumber) {
    const lotQuery = { _id: { $ne: stitching.lotId._id } };
    if (lotNumber) lotQuery.lotNumber = lotNumber;
    if (invoiceNumber) lotQuery.invoiceNumber = invoiceNumber;
    const existingLot = await Lot.findOne(lotQuery);
    if (existingLot) {
      if (lotNumber && existingLot.lotNumber === lotNumber) {
        return res.status(400).json({ error: 'Lot number already exists' });
      }
      if (invoiceNumber && existingLot.invoiceNumber === invoiceNumber) {
        return res.status(400).json({ error: 'Invoice number already exists' });
      }
    }
  }

  // Update fields
  if (lotNumber) stitching.lotId.lotNumber = lotNumber;
  if (invoiceNumber) stitching.lotId.invoiceNumber = invoiceNumber;
  if (orderId) stitching.orderId = orderId;
  if (vendorId) stitching.vendorId = vendorId;
  if (quantity) stitching.quantity = quantity;
  if (quantityShort !== undefined) stitching.quantityShort = quantityShort;
  if (quantityShortDesc) stitching.quantityShortDesc = quantityShortDesc;
  if (rate !== undefined) stitching.rate = rate;
  if (threadColors) stitching.threadColors = threadColors;
  if (date) stitching.date = date;
  if (stitchOutDate) stitching.stitchOutDate = stitchOutDate;
  if (description) stitching.description = description;

  // Update Lot document
  await Lot.findByIdAndUpdate(stitching.lotId._id, {
    lotNumber: stitching.lotId.lotNumber,
    invoiceNumber: stitching.lotId.invoiceNumber,
    date: stitching.date,
    description: stitching.description
  });

  const updatedStitching = await stitching.save();
  const populatedStitching = await Stitching.findById(id).populate('lotId orderId vendorId');
  // await logAction(req.user.userId, 'update_stitching', 'Stitching', updatedStitching._id, `Stitching record ${id} updated`);
  res.json(populatedStitching);
};

const updateStitchingStatus = async (req, res) => {
  const { stitchOutDate } = req.body;

  // Check totalQuantity against existing stitching entries
  const stitch = await Stitching.findById(req.params.id);
  if (!stitch) return res.status(404).json({ error: 'Stitching record not found for update operation' });

  const stitching = await Stitching.findByIdAndUpdate(req.params.id, { stitchOutDate }, { new: true, runValidators: true });
  if (!stitching) return res.status(404).json({ error: 'Stitching record not found' });
  // await logAction(req.user.userId, 'update_stitching', 'Stitching', stitching._id, 'Stitch out date updated');
  res.json(stitching);
};

const getStitching = async (req, res) => {
  const { search, orderId, invoiceNumber } = req.query;
  let filter = {};
  if (search) {
    filter.lotId = { $in: await Lot.find({ lotNumber: { $regex: search, $options: 'i' } }).distinct('_id') };
  } else if (orderId) {
    filter.orderId = orderId;
  } else if (invoiceNumber) {
    const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
    if (isNaN(parsedInvoiceNumber)) {
      return res.status(400).json({ error: 'Invoice number must be a valid number' });
    }
    filter.lotId = { $in: await Lot.find({ invoiceNumber: parsedInvoiceNumber }).distinct('_id') };
  }

  // let query = Stitching.find(filter).populate('lotId orderId vendorId');
  let query = Stitching.find(filter)
    .populate({
      path: 'lotId'
    })
    .populate({
      path: 'orderId',
      populate: {
        path: 'clientId'
      }
    })
    .populate({
      path: 'vendorId'
    });
  query = query.sort({ 'orderId.date': -1, 'lotId.date': -1 });

  const stitchingRecords = await query.exec();

  // if (!stitchingRecords || stitchingRecords.length === 0) {
  //   return res.status(404).json({ error: 'No Stitching Records Found' });
  // }

  // // Map stitching records to include status
  // const recordsWithStatus = await Promise.all(
  //   stitchingRecords.map(async (record) => {
  //     // Check if lotId exists in Finishing
  //     const finishingRecord = await Finishing.findOne({ lotId: record.lotId._id }).lean();
  //     if (finishingRecord) {
  //       return { ...record, status: 4 }; // Finishing
  //     }
  //     // Check if lotId exists in Washing
  //     const washingRecord = await Washing.findOne({ lotId: record.lotId._id }).lean();
  //     if (washingRecord) {
  //       return { ...record, status: 3 }; // Washing
  //     }
  //     // Default to Stitching
  //     return { ...record, status: 2 }; // Stitching
  //   })
  // );

  res.json(stitchingRecords);
};

module.exports = { createStitching, updateStitching, updateStitchingStatus, getStitching };