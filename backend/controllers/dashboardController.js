const { Order, Client, FitStyle, Stitching, Washing, Finishing, VendorBalance, Invoice, AuditLog } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

// Helper function to get date range filter
const getDateRangeFilter = (query) => {
  const filter = {};
  if (query.fromDate && query.toDate) {
    filter.createdAt = {
      $gte: new Date(query.fromDate),
      $lte: new Date(query.toDate)
    };
  }
  return filter;
};

// Orders by Status
const getOrdersByStatus = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const ordersByStatus = await Order.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      },
      { $sort: { status: 1 } }
    ]);

    const labels = ['Status 1', 'Status 2', 'Status 3', 'Status 4', 'Status 5', 'Status 6'];
    const data = Array(6).fill(0);
    ordersByStatus.forEach(item => {
      data[item.status - 1] = item.count;
    });

    res.json({
      labels,
      datasets: [{
        label: 'Number of Orders',
        data,
        backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
        borderColor: ['#2A8CBF', '#CC4B67', '#CCA33D', '#3A9999', '#7A52CC', '#CC7A30'],
        borderWidth: 1
      }]
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching order status data' });
  }
};

// Production Stages
const getProductionStages = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);

    // Stitching Count: Sum of quantity for lotId in Stitching but not in Washing
    const stitchingData = await Stitching.aggregate([
      { $match: { ...dateFilter } },
      {
        $lookup: {
          from: 'Washing',
          localField: 'lotId',
          foreignField: 'lotId',
          as: 'washingRecords'
        }
      },
      { $match: { 'washingRecords': { $size: 0 } } }, // Only lots not in Washing
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$quantity' }
        }
      }
    ]);
    const stitchingCount = stitchingData[0]?.totalQuantity || 0;

    // Washing Count: Sum of quantity from washDetails for lotId in Washing where orderId status is 3
    const washingData = await Washing.aggregate([
      { $match: { ...dateFilter } },
      {
        $lookup: {
          from: 'Order',
          localField: 'orderId',
          foreignField: '_id',
          as: 'orderDetails'
        }
      },
      { $unwind: '$orderDetails' },
      { $match: { 'orderDetails.status': 3 } }, // Only orders with status 3
      { $unwind: '$washDetails' },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$washDetails.quantity' }
        }
      }
    ]);
    const washingCount = washingData[0]?.totalQuantity || 0;

    // Finishing Count: Sum of quantity for all lotId in Finishing (can be adjusted if needed)
    const finishingData = await Finishing.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$quantity' }
        }
      }
    ]);
    const finishingCount = finishingData[0]?.totalQuantity || 0;

    res.json({
      labels: ['Stitching', 'Washing', 'Finishing'],
      datasets: [{
        label: 'Lots in Stage',
        data: [stitchingCount, washingCount, finishingCount],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
        borderColor: ['#CC4B67', '#2A8CBF', '#CCA33D'],
        borderWidth: 1
      }]
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching production stages data' });
  }
};

// Financial Summary: Invoice Status
const getInvoiceStatus = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const userFilter = req.user.role === 'user' ? { userId: req.user._id } : {};
    const invoiceStatus = await Invoice.aggregate([
      { $match: { ...dateFilter, ...userFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    const labels = ['Pending', 'Paid', 'Partial'];
    const data = Array(3).fill(0);
    invoiceStatus.forEach(item => {
      const index = labels.indexOf(item.status.charAt(0).toUpperCase() + item.status.slice(1));
      if (index !== -1) data[index] = item.count;
    });

    res.json({
      labels,
      datasets: [{
        label: 'Invoice Status',
        data,
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
        borderColor: ['#CC4B67', '#2A8CBF', '#CCA33D'],
        borderWidth: 1
      }]
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching invoice status data' });
  }
};

// Vendor Performance: Quantity Shortfalls
const getVendorPerformance = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    
    const stitchingShortfall = await Stitching.aggregate([
      { $match: { ...dateFilter } },
      { $group: { _id: null, avgShortfall: { $avg: '$quantityShort' } } }
    ]);
    
    const washingShortfall = await Washing.aggregate([
      { $match: { ...dateFilter } },
      {
        $unwind: '$washDetails'
      },
      { $group: { _id: null, avgShortfall: { $avg: '$washDetails.quantityShort' } } }
    ]);
    
    const finishingShortfall = await Finishing.aggregate([
      { $match: { ...dateFilter } },
      { $group: { _id: null, avgShortfall: { $avg: '$quantityShort' } } }
    ]);

    res.json({
      labels: ['Stitching Vendors', 'Washing Vendors', 'Finishing Vendors'],
      datasets: [{
        label: 'Average Quantity Shortfall',
        data: [
          stitchingShortfall[0]?.avgShortfall || 0,
          washingShortfall[0]?.avgShortfall || 0,
          finishingShortfall[0]?.avgShortfall || 0
        ],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
        borderColor: ['#CC4B67', '#2A8CBF', '#CCA33D'],
        borderWidth: 1
      }]
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching vendor performance data' });
  }
};

// Audit Log
const getAuditLog = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const auditLogs = await AuditLog.find({ ...dateFilter })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'username')
      .lean();

    res.json({
      data: auditLogs.map(log => ({
        userId: log.userId._id,
        username: log.userId.username,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        details: log.details,
        createdAt: log.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching audit log data' });
  }
};

// Top Fit Styles
const getTopFitStyles = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const topFitStyles = await Order.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: '$fitStyleId',
          totalQuantity: { $sum: '$totalQuantity' }
        }
      },
      {
        $lookup: {
          from: 'FitStyle',
          localField: '_id',
          foreignField: '_id',
          as: 'fitStyle'
        }
      },
      { $unwind: '$fitStyle' },
      {
        $project: {
          name: '$fitStyle.name',
          totalQuantity: 1,
          _id: 0
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      labels: topFitStyles.map(item => item.name),
      datasets: [{
        label: 'Quantity Ordered',
        data: topFitStyles.map(item => item.totalQuantity),
        backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF'],
        borderColor: ['#2A8CBF', '#CC4B67', '#CCA33D', '#3A9999', '#7A52CC'],
        borderWidth: 1
      }]
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching top fit styles data' });
  }
};

module.exports = { getOrdersByStatus, getProductionStages, getInvoiceStatus, getVendorPerformance, getAuditLog, getTopFitStyles };