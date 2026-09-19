const mongoose = require('mongoose');
const { Washing, Lot, Stitching, Finishing, WashCreationRate } = require('../mongodb_schema');
const { updateVendorBalance, bumpVendorLedgers } = require('../services/vendorBalanceService');
const { invalidateDashboard } = require('../services/dashboardCache');
// const { logAction } = require('../utils/logger');

// Keep an existing Finishing record's quantity in sync with the washing available qty
// (Σ washDetails.quantity − quantityShort) so adding washing short cascades downstream.
const recomputeFinishingFromWashing = async (lotId) => {
  const fin = await Finishing.findOne({ lotId });
  if (!fin) return;
  const wash = await Washing.findOne({ lotId });
  const finAvail = wash
    ? wash.washDetails.reduce((s, d) => s + (parseInt(d.quantity) || 0) - (parseInt(d.quantityShort) || 0), 0)
    : 0;
  if (fin.quantity !== finAvail) { fin.quantity = finAvail; await fin.save(); }
};

// ─── Creation-based rows: server-side rate resolution ────────────────────────
// For each detail row that carries creations[], load the vendor's rate card and:
//   • BLOCK the entry if ANY selected creation has no rate for THIS vendor
//     (missing rate card = incomplete master data — force it to be fixed, per
//     the "block, don't override" decision; the error names the creation).
//   • rate = SUM of the selected creations' rates (the client cannot inject it).
//   • snapshot each creation's name + rate so later master edits never rewrite
//     history (old records must keep showing old rates).
//
// LEGACY ESCAPE HATCH: a row with NO creations[] but WITH a numeric rate (i.e.
// a pre-catalog record being edited) is passed through unchanged, so historic
// entries stay correctable without inventing catalog data.
const resolveDetailRates = async (vendorId, washDetails) => {
  // A row is "real creation-based" only if it carries a real catalog creation.
  // The NA placeholder (name 'NA', no creationId) is legacy — it carries the
  // row's stored rate and must NOT be resolved against / blocked by the rate card.
  const isNaPlaceholder = (c) => !(c.creationId || c._id) && String(c.name || '').toUpperCase() === 'NA';
  // Sample rows are processed too — they always resolve to rate 0 (the washer does not
  // bill sample pcs), even with unpriced or no creations.
  const creationRows = (washDetails || []).filter(d =>
    d.isSample ||
    (Array.isArray(d.creations) && d.creations.length > 0 && !d.creations.every(isNaPlaceholder))
  );
  if (creationRows.length === 0) return null; // fully legacy/NA payload — nothing to resolve

  const cards = await WashCreationRate.find({ vendorId }).lean();
  const rateByCreation = new Map(cards.map(c => [String(c.creationId), c.rate]));

  return washDetails.map((d) => {
    // SAMPLE rows: pieces within the lot the washer does not bill us for — rate is
    // always 0, and unpriced (or no) creations are allowed. The frozen name snapshot
    // is kept for display; the rate card never blocks a sample row.
    if (d.isSample) {
      const sel = (Array.isArray(d.creations) ? d.creations : []).filter(c => c.creationId || c._id);
      const resolvedSample = sel.map(c => ({ creationId: String(c.creationId || c._id), name: String(c.name || '').toUpperCase(), rate: 0 }));
      return {
        ...d,
        isSample: true,
        creations: resolvedSample,
        rate: 0, // server-forced; client-sent rate ignored
        washCreation: resolvedSample.map(c => c.name).join(' + ') || 'SAMPLE (NOT BILLED)',
      };
    }

    if (!Array.isArray(d.creations) || d.creations.length === 0) return d;

    // Row is entirely the NA legacy placeholder: keep stored rate + washCreation text.
    if (d.creations.every(isNaPlaceholder)) return d;

    const resolved = [];
    let sum = 0;
    for (const c of d.creations) {
      const id = String(c.creationId || c._id || '');
      if (!id) continue;
      const rate = rateByCreation.get(id);
      // Missing OR 0 means "not priced" for this vendor (0 is the rate-card default).
      if (rate === undefined || rate === null || Number(rate) <= 0) {
        // nameSnapshot may carry the display name for a helpful error
        throw new Error(`No rate set for wash creation "${c.name || id}" for this washing vendor — complete the vendor's rate card first`);
      }
      resolved.push({ creationId: id, name: String(c.name || '').toUpperCase(), rate });
      sum += rate;
    }
    if (resolved.length === 0) {
      throw new Error('Creation-based wash detail rows require at least one valid wash creation');
    }
    return {
      ...d,
      creations: resolved,
      rate: Math.round(sum * 100) / 100, // server-computed; client-sent rate ignored
      washCreation: resolved.map(c => c.name).join(' + '), // readable echo of the snapshot
    };
  });
};

