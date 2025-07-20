const mongoose = require('mongoose');
const { Order, Client, FitStyle, Stitching, Washing, Finishing, VendorBalance, Invoice, AuditLog } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

// Helper function to get date range filter
const getDateRangeFilter = (query) => {
  const filter = {};
  if (query.fromDate && query.toDate) {
    filter.date = {
      $gte: new Date(query.fromDate),
      $lte: new Date(query.toDate)
    };
  }
  return filter;
};

// Helper function to validate ObjectId
const isValidObjectId = (id) => mongoose.isValidObjectId(id);

// Helper function to get monthly trend data
const getMonthlyTrendData = async (fromDate, toDate, category, clientId) => {
  const matchStage = {};
  if (fromDate && toDate) {
    matchStage.date = {
      $gte: new Date(fromDate),
      $lte: new Date(toDate)
    };
  }

  let trendData = [];
  if (category.title === 'Open Orders') {
    matchStage.status = { $in: [1, 2, 3, 4] };
    if (clientId && isValidObjectId(clientId)) {
      matchStage.clientId = new mongoose.Types.ObjectId(clientId);
    }
    trendData = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalQuantity: { $sum: '$finalTotalQuantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.title === 'In Stitching') {
    trendData = await Stitching.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: Order.collection.collectionName,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      { $match: clientId && isValidObjectId(clientId) ? { 'order.clientId': new mongoose.Types.ObjectId(clientId) } : {} },
      {
        $group: {
          _id: {
            year: { $year: '$order.date' }, // Use order.date if Stitching.date is inconsistent
            month: { $month: '$order.date' }
          },
          totalQuantity: { $sum: '$quantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.title === 'In Washing') {
    trendData = await Washing.aggregate([
      { $match: matchStage },
      { $unwind: '$washDetails' },
      {
        $lookup: {
          from: Order.collection.collectionName,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      { $match: clientId && isValidObjectId(clientId) ? { 'order.clientId': new mongoose.Types.ObjectId(clientId) } : {} },
      {
        $group: {
          _id: {
            year: { $year: '$order.date' }, // Use order.date if Washing.date is inconsistent
            month: { $month: '$order.date' }
          },
          totalQuantity: { $sum: '$washDetails.quantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.title === 'In Finishing') {
    trendData = await Finishing.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: Order.collection.collectionName,
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      { $match: clientId && isValidObjectId(clientId) ? { 'order.clientId': new mongoose.Types.ObjectId(clientId) } : {} },
      {
        $group: {
          _id: {
            year: { $year: '$order.date' }, // Use order.date if Finishing.date is inconsistent
            month: { $month: '$order.date' }
          },
          totalQuantity: { $sum: '$quantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.title === 'Completed') {
    matchStage.status = 5;
    if (clientId && isValidObjectId(clientId)) {
      matchStage.clientId = new mongoose.Types.ObjectId(clientId);
    }
    trendData = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalQuantity: { $sum: '$finalTotalQuantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  // Debug: Log if no trend data
  if (trendData.length === 0) {
    console.warn(`No trend data for category: ${category.title}, clientId: ${clientId}, date range: ${fromDate} to ${toDate}`);
  }

  const months = [];
  const quantities = [];
  const startDate = new Date(fromDate);
  const endDate = new Date(toDate);
  let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

  while (currentDate <= endMonth) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const monthName = currentDate.toLocaleDateString('en-US', { month: 'short' });
    months.push(`${monthName} ${year}`);
    const found = trendData.find(item => item._id.year === year && item._id.month === month);
    quantities.push(found ? found.totalQuantity : 0);
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return { labels: months, data: quantities };
};

// Order Status Summary (Overall and by Client) - Quantity and Count-based
const getOrderStatusSummary = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const { fromDate, toDate } = req.query;
    const clientId = req.query.clientId; // Optional clientId filter

    // Format interval string
    const interval = fromDate && toDate
      ? `${new Date(fromDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(toDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
      : 'Custom Range';

    // Define status categories
    const statusCategories = [
      { title: 'Open Orders', statusFilter: { $in: [1, 2, 3, 4] }, trend: 'up' },
      { title: 'In Stitching', statusFilter: 2, trend: 'down' },
      { title: 'In Washing', statusFilter: 3, trend: 'neutral' },
      { title: 'In Finishing', statusFilter: 4, trend: 'neutral' },
      { title: 'Completed', statusFilter: 5, trend: 'up' }
    ];

    // Overall quantities and counts by status
    const overallData = await Promise.all(statusCategories.map(async category => {
      let totalQuantity = 0;
      let count = 0;
      if (category.title === 'Open Orders') {
        const stats = await Order.aggregate([
          { $match: { ...dateFilter, status: { $in: [1, 2, 3, 4] } } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: '$finalTotalQuantity' },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      } else if (category.title === 'In Stitching') {
        const stats = await Stitching.aggregate([
          { $match: dateFilter },
          {
            $lookup: {
              from: Order.collection.collectionName,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order'
            }
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: '$quantity' },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      } else if (category.title === 'In Washing') {
        const stats = await Washing.aggregate([
          { $match: dateFilter },
          { $unwind: '$washDetails' },
          {
            $lookup: {
              from: Order.collection.collectionName,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order'
            }
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: '$washDetails.quantity' },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      } else if (category.title === 'In Finishing') {
        const stats = await Finishing.aggregate([
          { $match: dateFilter },
          {
            $lookup: {
              from: Order.collection.collectionName,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order'
            }
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: '$quantity' },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      } else if (category.title === 'Completed') {
        const stats = await Order.aggregate([
          { $match: { ...dateFilter, status: 5 } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: '$finalTotalQuantity' },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      }
      const trend = await getMonthlyTrendData(fromDate, toDate, category);
      return {
        title: `${category.title} (${count} orders)`,
        value: totalQuantity >= 1000 ? `${(totalQuantity / 1000).toFixed(1)}k` : totalQuantity.toString(),
        interval,
        trend: category.trend,
        data: trend.data,
        labels: trend.labels
      };
    }));

    // Client-specific quantities and counts
    let clientData = [];
    if (clientId && isValidObjectId(clientId)) {
      const client = await Client.findById(clientId).lean();
      const clientName = client ? client.name : 'Unknown Client';

      clientData = await Promise.all(statusCategories.map(async category => {
        let totalQuantity = 0;
        let count = 0;
        if (category.title === 'Open Orders') {
          const stats = await Order.aggregate([
            { $match: { ...dateFilter, clientId: new mongoose.Types.ObjectId(clientId), status: { $in: [1, 2, 3, 4] } } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: '$finalTotalQuantity' },
                count: { $sum: 1 }
              }
            }
          ]);
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        } else if (category.title === 'In Stitching') {
          const stats = await Stitching.aggregate([
            { $match: dateFilter },
            {
              $lookup: {
                from: Order.collection.collectionName,
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
              }
            },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            { $match: { 'order.clientId': new mongoose.Types.ObjectId(clientId) } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: '$quantity' },
                count: { $sum: 1 }
              }
            }
          ]) || [{ _id: null, totalQuantity: 0, count: 0 }];
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        } else if (category.title === 'In Washing') {
          const stats = await Washing.aggregate([
            { $match: dateFilter },
            { $unwind: '$washDetails' },
            {
              $lookup: {
                from: Order.collection.collectionName,
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
              }
            },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            { $match: { 'order.clientId': new mongoose.Types.ObjectId(clientId) } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: '$washDetails.quantity' },
                count: { $sum: 1 }
              }
            }
          ]) || [{ _id: null, totalQuantity: 0, count: 0 }];
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        } else if (category.title === 'In Finishing') {
          const stats = await Finishing.aggregate([
            { $match: dateFilter },
            {
              $lookup: {
                from: Order.collection.collectionName,
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
              }
            },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            { $match: { 'order.clientId': new mongoose.Types.ObjectId(clientId) } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: '$quantity' },
                count: { $sum: 1 }
              }
            }
          ]) || [{ _id: null, totalQuantity: 0, count: 0 }];
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        } else if (category.title === 'Completed') {
          const stats = await Order.aggregate([
            { $match: { ...dateFilter, clientId: new mongoose.Types.ObjectId(clientId), status: 5 } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: '$finalTotalQuantity' },
                count: { $sum: 1 }
              }
            }
          ]);
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        }
        const trend = await getMonthlyTrendData(fromDate, toDate, category, clientId);
        return {
          title: `${category.title} (${clientName}, ${count} orders)`,
          value: totalQuantity >= 1000 ? `${(totalQuantity / 1000).toFixed(1)}k` : totalQuantity.toString(),
          interval,
          trend: category.trend,
          data: trend.data,
          labels: trend.labels
        };
      }));
    } else {
      // Aggregate by client for all clients
      const clientGroups = await Promise.all([
        Order.aggregate([
          { $match: { ...dateFilter, status: { $in: [1, 2, 3, 4, 5] }, clientId: { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$clientId', status: '$status' },
              totalQuantity: { $sum: '$finalTotalQuantity' },
              count: { $sum: 1 }
            }
          }
        ]),
        Stitching.aggregate([
          { $match: dateFilter },
          {
            $lookup: {
              from: Order.collection.collectionName,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order'
            }
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          { $match: { 'order.clientId': { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$order.clientId' },
              totalQuantity: { $sum: '$quantity' },
              count: { $sum: 1 }
            }
          }
        ]),
        Washing.aggregate([
          { $match: dateFilter },
          { $unwind: '$washDetails' },
          {
            $lookup: {
              from: Order.collection.collectionName,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order'
            }
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          { $match: { 'order.clientId': { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$order.clientId' },
              totalQuantity: { $sum: '$washDetails.quantity' },
              count: { $sum: 1 }
            }
          }
        ]),
        Finishing.aggregate([
          { $match: dateFilter },
          {
            $lookup: {
              from: Order.collection.collectionName,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order'
            }
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          { $match: { 'order.clientId': { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$order.clientId' },
              totalQuantity: { $sum: '$quantity' },
              count: { $sum: 1 }
            }
          }
        ])
      ]).then(([orderStats, stitchingStats, washingStats, finishingStats]) => {
        const allStats = [...orderStats, ...stitchingStats, ...washingStats, ...finishingStats].filter(
          curr => curr._id?.clientId && isValidObjectId(curr._id?.clientId)
        );
        return allStats.reduce((acc, curr) => {
          const clientId = curr._id.clientId.toString();
          if (!acc[clientId]) acc[clientId] = { statuses: [] };
          acc[clientId].statuses.push({
            status: curr._id.status || [2, 3, 4].includes(curr._id.status) ? curr._id.status : null,
            totalQuantity: curr.totalQuantity,
            count: curr.count
          });
          return acc;
        }, {});
      });

      const clientIds = Object.keys(clientGroups).filter(isValidObjectId);
      const clients = await Client.find({ _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) } }).lean();
      const clientNameMap = clients.reduce((acc, client) => {
        acc[client._id.toString()] = client.name;
        return acc;
      }, {});

      clientData = clientIds.flatMap(clientId => {
        const clientGroup = clientGroups[clientId];
        const clientName = clientNameMap[clientId] || 'Unknown Client';
        return statusCategories.map(category => {
          let totalQuantity = 0;
          let count = 0;
          if (category.title === 'Open Orders') {
            totalQuantity = clientGroup.statuses
              .filter(item => [1, 2, 3, 4].includes(item.status))
              .reduce((sum, item) => sum + item.totalQuantity, 0);
            count = clientGroup.statuses
              .filter(item => [1, 2, 3, 4].includes(item.status))
              .reduce((sum, item) => sum + item.count, 0);
          } else if (category.title === 'In Stitching') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 2);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          } else if (category.title === 'In Washing') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 3);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          } else if (category.title === 'In Finishing') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 4);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          } else if (category.title === 'Completed') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 5);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          }
          const trend = getMonthlyTrendData(fromDate, toDate, category, clientId);
          return {
            title: `${category.title} (${clientName}, ${count} orders)`,
            value: totalQuantity >= 1000 ? `${(totalQuantity / 1000).toFixed(1)}k` : totalQuantity.toString(),
            interval,
            trend: category.trend,
            data: trend.data,
            labels: trend.labels
          };
        });
      }).flat();
    }

    // Calculate Overall Quantity Since Inception (unfiltered by date or client)
    const overallSinceInception = await Order.aggregate([
      { $match: { status: 5 } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$finalTotalQuantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    const sinceInceptionValue = overallSinceInception[0]?.totalQuantity || 0;
    const sinceInceptionCount = overallSinceInception[0]?.count || 0;
    const sinceInceptionTrend = await getMonthlyTrendData('2023-01-01', new Date().toISOString(), { title: 'Completed' }); // Use a broad range for trend

    const sinceInceptionData = {
      title: `Overall Completed (${sinceInceptionCount} orders)`,
      value: sinceInceptionValue >= 1000 ? `${(sinceInceptionValue / 1000).toFixed(1)}k` : sinceInceptionValue.toString(),
      interval: 'Since Inception',
      trend: 'neutral', // Static trend as it's a cumulative total
      data: sinceInceptionTrend.data,
      labels: sinceInceptionTrend.labels
    };

    res.json({
      overall: overallData,
      byClient: clientData,
      sinceInception: sinceInceptionData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching order status summary' });
  }
};

const getAllClientCompletedQuantities = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const { fromDate, toDate, interval = 'monthly' } = req.query; // Default to monthly if not specified

    // Aggregate order quantities by client and time period based on interval
    const clientMonthlyData = await Order.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: Client.collection.collectionName,
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientDetails'
        }
      },
      { $unwind: '$clientDetails' },
      {
        $group: {
          _id: {
            clientName: '$clientDetails.name',
            year: { $year: '$date' },
            ...(interval === 'monthly' && { month: { $month: '$date' } }),
            ...(interval === 'quarterly' && { quarter: { $concat: [{ $substr: [{ $toString: { $ceil: { $divide: [{ $month: '$date' }, 3] } } }, 0, 1] }, 'Q'] } }),
          },
          totalQuantity: { $sum: '$finalTotalQuantity' }
        }
      },
      {
        $project: {
          clientName: '$_id.clientName',
          year: '$_id.year',
          month: '$_id.month',
          quarter: '$_id.quarter',
          totalQuantity: 1,
          _id: 0
        }
      },
      { $sort: { year: 1, month: 1, quarter: 1 } }
    ]);

    // Structure data for BarChart based on interval
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    let labels = [];
    let clientMap = {};

    if (interval === 'yearly') {
      let currentYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();
      while (currentYear <= endYear) {
        labels.push(currentYear.toString());
        currentYear++;
      }
    } else if (interval === 'quarterly') {
      let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
      while (currentDate <= endMonth) {
        const quarter = Math.ceil((currentDate.getMonth() + 1) / 3) + 'Q';
        const year = currentDate.getFullYear();
        if (!labels.includes(`${year} ${quarter}`)) {
          labels.push(`${year} ${quarter}`);
        }
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    } else { // monthly
      let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
      while (currentDate <= endMonth) {
        const monthName = currentDate.toLocaleDateString('en-US', { month: 'short' });
        const year = currentDate.getFullYear();
        labels.push(`${monthName} ${year}`);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    clientMonthlyData.forEach(item => {
      const key = interval === 'yearly' ? item.year.toString() :
                 interval === 'quarterly' ? `${item.year} ${item.quarter}` :
                 `${new Date(item.year, (item.month || 1) - 1).toLocaleDateString('en-US', { month: 'short' })} ${item.year}`;
      const index = labels.indexOf(key);
      if (index !== -1) {
        if (!clientMap[item.clientName]) {
          clientMap[item.clientName] = Array(labels.length).fill(0);
        }
        clientMap[item.clientName][index] = (clientMap[item.clientName][index] || 0) + item.totalQuantity;
      }
    });

    const barChartSeries = Object.keys(clientMap).map(clientName => ({
      id: clientName.replace(' ', '-').toLowerCase(),
      label: clientName,
      data: clientMap[clientName],
      stack: 'A',
    }));

    // Calculate total quantity and trend
    const totalQuantity = clientMonthlyData.reduce((sum, item) => sum + item.totalQuantity, 0);
    const trend = totalQuantity > 0 ? 'up' : 'neutral';

    // Format interval string
    const intervalLabel = interval === 'yearly' ? 'Yearly' :
                         interval === 'quarterly' ? 'Quarterly' : 'Monthly';
    const intervalText = fromDate && toDate
      ? `${intervalLabel} from ${new Date(fromDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(toDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
      : `${intervalLabel} Range`;

    res.json({
      totalQuantity,
      trend,
      interval: intervalText,
      series: barChartSeries,
      labels,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching client monthly quantities' });
  }
};

// Orders by Status
const getOrdersByStatus = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);
    const ordersByStatus = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const labels = ['Status 1', 'Status 2', 'Status 3', 'Status 4', 'Status 5', 'Status 6'];
    const data = Array(6).fill(0);
    ordersByStatus.forEach(item => {
      data[item._id - 1] = item.count;
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
    console.error(error);
    res.status(500).json({ error: 'Error fetching order status data' });
  }
};

// Production Stages
const getProductionStages = async (req, res) => {
  try {
    const dateFilter = getDateRangeFilter(req.query);

    const stitchingData = await Stitching.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: Washing.collection.collectionName,
          localField: 'lotId',
          foreignField: 'lotId',
          as: 'washingRecords'
        }
      },
      { $match: { 'washingRecords': { $size: 0 } } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$quantity' }
        }
      }
    ]);
    const stitchingCount = stitchingData[0]?.totalQuantity || 0;

    const washingData = await Washing.aggregate([
      { $match: dateFilter },
      { $unwind: '$washDetails' },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$washDetails.quantity' }
        }
      }
    ]);
    const washingCount = washingData[0]?.totalQuantity || 0;

    const finishingData = await Finishing.aggregate([
      { $match: dateFilter },
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
      }
    ]);

    const labels = ['Pending', 'Paid', 'Partial'];
    const data = Array(3).fill(0);
    invoiceStatus.forEach(item => {
      const index = labels.indexOf(item._id.charAt(0).toUpperCase() + item._id.slice(1));
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
      { $match: dateFilter },
      { $group: { _id: null, avgShortfall: { $avg: '$quantityShort' } } }
    ]);

    const washingShortfall = await Washing.aggregate([
      { $match: dateFilter },
      { $unwind: '$washDetails' },
      { $group: { _id: null, avgShortfall: { $avg: '$washDetails.quantityShort' } } }
    ]);

    const finishingShortfall = await Finishing.aggregate([
      { $match: dateFilter },
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
    const auditLogs = await AuditLog.find(dateFilter)
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
      { $match: dateFilter },
      {
        $group: {
          _id: '$fitStyleId',
          totalQuantity: { $sum: '$finalTotalQuantity' }
        }
      },
      {
        $lookup: {
          from: FitStyle.collection.collectionName,
          localField: '_id',
          foreignField: '_id',
          as: 'fitStyle'
        }
      },
      { $unwind: '$fitStyle' },
      {
        $project: {
          name: '$fitStyle.name',
          totalQuantity: 1
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

module.exports = { getOrdersByStatus, getProductionStages, getInvoiceStatus, getVendorPerformance, getAuditLog, getTopFitStyles, getOrderStatusSummary, getAllClientCompletedQuantities };