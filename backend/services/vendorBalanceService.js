const mongoose = require('mongoose');
const { VendorBalance, VendorPaymentEntry, VendorPaymentEntryHistory, Stitching, Washing, Finishing, Lot, Client, FitStyle } = require('../mongodb_schema');

/**
 * Get all lots for a vendor with their amounts and payments
 */
const getVendorLotsDetails = async (vendorId, vendorType) => {
  try {
    // Determine which collection to query based on vendor type
    let records;
    const recordModel = {
      'stitching': Stitching,
      'washing': Washing,
      'finishing': Finishing
    }[vendorType];

    if (!recordModel) {
      throw new Error('Invalid vendor type');
    }

    // Get all records for this vendor
    records = await recordModel.find({ vendorId })
      .populate({
        path: 'lotId',
        populate: [
          { path: 'clientId', select: 'name clientCode' },
          { path: 'fitStyleId', select: 'name' }
        ]
      })
      .sort({ date: -1 });

    // Aggregate lot data
    const lotsMap = new Map();

    for (const record of records) {
      const lot = record.lotId;
      const lotId = lot._id.toString();

      if (!lotsMap.has(lotId)) {
        lotsMap.set(lotId, {
          _id: lot._id,
          lotId: lot.lotId,
          lotNumber: lot.lotNumber,
          invoiceNumber: lot.invoiceNumber,
          clientId: lot.clientId._id,
          clientName: lot.clientId.name,
          clientCode: lot.clientId.clientCode,
          fabric: lot.fabric,
          fitStyleId: lot.fitStyleId._id,
          fitStyleName: lot.fitStyleId.name,
          waistSize: lot.waistSize,
          date: lot.date,
          amount: 0,
          quantity: 0,
          rate: 0,
          quantityShort: 0,
          shortRate: 0,
          vendorType: vendorType,
          vendorId: vendorId
        });
      }

      const lotData = lotsMap.get(lotId);

      // Aggregate based on vendor type
      if (vendorType === 'stitching') {
        lotData.quantity += record.quantity;
        lotData.quantityShort += record.quantityShort || 0;
        lotData.rate = record.rate;
        lotData.amount += record.quantity * record.rate;
      } else if (vendorType === 'washing') {
        // For washing, store individual wash details instead of aggregating
        if (!lotData.washDetails) {
          lotData.washDetails = [];
        }
        
        if (record.washDetails && record.washDetails.length > 0) {
          for (const wash of record.washDetails) {
            lotData.washDetails.push({
              washColor: wash.washColor,
              washCreation: wash.washCreation,
              quantity: wash.quantity,
              rate: wash.rate,
              quantityShort: wash.quantityShort || 0,
              quantityShortDesc: wash.quantityShortDesc,
              amount: wash.quantity * wash.rate
            });
            
            // Still aggregate for totals
            lotData.quantity += wash.quantity;
            lotData.quantityShort += wash.quantityShort || 0;
            lotData.amount += wash.quantity * wash.rate;
          }
        }
      } else if (vendorType === 'finishing') {
        lotData.quantity += record.quantity;
        lotData.quantityShort += record.quantityShort || 0;
        lotData.rate = record.rate;
        lotData.amount += record.quantity * record.rate;
      }
    }

    // Get payment data for each lot (lot-specific payments)
    const lotArray = Array.from(lotsMap.values());

    // Get vendor-level payments (lump sum payments not tied to specific lots)
    const vendorLevelPayments = await VendorPaymentEntry.find({
      vendorId,
      vendorType,
      paymentScope: 'vendor'
    });

    let totalVendorLevelPayment = 0;
    let totalVendorLevelShortAdjustment = 0;

    for (const payment of vendorLevelPayments) {
      if (payment.paymentType === 'payment') {
        totalVendorLevelPayment += payment.amount;
      } else if (payment.paymentType === 'short_adjustment') {
        totalVendorLevelShortAdjustment += payment.amount;
      }
    }

    // Calculate total amounts for balance distribution
    const totalAmount = lotArray.reduce((sum, lot) => sum + lot.amount, 0);
    const totalVendorLevelCredits = totalVendorLevelPayment + totalVendorLevelShortAdjustment;

    for (const lot of lotArray) {
      // Get lot-specific payments
      const lotPayments = await VendorPaymentEntry.find({
        vendorId,
        vendorType,
        paymentScope: 'lot',
        lotId: lot._id
      });

      let lotSpecificPayment = 0;
      let lotSpecificShortAdjustment = 0;

      for (const payment of lotPayments) {
        if (payment.paymentType === 'payment') {
          lotSpecificPayment += payment.amount;
        } else if (payment.paymentType === 'short_adjustment') {
          lotSpecificShortAdjustment += payment.amount;
          lot.shortRate = payment.shortRate;
        }
      }

      // Distribute vendor-level payments proportionally based on lot amount
      const lotProportion = totalAmount > 0 ? lot.amount / totalAmount : 0;
      const vendorLevelPaymentForLot = totalVendorLevelPayment * lotProportion;
      const vendorLevelShortAdjustmentForLot = totalVendorLevelShortAdjustment * lotProportion;

      lot.totalPayment = lotSpecificPayment + vendorLevelPaymentForLot;
      lot.shortAdjustmentAmount = lotSpecificShortAdjustment + vendorLevelShortAdjustmentForLot;
      lot.balance = lot.amount - lot.totalPayment - lot.shortAdjustmentAmount;

      // Store vendor-level payment info for display
      lot.vendorLevelPayment = vendorLevelPaymentForLot;
      lot.vendorLevelShortAdjustment = vendorLevelShortAdjustmentForLot;
    }

    return {
      lots: lotArray,
      vendorLevelSummary: {
        totalVendorLevelPayment,
        totalVendorLevelShortAdjustment,
        totalVendorLevelCredits: totalVendorLevelCredits
      }
    };
  } catch (error) {
    throw new Error(`Failed to get vendor lots details: ${error.message}`);
  }
};