const createWashing = async (req, res) => {
  const { invoiceNumber, vendorId, quantityShort, date, washOutDate, description, washDetails } = req.body;
  let session = null;
  let transactionCommitted = false;
  let washing = null;

  // Validate required fields
  if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
  if (!vendorId) return res.status(400).json({ error: 'Vendor ID is required' });
  if (!washDetails || !Array.isArray(washDetails) || washDetails.length === 0) {
    return res.status(400).json({ error: 'washDetails must be a non-empty array' });
  }

  // Validate invoiceNumber as a number
  const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
  if (isNaN(parsedInvoiceNumber)) {
    return res.status(400).json({ error: 'Invoice number must be a valid number' });
  }

  // Validate invoiceNumber
  const lot = await Lot.findOne({ invoiceNumber: parsedInvoiceNumber });
  if (!lot) {
    return res.status(400).json({ error: 'Invalid invoiceNumber' });
  }

  // Validate existing washing entry against the lot
  const existingWashing = await Washing.findOne({ lotId: lot._id });
  if (existingWashing) {
    return res.status(400).json({ error: 'Washing record already exists for this lot' });
  }

  // Validate washDetails quantities against StitchingSchema quantity
  const stitching = await Stitching.findOne({ lotId: lot._id });
  if (!stitching) {
    return res.status(400).json({ error: 'Stitching record not found for this lot' });
  }

  const availableQty = stitching.quantity - (stitching.quantityShort || 0);
  const totalWashQuantity = washDetails.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
  if (totalWashQuantity !== availableQty) {
    return res.status(400).json({ error: `Total wash quantity (${totalWashQuantity}) must equal available stitching quantity (${availableQty}) [stitching: ${stitching.quantity} - short: ${stitching.quantityShort || 0}]` });
  }

  // Resolve creation-based rates against the vendor's rate card (blocks on a
  // missing rate; auto-computes each row's rate as the sum of its creations).
  let resolvedDetails;
  try {
    resolvedDetails = await resolveDetailRates(vendorId, washDetails) || washDetails;
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Create the Washing record within the transaction
    washing = new Washing({
      lotId: lot._id,
      date: date || new Date(),
      washOutDate,
      vendorId,
      washDetails: resolvedDetails,
      quantityShort: quantityShort || 0,
      description,
      createdAt: new Date(),
    });
    await washing.save({ session });

    lot.status = 3;
    lot.statusHistory.push({ status: 3, changedAt: new Date() });
    await lot.save({ session });

    // Auto-set the stitch-out date to this washing entry's selected date.
    stitching.stitchOutDate = date || new Date();
    await stitching.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    transactionCommitted = true;

    await bumpVendorLedgers(['washing']); // new washing work changes the washing vendor's balance
    await invalidateDashboard(); // lot moves Making -> In Washing
    // Populate the washing record for response
    const populatedWashing = await Washing.findById(washing._id).populate('vendorId lotId').session(null);

    res.status(201).json(populatedWashing);
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

const updateWashing = async (req, res) => {
  const { id } = req.params;
  const { vendorId, quantityShort, date, washOutDate, description, washDetails } = req.body;

  // Find the washing record
  const washing = await Washing.findById(id).populate('lotId vendorId');
  if (!washing) return res.status(404).json({ error: 'Washing record not found' });

  // Validate references
  const stitching = await Stitching.findOne({ lotId: washing.lotId._id });
  if (!stitching) return res.status(404).json({ error: 'Stitching record not found' });

  const effectiveVendorId = vendorId || (washing.vendorId._id || washing.vendorId);

  // Validate washDetails quantities
  if (washDetails) {
    const availableQty = stitching.quantity - (stitching.quantityShort || 0);
    const totalWashQuantity = washDetails.reduce((sum, detail) => sum + parseInt(detail.quantity || 0), 0);
    if (totalWashQuantity !== availableQty) {
      return res.status(400).json({ error: `Total wash quantity (${totalWashQuantity}) must equal available stitching quantity (${availableQty}) [stitching: ${stitching.quantity} - short: ${stitching.quantityShort || 0}]` });
    }
  }

  // Resolve creation-based rates (same rules as create — block on missing rate,
  // auto-compute the row rate). Rows without creations[] keep their stored rate
  // (legacy escape hatch).
  let resolvedDetails;
  if (washDetails) {
    try {
      resolvedDetails = await resolveDetailRates(effectiveVendorId, washDetails) || washDetails;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // Update fields
  if (vendorId) washing.vendorId = vendorId;
  if (quantityShort !== undefined) washing.quantityShort = quantityShort;
  if (date) washing.date = date;
  if (washOutDate) washing.washOutDate = washOutDate;
  if (description) washing.description = description;
  if (washDetails) washing.washDetails = resolvedDetails;

  try {
    await washing.save();

    // Cascade any (new) washing shortage to an existing Finishing record's quantity.
    await recomputeFinishingFromWashing(washing.lotId._id || washing.lotId);

    // Washing edit changes its own vendor's balance AND can cascade qty into finishing.
    await bumpVendorLedgers(['washing', 'finishing']);
    await invalidateDashboard(); // wash qty/short edits move In/Out Washing totals
    const populatedWashing = await Washing.findById(id).populate('lotId vendorId');
    res.json(populatedWashing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateWashingStatus = async (req, res) => {
  const { washOutDate } = req.body;
  try {
    const washing = await Washing.findByIdAndUpdate(req.params.id, { washOutDate }, { new: true }).populate('lotId vendorId');
    if (!washing) return res.status(404).json({ error: 'Washing record not found' });
    await invalidateDashboard(); // washOutDate alone flips In Washing -> Out Washing on every surface
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
    const washingRecords = await Washing.find(query).populate('vendorId lotId');
    res.json(washingRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { createWashing, updateWashing, updateWashingStatus, getWashing };