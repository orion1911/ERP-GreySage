const { VendorBalance, VendorPaymentEntry, StitchingVendor, WashingVendor, FinishingVendor } = require('../mongodb_schema');
const { 
  getVendorLotsDetails, 
  recordVendorPayment, 
  recordShortAdjustment, 
  getVendorBalance
} = require('../services/vendorBalanceService');
const { logAction } = require('../utils/logger');

/**
 * Get all vendors and balances for a vendor type
 */
const getVendorsByType = async (req, res) => {
  try {
    const { vendorType } = req.query;
    
    if (!vendorType || !['stitching', 'washing', 'finishing'].includes(vendorType)) {
      return res.status(400).json({ error: 'Valid vendor type required (stitching, washing, finishing)' });
    }

    const VendorModel = {
      'stitching': StitchingVendor,
      'washing': WashingVendor,
      'finishing': FinishingVendor
    }[vendorType];

    const vendors = await VendorModel.find({ isActive: true });
    
    // Get balance for each vendor
    const vendorsWithBalance = await Promise.all(
      vendors.map(async (vendor) => {
        const balance = await getVendorBalance(vendor._id, vendorType);
        return {
          ...vendor.toObject(),
          balance: balance ? {
            totalDue: balance.totalDue,
            totalPaid: balance.totalPaid,
            remainingBalance: balance.remainingBalance
          } : {
            totalDue: 0,
            totalPaid: 0,
            remainingBalance: 0
          }
        };
      })
    );

    res.json(vendorsWithBalance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get vendor lots with amounts and payments (similar to Excel snapshot)
 */
const getVendorLotsWithPayments = async (req, res) => {
  try {
    const { vendorId, vendorType } = req.query;
    
    if (!vendorId || !vendorType) {
      return res.status(400).json({ error: 'vendorId and vendorType required' });
    }

    if (!['stitching', 'washing', 'finishing'].includes(vendorType)) {
      return res.status(400).json({ error: 'Invalid vendor type' });
    }

    const result = await getVendorLotsDetails(vendorId, vendorType);

    // Calculate summary
    let totalAmount = 0;
    let totalPayment = 0;
    let totalBalance = 0;

    for (const lot of result.lots) {
      totalAmount += lot.amount;
      totalPayment += lot.totalPayment + lot.shortAdjustmentAmount;
      totalBalance += lot.balance;
    }

    res.json({
      lots: result.lots,
      vendorLevelSummary: result.vendorLevelSummary,
      summary: {
        totalAmount,
        totalPayment,
        totalBalance,
        totalQuantity: result.lots.reduce((sum, lot) => sum + lot.quantity, 0),
        totalShortQuantity: result.lots.reduce((sum, lot) => sum + lot.quantityShort, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Record a direct payment to vendor (vendor-level only)
 */
const addVendorPayment = async (req, res) => {
  try {
    const { vendorId, vendorType, amount, paymentDate, notes } = req.body;

    if (!vendorId || !vendorType || !amount || !paymentDate) {
      return res.status(400).json({ error: 'vendorId, vendorType, amount, and paymentDate required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const paymentEntry = await recordVendorPayment(
      vendorId,
      vendorType,
      amount,
      paymentDate,
      notes,
      req.user.userId
    );

    await logAction(
      req.user.userId,
      'add_vendor_payment',
      'VendorBalance',
      vendorId,
      `Recorded vendor-level payment of ${amount} for ${vendorType} vendor`
    );

    res.json({ message: 'Payment recorded successfully', entry: paymentEntry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Record short quantity adjustment (adjusted as payment) - vendor-level only
 */
const addShortAdjustment = async (req, res) => {
  try {
    const { vendorId, vendorType, shortQuantity, shortRate, paymentDate, notes, lotId } = req.body;

    if (!vendorId || !vendorType || !shortQuantity || shortRate === undefined || !paymentDate || !lotId) {
      return res.status(400).json({ error: 'vendorId, vendorType, lotId, shortQuantity, shortRate, and paymentDate required' });
    }

    if (shortQuantity <= 0 || shortRate < 0) {
      return res.status(400).json({ error: 'Short quantity must be > 0 and rate must be >= 0' });
    }

    const paymentEntry = await recordShortAdjustment(
      vendorId,
      vendorType,
      shortQuantity,
      shortRate,
      paymentDate,
      notes,
      req.user.userId,
      lotId
    );

    await logAction(
      req.user.userId,
      'add_short_adjustment',
      'VendorBalance',
      vendorId,
      `Recorded vendor-level short adjustment: ${shortQuantity} qty @ ${shortRate} rate - ${vendorType} vendor`
    );

    res.json({ message: 'Short adjustment recorded successfully', entry: paymentEntry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all payment entries for a vendor (sorted by payment date desc)
 */
const getVendorPaymentEntries = async (req, res) => {
  try {
    const { vendorId, vendorType } = req.query;

    if (!vendorId || !vendorType) {
      return res.status(400).json({ error: 'vendorId and vendorType required' });
    }

    const entries = await VendorPaymentEntry.find({
      vendorId,
      vendorType
    })
    .populate('createdBy', 'username')
    .populate('lotId', 'lotNumber')
    .sort({ paymentDate: -1, createdAt: -1 });

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get vendor balance summary
 */
const getVendorBalanceSummary = async (req, res) => {
  try {
    const { vendorId, vendorType } = req.query;

    if (!vendorId || !vendorType) {
      return res.status(400).json({ error: 'vendorId and vendorType required' });
    }

    const balance = await getVendorBalance(vendorId, vendorType);
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update a payment entry (payment or short adjustment)
 */
const updatePaymentEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const { vendorId, vendorType, amount, paymentDate, notes, shortQuantity, shortRate, lotId } = req.body;

    if (!entryId) {
      return res.status(400).json({ error: 'Entry ID required' });
    }

    // Find the entry
    const entry = await VendorPaymentEntry.findById(entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Payment entry not found' });
    }

    // Update fields
    const updateData = {};
    if (amount !== undefined) updateData.amount = amount;
    if (paymentDate) updateData.paymentDate = paymentDate;
    if (notes !== undefined) updateData.notes = notes;
    if (shortQuantity !== undefined) updateData.shortQuantity = shortQuantity;
    if (shortRate !== undefined) updateData.shortRate = shortRate;
    if (lotId !== undefined) updateData.lotId = lotId;
    updateData.updatedAt = new Date();
    updateData.updatedBy = req.user.userId;

    const updatedEntry = await VendorPaymentEntry.findByIdAndUpdate(
      entryId,
      updateData,
      { new: true }
    ).populate('createdBy', 'username').populate('lotId', 'lotNumber');

    await logAction(
      req.user.userId,
      'update_payment_entry',
      'VendorBalance',
      entryId,
      `Updated ${entry.paymentType} entry for vendor ${vendorId}`
    );

    res.json({ message: 'Payment entry updated successfully', entry: updatedEntry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete a payment entry
 */
const deletePaymentEntry = async (req, res) => {
  try {
    const { entryId } = req.params;

    if (!entryId) {
      return res.status(400).json({ error: 'Entry ID required' });
    }

    const entry = await VendorPaymentEntry.findById(entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Payment entry not found' });
    }

    await VendorPaymentEntry.findByIdAndDelete(entryId);

    await logAction(
      req.user.userId,
      'delete_payment_entry',
      'VendorBalance',
      entryId,
      `Deleted ${entry.paymentType} entry for vendor ${entry.vendorId}`
    );

    res.json({ message: 'Payment entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  getVendorsByType,
  getVendorLotsWithPayments,
  addVendorPayment,
  addShortAdjustment,
  getVendorPaymentEntries,
  getVendorBalanceSummary,
  updatePaymentEntry,
  deletePaymentEntry
};