/**
 * Record a vendor payment entry (vendor-level only)
 */
const recordVendorPayment = async (vendorId, vendorType, amount, paymentDate, notes, userId) => {
  try {
    const paymentEntry = new VendorPaymentEntry({
      vendorId,
      vendorType,
      paymentScope: 'vendor',
      paymentType: 'payment',
      amount,
      paymentDate: new Date(paymentDate),
      notes,
      createdBy: userId
    });

    await paymentEntry.save();

    // Update vendor balance
    await updateAggregatedBalance(vendorId, vendorType);

    return paymentEntry;
  } catch (error) {
    throw new Error(`Failed to record vendor payment: ${error.message}`);
  }
};

/**
 * Record short quantity adjustment (adjusted as payment) - vendor-level only
 */
const recordShortAdjustment = async (vendorId, vendorType, shortQuantity, shortRate, paymentDate, notes, userId, lotId = null) => {
  try {
    const amount = shortQuantity * shortRate;

    const paymentEntry = new VendorPaymentEntry({
      vendorId,
      vendorType,
      paymentScope: lotId ? 'lot' : 'vendor',
      lotId: lotId || undefined,
      paymentType: 'short_adjustment',
      amount,
      paymentDate: new Date(paymentDate),
      shortQuantity,
      shortRate,
      notes,
      createdBy: userId
    });

    await paymentEntry.save();

    // Update vendor balance
    await updateAggregatedBalance(vendorId, vendorType);
    
    return paymentEntry;
  } catch (error) {
    throw new Error(`Failed to record short adjustment: ${error.message}`);
  }
};

/**
 * Get all payment entries for a vendor
 */
const getVendorPaymentEntries = async (vendorId, vendorType) => {
  try {
    const entries = await VendorPaymentEntry.find({
      vendorId,
      vendorType
    })
    .populate('createdBy', 'username')
    .sort({ paymentDate: -1, createdAt: -1 });

    return entries;
  } catch (error) {
    throw new Error(`Failed to get vendor payment entries: ${error.message}`);
  }
};

/**
 * Update the aggregated vendor balance based on all payment entries
 */
