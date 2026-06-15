const { VendorBalance, VendorPaymentEntry, StitchingVendor, WashingVendor, FinishingVendor, Stitching, Washing, Finishing } = require('../mongodb_schema');
const { 
  getVendorLotsDetails, 
  recordVendorPayment, 
  recordShortAdjustment,
  recordPaymentEntryHistory,
  getPaymentEntryHistory,
  getVendorPaymentHistory,
  getVendorBalance
} = require('../services/vendorBalanceService');
const { logAction } = require('../utils/logger');
const XLSX = require('xlsx');

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

    // Include inactive vendors too — payments to deactivated vendors must still be manageable.
    const vendors = await VendorModel.find({});
    
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

    // if (amount <= 0) {
    //   return res.status(400).json({ error: 'Amount must be greater than 0' });
    // }

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

    // Store before state for history
    const beforeData = {
      amount: entry.amount,
      paymentDate: entry.paymentDate,
      paymentScope: entry.paymentScope,
      lotId: entry.lotId,
      shortQuantity: entry.shortQuantity,
      shortRate: entry.shortRate,
      notes: entry.notes
    };

    // Update fields
    const updateData = {};
    
    // For short_adjustment type, calculate amount from shortQuantity and shortRate
    if (entry.paymentType === 'short_adjustment') {
      if (shortQuantity !== undefined) {
        updateData.shortQuantity = shortQuantity;
      }
      if (shortRate !== undefined) {
        updateData.shortRate = shortRate;
      }
      // Calculate amount based on updated or existing values
      const finalQuantity = shortQuantity !== undefined ? shortQuantity : entry.shortQuantity;
      const finalRate = shortRate !== undefined ? shortRate : entry.shortRate;
      updateData.amount = finalQuantity * finalRate;
    } else {
      // For payment type, use the provided amount
      if (amount !== undefined) {
        updateData.amount = amount;
      }
    }
    
    if (paymentDate) updateData.paymentDate = paymentDate;
    if (notes !== undefined) updateData.notes = notes;
    if (lotId !== undefined) updateData.lotId = lotId;
    updateData.updatedAt = new Date();
    updateData.updatedBy = req.user.userId;

    const updatedEntry = await VendorPaymentEntry.findByIdAndUpdate(
      entryId,
      updateData,
      { new: true }
    ).populate('createdBy', 'username').populate('lotId', 'lotNumber');

    // Store after state for history
    const afterData = {
      amount: updatedEntry.amount,
      paymentDate: updatedEntry.paymentDate,
      paymentScope: updatedEntry.paymentScope,
      lotId: updatedEntry.lotId,
      shortQuantity: updatedEntry.shortQuantity,
      shortRate: updatedEntry.shortRate,
      notes: updatedEntry.notes
    };

    // Record in history table instead of audit log
    await recordPaymentEntryHistory(
      entryId,
      entry.vendorId,
      entry.vendorType,
      entry.paymentType,
      'update',
      beforeData,
      afterData,
      req.user.userId
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

    // Store the entry data before deletion for history
    const deletedData = {
      amount: entry.amount,
      paymentDate: entry.paymentDate,
      paymentScope: entry.paymentScope,
      lotId: entry.lotId,
      shortQuantity: entry.shortQuantity,
      shortRate: entry.shortRate,
      notes: entry.notes
    };

    // Delete the entry
    await VendorPaymentEntry.findByIdAndDelete(entryId);

    // Record in history table instead of audit log
    await recordPaymentEntryHistory(
      entryId,
      entry.vendorId,
      entry.vendorType,
      entry.paymentType,
      'delete',
      deletedData,
      null,
      req.user.userId
    );

    res.json({ message: 'Payment entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get payment entry history (all changes for a specific entry)
 */
const getPaymentEntryChangeHistory = async (req, res) => {
  try {
    const { entryId } = req.params;

    if (!entryId) {
      return res.status(400).json({ error: 'Entry ID required' });
    }

    const history = await getPaymentEntryHistory(entryId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get vendor payment history (all payment entry changes for a vendor)
 */
const getVendorPaymentChangeHistory = async (req, res) => {
  try {
    const { vendorId, vendorType } = req.query;

    if (!vendorId || !vendorType) {
      return res.status(400).json({ error: 'vendorId and vendorType required' });
    }

    if (!['stitching', 'washing', 'finishing'].includes(vendorType)) {
      return res.status(400).json({ error: 'Invalid vendor type' });
    }

    const history = await getVendorPaymentHistory(vendorId, vendorType);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export lots data to Excel
 */
const exportLotsToExcel = async (req, res) => {
  try {
    const { vendorId, vendorType } = req.query;

    if (!vendorId || !vendorType) {
      return res.status(400).json({ error: 'vendorId and vendorType required' });
    }

    if (!['stitching', 'washing', 'finishing'].includes(vendorType)) {
      return res.status(400).json({ error: 'Invalid vendor type' });
    }

    const result = await getVendorLotsDetails(vendorId, vendorType);
    const lotsData = result.lots;

    if (!lotsData || lotsData.length === 0) {
      return res.status(404).json({ error: 'No lots data found for export' });
    }

    // Get vendor name for filename
    const VendorModel = {
      'stitching': StitchingVendor,
      'washing': WashingVendor,
      'finishing': FinishingVendor
    }[vendorType];

    const vendor = await VendorModel.findById(vendorId);
    const vendorName = vendor ? vendor.name : 'Unknown';

    const exportData = [];

    if (vendorType === 'washing') {
      // For washing, expand each lot into multiple rows for wash details
      lotsData.forEach(lot => {
        if (lot.washDetails && lot.washDetails.length > 0) {
          lot.washDetails.forEach(wash => {
            exportData.push({
              'Date': new Date(lot.date).toLocaleDateString('en-IN'),
              'Lot Number': lot.lotNumber,
              'Client': lot.clientName,
              'Wash Color': wash.washColor,
              'Wash Creation': wash.washCreation,
              'Quantity': wash.quantity,
              'Rate': wash.rate,
              'Amount': wash.amount,
              'Short Qty': wash.quantityShort || 0,
              'Short Desc': wash.quantityShortDesc || '',
              'Total Payment': lot.totalPayment || 0,
              'Short Adjustment': lot.shortAdjustmentAmount || 0,
              'Balance': lot.balance || 0
            });
          });
        } else {
          // Fallback for lots without wash details
          exportData.push({
            'Date': new Date(lot.date).toLocaleDateString('en-IN'),
            'Lot Number': lot.lotNumber,
            'Client': lot.clientName,
            'Wash Color': '-',
            'Wash Creation': '-',
            'Quantity': lot.quantity,
            'Rate': lot.rate,
            'Amount': lot.amount,
            'Short Qty': lot.quantityShort || 0,
            'Short Desc': '',
            'Total Payment': lot.totalPayment || 0,
            'Short Adjustment': lot.shortAdjustmentAmount || 0,
            'Balance': lot.balance || 0
          });
        }
      });
    } else {
      // For stitching and finishing, use original format
      lotsData.forEach(lot => {
        exportData.push({
          'Date': new Date(lot.date).toLocaleDateString('en-IN'),
          'Lot Number': lot.lotNumber,
          'Client': lot.clientName,
          'Quantity': lot.quantity,
          'Rate': lot.rate,
          'Amount': lot.amount,
          'Short Qty': lot.quantityShort || 0,
          'Total Payment': lot.totalPayment || 0,
          'Short Adjustment': lot.shortAdjustmentAmount || 0,
          'Balance': lot.balance || 0
        });
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lots Data');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    const fileName = `${vendorType}_${vendorName}_Lots_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export lots error:', error);
    res.status(500).json({ error: 'Failed to export lots data' });
  }
};

/**
 * Export payment entries to Excel
 */
const exportPaymentsToExcel = async (req, res) => {
  try {
    const { vendorId, vendorType } = req.query;

    if (!vendorId || !vendorType) {
      return res.status(400).json({ error: 'vendorId and vendorType required' });
    }

    if (!['stitching', 'washing', 'finishing'].includes(vendorType)) {
      return res.status(400).json({ error: 'Invalid vendor type' });
    }

    const entries = await VendorPaymentEntry.find({
      vendorId,
      vendorType
    })
    .populate('createdBy', 'username')
    .populate('lotId', 'lotNumber')
    .sort({ paymentDate: -1, createdAt: -1 });

    if (!entries || entries.length === 0) {
      return res.status(404).json({ error: 'No payment data found for export' });
    }

    // Get vendor name for filename
    const VendorModel = {
      'stitching': StitchingVendor,
      'washing': WashingVendor,
      'finishing': FinishingVendor
    }[vendorType];

    const vendor = await VendorModel.findById(vendorId);
    const vendorName = vendor ? vendor.name : 'Unknown';

    const exportData = entries.map(entry => ({
      'Payment Date': new Date(entry.paymentDate).toLocaleDateString('en-IN'),
      'Lot Number': entry.lotId?.lotNumber || '-',
      'Type': entry.paymentType === 'payment' ? 'Payment' : 'Short Adjustment',
      'Amount': entry.amount,
      'Short Quantity': entry.shortQuantity || 0,
      'Short Rate': entry.shortRate || 0,
      'Notes': entry.notes || '',
      'Created By': entry.createdBy?.username || 'Unknown',
      'Created Date': new Date(entry.createdAt).toLocaleDateString('en-IN'),
      'Updated Date': entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString('en-IN') : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment History');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    const fileName = `${vendorType}_${vendorName}_Payments_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export payments error:', error);
    res.status(500).json({ error: 'Failed to export payment data' });
  }
};

/**
 * Toggle (or set) a lot's "paid" marker for a vendor — flips isPaid on the underlying
 * Stitching/Washing/Finishing record. Just a settled flag (row disabled in the UI).
 */
const markLotPaid = async (req, res) => {
  try {
    const { vendorType, lotId, vendorId, isPaid } = req.body;
    if (!vendorType || !lotId) return res.status(400).json({ error: 'vendorType and lotId required' });
    const Model = { stitching: Stitching, washing: Washing, finishing: Finishing }[vendorType];
    if (!Model) return res.status(400).json({ error: 'Invalid vendor type' });

    const query = { lotId };
    if (vendorId) query.vendorId = vendorId;
    const record = await Model.findOne(query);
    if (!record) return res.status(404).json({ error: 'Production record not found' });

    record.isPaid = isPaid === undefined ? !record.isPaid : !!isPaid;
    record.paidAt = record.isPaid ? new Date() : null;
    await record.save();

    const entity = vendorType.charAt(0).toUpperCase() + vendorType.slice(1); // Stitching/Washing/Finishing
    await logAction(req.user.userId, 'mark_lot_paid', entity, record._id, `Marked ${vendorType} lot ${record.isPaid ? 'paid' : 'unpaid'}`);
    res.json({ recordId: record._id, lotId, isPaid: record.isPaid });
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
  deletePaymentEntry,
  getPaymentEntryChangeHistory,
  getVendorPaymentChangeHistory,
  markLotPaid,
  exportLotsToExcel,
  exportPaymentsToExcel
};