const mongoose = require('mongoose');
const { Stitching, Lot, Finishing, Washing, Counter, Client, FitStyle } = require('../mongodb_schema');
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
  let { lotNumber, clientId, fabric, fitStyleId, waistSize, invoiceNumber, vendorId, quantity, quantityShort, rate, threadColors, date, stitchOutDate, description } = req.body;
  let session = null;

  // Validate required fields
  if (!lotNumber) return res.status(400).json({ error: 'Lot number is required' });
  if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!fabric) return res.status(400).json({ error: 'Fabric is required' });
  if (!fitStyleId) return res.status(400).json({ error: 'Fit Style is required' });
  if (!waistSize) return res.status(400).json({ error: 'Waist Size is required' });
  if (!vendorId) return res.status(400).json({ error: 'Vendor ID is required' });
  if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (!rate || rate < 0) return res.status(400).json({ error: 'Rate must be a non-negative number' });
  if (typeof invoiceNumber !== 'number' || isNaN(invoiceNumber)) {
    return res.status(400).json({ error: 'Invoice number must be a valid number' });
  }

  // Validate clientId exists
  const client = await Client.findById(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Validate fitStyleId exists
  const fitStyle = await FitStyle.findById(fitStyleId);
  if (!fitStyle) return res.status(404).json({ error: 'Fit Style not found' });

  quantity = parseInt(quantity);
  threadColors = threadColors.map(tc => ({ color: tc.color.trim(), quantity: Number(tc.quantity)}))

  // Validate threadColors quantities
  const totalThreadQuantity = threadColors.reduce((sum, tc) => sum + parseInt(tc.quantity), 0);
  if (totalThreadQuantity !== quantity) {
    return res.status(400).json({ error: `Sum of thread color quantities (${totalThreadQuantity}) must equal total Lot quantity (${quantity})` });
  }

  // Validate lotNumber format and range constraints
  await validateLotNumber(lotNumber);

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

  // Generate lotId using Counter pattern
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'lotId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  const seq = counter.sequence.toString().padStart(3, '0');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const generatedLotId = `LT-${dateStr}${seq}`;

  // Start a MongoDB session and transaction
  session = await mongoose.startSession();
  let transactionCommitted = false;
  let stitching = null;

  try {
    session.startTransaction();

    // Create Lot document within the transaction
    const lot = new Lot({
      lotId: generatedLotId,
      lotNumber,
      invoiceNumber,
      clientId,
      fabric,
      fitStyleId,
      waistSize,
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

  const populatedStitching = await Stitching.findById(stitching._id)
    .populate({ path: 'lotId', populate: [{ path: 'clientId' }, { path: 'fitStyleId' }] })
    .populate({ path: 'vendorId' });
  res.status(201).json(populatedStitching);
};

const updateStitching = async (req, res) => {
  const { id } = req.params;
  const { lotNumber, clientId, fabric, fitStyleId, waistSize, invoiceNumber, vendorId, quantity, quantityShort, quantityShortDesc, rate, threadColors, date, stitchOutDate, description } = req.body;

  // Validate threadColors quantities
  if (threadColors && quantity) {
    const totalThreadQuantity = threadColors.reduce((sum, tc) => sum + parseInt(tc.quantity), 0);
    if (totalThreadQuantity !== quantity) {
      return res.status(400).json({ error: `Sum of thread color quantities (${totalThreadQuantity}) must equal total Lot quantity (${quantity})` });
    }
  }

  // Find the stitching record
  const stitching = await Stitching.findById(id).populate('lotId vendorId');
  if (!stitching) return res.status(404).json({ error: 'Stitching record not found' });

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

  // Update stitching fields
  if (vendorId) stitching.vendorId = vendorId;
  if (quantity) stitching.quantity = quantity;
  if (quantityShort !== undefined) stitching.quantityShort = quantityShort;
  if (quantityShortDesc) stitching.quantityShortDesc = quantityShortDesc;
  if (rate !== undefined) stitching.rate = rate;
  if (threadColors) stitching.threadColors = threadColors;
  if (date) stitching.date = date;
  if (stitchOutDate) stitching.stitchOutDate = stitchOutDate;
  if (description) stitching.description = description;

  // Update Lot document with lot-level fields
  const lotUpdate = {};
  if (lotNumber) lotUpdate.lotNumber = lotNumber;
  if (invoiceNumber) lotUpdate.invoiceNumber = invoiceNumber;
  if (clientId) lotUpdate.clientId = clientId;
  if (fabric) lotUpdate.fabric = fabric;
  if (fitStyleId) lotUpdate.fitStyleId = fitStyleId;
  if (waistSize) lotUpdate.waistSize = waistSize;
  if (date) lotUpdate.date = date;
  if (description) lotUpdate.description = description;

  if (Object.keys(lotUpdate).length > 0) {
    await Lot.findByIdAndUpdate(stitching.lotId._id, lotUpdate);
  }

  const updatedStitching = await stitching.save();

  const populatedStitching = await Stitching.findById(id)
    .populate({ path: 'lotId', populate: [{ path: 'clientId' }, { path: 'fitStyleId' }] })
    .populate({ path: 'vendorId' });
  res.json(populatedStitching);
};

const updateStitchingStatus = async (req, res) => {
  const { stitchOutDate } = req.body;

  // Check totalQuantity against existing stitching entries
  const stitch = await Stitching.findById(req.params.id);
  if (!stitch) return res.status(404).json({ error: 'Stitching record not found for update operation' });

  const stitching = await Stitching.findByIdAndUpdate(req.params.id, { stitchOutDate }, { new: true, runValidators: true })
    .populate({ path: 'lotId', populate: [{ path: 'clientId' }, { path: 'fitStyleId' }] })
    .populate({ path: 'vendorId' });
  if (!stitching) return res.status(404).json({ error: 'Stitching record not found' });
  res.json(stitching);
};

const getStitching = async (req, res) => {
  const { search, invoiceNumber } = req.query;
  let filter = {};
  if (search) {
    filter.lotId = { $in: await Lot.find({ lotNumber: { $regex: search, $options: 'i' } }).distinct('_id') };
  } else if (invoiceNumber) {
    const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
    if (isNaN(parsedInvoiceNumber)) {
      return res.status(400).json({ error: 'Invoice number must be a valid number' });
    }
    filter.lotId = { $in: await Lot.find({ invoiceNumber: parsedInvoiceNumber }).distinct('_id') };
  }

  let query = Stitching.find(filter)
    .populate({
      path: 'lotId',
      populate: [{ path: 'clientId' }, { path: 'fitStyleId' }]
    })
    .populate({
      path: 'vendorId'
    });
  query = query.sort({ date: -1 });

  const stitchingRecords = await query.exec();

  res.json(stitchingRecords);
};

module.exports = { createStitching, updateStitching, updateStitchingStatus, getStitching };