const updateAggregatedBalance = async (vendorId, vendorType) => {
  try {
    // Get all lots with payment details
    const lotsResults = await getVendorLotsDetails(vendorId, vendorType);
    const lotsDetails = (lotsResults && Array.isArray(lotsResults.lots)) ? lotsResults.lots : [];
    
    // Calculate totals
    let totalDue = 0;
    let totalPaid = 0;

    for (const lot of lotsDetails) {
      totalDue += lot.amount;
      totalPaid += (lot.totalPayment || 0) + (lot.shortAdjustmentAmount || 0);
    }

    // Update or create balance record
    let balance = await VendorBalance.findOne({
      vendorId,
      vendorType
    });

    if (!balance) {
      balance = new VendorBalance({
        vendorId,
        vendorType,
        totalDue,
        totalPaid,
        remainingBalance: totalDue - totalPaid
      });
    } else {
      balance.totalDue = totalDue;
      balance.totalPaid = totalPaid;
      balance.remainingBalance = totalDue - totalPaid;
      balance.lastUpdated = new Date();
    }

    await balance.save();
    return balance;
  } catch (error) {
    throw new Error(`Failed to update aggregated balance: ${error.message}`);
  }
};

/**
 * Get vendor balance summary
 */
const getVendorBalance = async (vendorId, vendorType) => {
  try {
    let balance = await VendorBalance.findOne({
      vendorId,
      vendorType
    }).populate('vendorId');

    if (!balance) {
      // If no balance exists, create one
      const lotsResults = await getVendorLotsDetails(vendorId, vendorType);
      const lotsDetails = (lotsResults && Array.isArray(lotsResults.lots)) ? lotsResults.lots : (lotsResults.lots || []);
      let totalDue = 0;
      let totalPaid = 0;

      for (const lot of lotsDetails) {
        totalDue += lot.amount;
        totalPaid += (lot.totalPayment || 0) + (lot.shortAdjustmentAmount || 0);
      }

      balance = new VendorBalance({
        vendorId,
        vendorType,
        totalDue,
        totalPaid,
        remainingBalance: totalDue - totalPaid
      });

      await balance.save();
      balance = await balance.populate('vendorId');
    }

    return balance;
  } catch (error) {
    throw new Error(`Failed to get vendor balance: ${error.message}`);
  }
};

/**
 * Get all payment entries for a vendor lot (deprecated - use getVendorPaymentEntriesForLot)
 */
const getVendorPaymentEntriesForLot = async (vendorId, vendorType, lotId) => {
  try {
    const entries = await VendorPaymentEntry.find({
      vendorId,
      vendorType,
      lotId
    })
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

    return entries;
  } catch (error) {
    throw new Error(`Failed to get payment entries: ${error.message}`);
  }
};

/**
 * Record history for payment entry creation
 */
const recordPaymentEntryHistory = async (entryId, vendorId, vendorType, paymentType, action, beforeData, afterData, userId) => {
  try {
    const historyEntry = new VendorPaymentEntryHistory({
      entryId,
      vendorId,
      vendorType,
      action,
      paymentType,
      beforeData: beforeData || null,
      afterData: afterData || null,
      changedBy: userId
    });

    await historyEntry.save();
    return historyEntry;
  } catch (error) {
    throw new Error(`Failed to record payment entry history: ${error.message}`);
  }
};

/**
 * Get history for a specific payment entry
 */
const getPaymentEntryHistory = async (entryId) => {
  try {
    const history = await VendorPaymentEntryHistory.find({ entryId })
      .populate('changedBy', 'username email')
      .sort({ createdAt: -1 });

    return history;
  } catch (error) {
    throw new Error(`Failed to get payment entry history: ${error.message}`);
  }
};

/**
 * Get history for a vendor (all payment entry changes)
 */
const getVendorPaymentHistory = async (vendorId, vendorType) => {
  try {
    const history = await VendorPaymentEntryHistory.find({
      vendorId,
      vendorType
    })
      .populate('changedBy', 'username email')
      .sort({ createdAt: -1 });

    return history;
  } catch (error) {
    throw new Error(`Failed to get vendor payment history: ${error.message}`);
  }
};

module.exports = {
  getVendorLotsDetails,
  recordVendorPayment,
  recordShortAdjustment,
  updateAggregatedBalance,
  getVendorBalance,
  getVendorPaymentEntries,
  getVendorPaymentEntriesForLot,
  recordPaymentEntryHistory,
  getPaymentEntryHistory,
  getVendorPaymentHistory
};