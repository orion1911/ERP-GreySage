const mongoose = require('mongoose');
const { Stitching, Lot, Finishing, Washing, Counter, Client, FitStyle, AccessoryType, AccessoryItem } = require('../mongodb_schema');
const { updateVendorBalance, bumpVendorLedgers } = require('../services/vendorBalanceService');
const accessoryService = require('../services/accessoryService');
const { logAction } = require('../utils/logger');

// Prepare + validate zipper consumption for a lot's stitching entry.
// Returns one of:
//   • null                  — nothing to record (skip; stock untouched)
//   • { error }             — validation failure (caller returns 400 with this message)
//   • { typeId, rows }      — ready for accessoryService.replaceConsumption
// Zipper stock tracking is OPTIONAL: if the user leaves every quantity at 0 (or no
// zipper masters exist yet) we skip so the critical stitching flow is never blocked.
// But once ANY zipper qty is entered, the sum must equal the lot quantity (spec rule).
const prepareZipperConsumption = async (zipperConsumption, quantity) => {
  if (!Array.isArray(zipperConsumption) || zipperConsumption.length === 0) return null;

  const entered = zipperConsumption
    .map(z => ({ accessoryItemId: z.accessoryItemId, qty: Number(z.qty) || 0 }))
    .filter(z => z.accessoryItemId && z.qty > 0);
  if (entered.length === 0) return null;

  const zipperType = await AccessoryType.findOne({ key: 'zipper' });
  if (!zipperType) return { error: 'Zipper accessory type is not configured' };

  const totalZipper = entered.reduce((sum, z) => sum + z.qty, 0);
  if (totalZipper !== Number(quantity)) {
    return { error: `Sum of zipper quantities (${totalZipper}) must equal total Lot quantity (${quantity})` };
  }

  // Snapshot item name + client-linked flag from the masters.
  const items = await AccessoryItem.find({
    _id: { $in: entered.map(z => z.accessoryItemId) },
    accessoryTypeId: zipperType._id
  }).lean();
  const itemMap = new Map(items.map(i => [String(i._id), i]));

  const rows = [];
  for (const z of entered) {
    const item = itemMap.get(String(z.accessoryItemId));
    if (!item) return { error: 'Invalid zipper item selected' };
    rows.push({ accessoryItemId: item._id, nameSnapshot: item.name, qty: z.qty, clientLinked: !!item.clientId });
  }

  return { typeId: zipperType._id, rows };
};

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
  let { lotNumber, clientId, fabric, fitStyleId, waistSize, invoiceNumber, vendorId, quantity, quantityShort, rate, threadColors, zipperConsumption, date, stitchOutDate, description } = req.body;
  let session = null;

  // Validate required fields
  if (!lotNumber) return res.status(400).json({ error: 'Lot number is required' });
  if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!fabric) return res.status(400).json({ error: 'Fabric is required' });
  if (!fitStyleId) return res.status(400).json({ error: 'Fit Style is required' });
  if (!waistSize) return res.status(400).json({ error: 'Waist Size is required' });
  if (!vendorId) return res.status(400).json({ error: 'Vendor ID is required' });
  if ((quantity ?? '') === '' || quantity < 0) return res.status(400).json({ error: 'Quantity must be a positive number' });
  if ((rate ?? '') === '' || rate < 0) return res.status(400).json({ error: 'Rate must be a non-negative number' });
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

  // Validate + prepare zipper consumption before opening the transaction
  const preparedZipper = await prepareZipperConsumption(zipperConsumption, quantity);
  if (preparedZipper?.error) return res.status(400).json({ error: preparedZipper.error });

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

    // Record zipper stock-out within the same transaction (if provided)
    if (preparedZipper && preparedZipper.rows) {
      await accessoryService.replaceConsumption({
        accessoryTypeId: preparedZipper.typeId,
        lotId: lot._id,
        stage: 'stitching',
        items: preparedZipper.rows,
        userId: req.user?.userId
      }, session);
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

  await bumpVendorLedgers(['stitching']); // new stitching work changes the stitching vendor's balance
  const populatedStitching = await Stitching.findById(stitching._id)
    .populate({ path: 'lotId', populate: [{ path: 'clientId' }, { path: 'fitStyleId' }] })
    .populate({ path: 'vendorId' });
  res.status(201).json(populatedStitching);
};

const updateStitching = async (req, res) => {
  const { id } = req.params;
  const { lotNumber, clientId, fabric, fitStyleId, waistSize, invoiceNumber, vendorId, quantity, quantityShort, quantityShortDesc, rate, threadColors, zipperConsumption, date, stitchOutDate, description } = req.body;

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

  // Validate zipper consumption against the effective quantity (provided or existing)
  let preparedZipper = null;
  if (Array.isArray(zipperConsumption)) {
    preparedZipper = await prepareZipperConsumption(zipperConsumption, quantity ?? stitching.quantity);
    if (preparedZipper?.error) return res.status(400).json({ error: preparedZipper.error });
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

  // Replace zipper stock-out for this lot when the form supplied a zipper section.
  // Sending an (all-zero) array clears any prior rows; non-empty replaces them.
  if (Array.isArray(zipperConsumption)) {
    await accessoryService.replaceConsumption({
      accessoryTypeId: preparedZipper?.typeId || null,
      lotId: stitching.lotId._id,
      stage: 'stitching',
      items: preparedZipper?.rows || [],
      userId: req.user?.userId
    });
  }

  // Cascade any (new) stitching shortage to downstream washing + finishing quantities.
  await cascadeShortageFromStitching(stitching.lotId._id);

  // Stitching edit can change its own vendor's balance AND cascade qty into washing/finishing.
  await bumpVendorLedgers(['stitching', 'washing', 'finishing']);
  const populatedStitching = await Stitching.findById(id)
    .populate({ path: 'lotId', populate: [{ path: 'clientId' }, { path: 'fitStyleId' }] })
    .populate({ path: 'vendorId' });
  res.json(populatedStitching);
};

// When stitching quantity/short changes, keep downstream stages consistent:
//   • washing washDetails are re-summed to the stitching available qty (delta applied to
//     the largest detail so a reduction is least likely to underflow),
//   • finishing.quantity is re-derived from the washing available (Σ qty − short).
const cascadeShortageFromStitching = async (lotId) => {
  const st = await Stitching.findOne({ lotId });
  if (!st) return;
  const washAvail = (st.quantity || 0) - (st.quantityShort || 0);

  const wash = await Washing.findOne({ lotId });
  if (wash && Array.isArray(wash.washDetails) && wash.washDetails.length) {
    const total = wash.washDetails.reduce((s, d) => s + (d.quantity || 0), 0);
    const delta = washAvail - total;
    if (delta !== 0) {
      let idx = 0;
      for (let i = 1; i < wash.washDetails.length; i++) {
        if ((wash.washDetails[i].quantity || 0) > (wash.washDetails[idx].quantity || 0)) idx = i;
      }
      wash.washDetails[idx].quantity = Math.max(0, (wash.washDetails[idx].quantity || 0) + delta);
      await wash.save();
    }
  }

  const fin = await Finishing.findOne({ lotId });
  if (fin) {
    const w = await Washing.findOne({ lotId });
    const finAvail = w ? w.washDetails.reduce((s, d) => s + (d.quantity || 0) - (d.quantityShort || 0), 0) : 0;
    if (fin.quantity !== finAvail) { fin.quantity = finAvail; await fin.save(); }
  }
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
