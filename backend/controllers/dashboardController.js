const mongoose = require('mongoose');
const { Lot, Client, FitStyle, Stitching, Washing, Finishing, VendorBalance, Invoice, AuditLog, StitchingVendor, WashingVendor } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');
const { getOrSet, TTL } = require('../services/cache');

// Dashboard aggregations are expensive and depend on many write paths (lots, stitching,
// washing, finishing, invoices), so precise invalidation isn't practical. They use a SHORT
// TTL instead — slightly stale dashboard numbers are acceptable. (Correctness-critical reads
// like ledgers use version bumps, not TTL.) One shared namespace; we never bump it.
const DASH = 'dashboard';
const DASH_TTL = TTL.dashboard; // env CACHE_TTL_DASHBOARD (default 600s / 10 min)

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
// `houseClientIds` are Client._id values flagged isInternal (house labels such as GREYSAGE).
// They own lots but have no buyer, so the Completed series is scoped by `category.ownerScope`:
//   'assigned' → lots produced for a real customer
//   'house'    → in-house stock with no committed buyer
//   undefined  → both (used when a single client is already selected, which pins ownership)
const getMonthlyTrendData = async (fromDate, toDate, category, clientId, houseClientIds = []) => {
  const matchStage = {};
  if (fromDate && toDate) {
    matchStage.date = {
      $gte: new Date(fromDate),
      $lte: new Date(toDate)
    };
  }

  let trendData = [];
  if (category.key === 'activeLots') {
    matchStage.status = { $in: [2, 3, 4] };
    if (clientId && isValidObjectId(clientId)) {
      matchStage.clientId = new mongoose.Types.ObjectId(clientId);
    }
    trendData = await Lot.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: Stitching.collection.collectionName,
          localField: '_id',
          foreignField: 'lotId',
          as: 'stitching'
        }
      },
      { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.key === 'inStitching') {
    if (clientId && isValidObjectId(clientId)) {
      trendData = await Stitching.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: Lot.collection.collectionName,
            localField: 'lotId',
            foreignField: '_id',
            as: 'lot'
          }
        },
        { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
        { $match: { 'lot.clientId': new mongoose.Types.ObjectId(clientId) } },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            totalQuantity: { $sum: '$quantity' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);
    } else {
      trendData = await Stitching.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            totalQuantity: { $sum: '$quantity' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);
    }
  } else if (category.key === 'inWashing') {
    const washMatch = clientId && isValidObjectId(clientId)
      ? [
          { $lookup: { from: Lot.collection.collectionName, localField: 'lotId', foreignField: '_id', as: 'lot' } },
          { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
          { $match: { 'lot.clientId': new mongoose.Types.ObjectId(clientId) } },
        ]
      : [];
    trendData = await Washing.aggregate([
      { $match: matchStage },
      { $unwind: '$washDetails' },
      ...washMatch,
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalQuantity: { $sum: '$washDetails.quantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.key === 'inFinishing') {
    const finMatch = clientId && isValidObjectId(clientId)
      ? [
          { $lookup: { from: Lot.collection.collectionName, localField: 'lotId', foreignField: '_id', as: 'lot' } },
          { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
          { $match: { 'lot.clientId': new mongoose.Types.ObjectId(clientId) } },
        ]
      : [];
    trendData = await Finishing.aggregate([
      { $match: matchStage },
      ...finMatch,
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalQuantity: { $sum: '$quantity' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  } else if (category.key === 'completed') {
    matchStage.status = 5;
    if (clientId && isValidObjectId(clientId)) {
      matchStage.clientId = new mongoose.Types.ObjectId(clientId);
    } else if (category.ownerScope === 'house') {
      matchStage.clientId = { $in: houseClientIds };   // empty list ⇒ no lots, card reads 0
    } else if (category.ownerScope === 'assigned') {
      matchStage.clientId = { $nin: houseClientIds };  // empty list ⇒ every lot, i.e. old behaviour
    }
    trendData = await Lot.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: Stitching.collection.collectionName,
          localField: '_id',
          foreignField: 'lotId',
          as: 'stitching'
        }
      },
      { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } }
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

// Lot Status Summary (replaces Order Status Summary)
const getOrderStatusSummary = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['orderStatusSummary-v2', req.query.fromDate, req.query.toDate, req.query.clientId], DASH_TTL, async () => {
    const dateFilter = getDateRangeFilter(req.query);
    const { fromDate, toDate } = req.query;
    const clientId = req.query.clientId;

    const interval = fromDate && toDate
      ? `${new Date(fromDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(toDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
      : 'Custom Range';

    // House labels (Client.isInternal) own lots that have no committed buyer. Resolved once
    // per request and threaded through the Completed aggregations below.
    const houseClientIds = (await Client.find({ isInternal: true }).select('_id').lean()).map((c) => c._id);

    const productionCategories = [
      { key: 'activeLots', title: 'Active Lots', statusFilter: { $in: [2, 3, 4] }, trend: 'up' },
      { key: 'inStitching', title: 'In Stitching', statusFilter: 2, trend: 'down' },
      { key: 'inWashing', title: 'In Washing', statusFilter: 3, trend: 'neutral' },
      { key: 'inFinishing', title: 'In Finishing', statusFilter: 4, trend: 'neutral' }
    ];

    // Status 5 (Finished/Ready) used to imply "ready to ship to a known client", because every
    // lot had a buyer. House labels break that: some finished lots are unsold stock. Those are
    // two different questions — one logistics, one working capital — so they get two cards.
    const statusCategories = [
      ...productionCategories,
      { key: 'completed', title: 'Completed', statusFilter: 5, trend: 'up', ownerScope: 'assigned' },
      { key: 'completed', title: 'Completed · In-house', statusFilter: 5, trend: 'neutral', ownerScope: 'house' }
    ];

    // Selecting one client already pins ownership, so the split would be one populated card and
    // one permanent zero. Collapse back to a single unscoped Completed card for that view.
    const clientCategories = [
      ...productionCategories,
      { key: 'completed', title: 'Completed', statusFilter: 5, trend: 'up' }
    ];

    // Overall quantities and counts by status
    const overallData = await Promise.all(statusCategories.map(async category => {
      let totalQuantity = 0;
      let count = 0;
      if (category.key === 'activeLots') {
        const stats = await Lot.aggregate([
          { $match: { ...dateFilter, status: { $in: [2, 3, 4] } } },
          {
            $lookup: {
              from: Stitching.collection.collectionName,
              localField: '_id',
              foreignField: 'lotId',
              as: 'stitching'
            }
          },
          { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      } else if (category.key === 'inStitching') {
        const stats = await Stitching.aggregate([
          { $match: dateFilter },
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
      } else if (category.key === 'inWashing') {
        const stats = await Washing.aggregate([
          { $match: dateFilter },
          { $unwind: '$washDetails' },
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
      } else if (category.key === 'inFinishing') {
        const stats = await Finishing.aggregate([
          { $match: dateFilter },
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
      } else if (category.key === 'completed') {
        const ownerMatch = category.ownerScope === 'house'
          ? { clientId: { $in: houseClientIds } }
          : category.ownerScope === 'assigned'
            ? { clientId: { $nin: houseClientIds } }
            : {};
        const stats = await Lot.aggregate([
          { $match: { ...dateFilter, ...ownerMatch, status: 5 } },
          {
            $lookup: {
              from: Stitching.collection.collectionName,
              localField: '_id',
              foreignField: 'lotId',
              as: 'stitching'
            }
          },
          { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } },
              count: { $sum: 1 }
            }
          }
        ]);
        totalQuantity = stats[0]?.totalQuantity || 0;
        count = stats[0]?.count || 0;
      }
      const trend = await getMonthlyTrendData(fromDate, toDate, category, null, houseClientIds);
      return {
        title: `${category.title} / (${count} lots)`,
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

      clientData = await Promise.all(clientCategories.map(async category => {
        let totalQuantity = 0;
        let count = 0;
        if (category.key === 'activeLots') {
          const stats = await Lot.aggregate([
            { $match: { ...dateFilter, clientId: new mongoose.Types.ObjectId(clientId), status: { $in: [2, 3, 4] } } },
            {
              $lookup: {
                from: Stitching.collection.collectionName,
                localField: '_id',
                foreignField: 'lotId',
                as: 'stitching'
              }
            },
            { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } },
                count: { $sum: 1 }
              }
            }
          ]);
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        } else if (category.key === 'inStitching') {
          const stats = await Stitching.aggregate([
            { $match: dateFilter },
            {
              $lookup: {
                from: Lot.collection.collectionName,
                localField: 'lotId',
                foreignField: '_id',
                as: 'lot'
              }
            },
            { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
            { $match: { 'lot.clientId': new mongoose.Types.ObjectId(clientId) } },
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
        } else if (category.key === 'inWashing') {
          const stats = await Washing.aggregate([
            { $match: dateFilter },
            { $unwind: '$washDetails' },
            {
              $lookup: {
                from: Lot.collection.collectionName,
                localField: 'lotId',
                foreignField: '_id',
                as: 'lot'
              }
            },
            { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
            { $match: { 'lot.clientId': new mongoose.Types.ObjectId(clientId) } },
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
        } else if (category.key === 'inFinishing') {
          const stats = await Finishing.aggregate([
            { $match: dateFilter },
            {
              $lookup: {
                from: Lot.collection.collectionName,
                localField: 'lotId',
                foreignField: '_id',
                as: 'lot'
              }
            },
            { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
            { $match: { 'lot.clientId': new mongoose.Types.ObjectId(clientId) } },
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
        } else if (category.key === 'completed') {
          const stats = await Lot.aggregate([
            { $match: { ...dateFilter, clientId: new mongoose.Types.ObjectId(clientId), status: 5 } },
            {
              $lookup: {
                from: Stitching.collection.collectionName,
                localField: '_id',
                foreignField: 'lotId',
                as: 'stitching'
              }
            },
            { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } },
                count: { $sum: 1 }
              }
            }
          ]);
          totalQuantity = stats[0]?.totalQuantity || 0;
          count = stats[0]?.count || 0;
        }
        const trend = await getMonthlyTrendData(fromDate, toDate, category, clientId);
        return {
          title: `${category.title} (${clientName}, / ${count} lots)`,
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
        Lot.aggregate([
          { $match: { ...dateFilter, status: { $in: [2, 3, 4, 5] }, clientId: { $ne: null, $type: 'objectId' } } },
          {
            $lookup: {
              from: Stitching.collection.collectionName,
              localField: '_id',
              foreignField: 'lotId',
              as: 'stitching'
            }
          },
          { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { clientId: '$clientId', status: '$status' },
              totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } },
              count: { $sum: 1 }
            }
          }
        ]),
        Stitching.aggregate([
          { $match: dateFilter },
          {
            $lookup: {
              from: Lot.collection.collectionName,
              localField: 'lotId',
              foreignField: '_id',
              as: 'lot'
            }
          },
          { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
          { $match: { 'lot.clientId': { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$lot.clientId' },
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
              from: Lot.collection.collectionName,
              localField: 'lotId',
              foreignField: '_id',
              as: 'lot'
            }
          },
          { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
          { $match: { 'lot.clientId': { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$lot.clientId' },
              totalQuantity: { $sum: '$washDetails.quantity' },
              count: { $sum: 1 }
            }
          }
        ]),
        Finishing.aggregate([
          { $match: dateFilter },
          {
            $lookup: {
              from: Lot.collection.collectionName,
              localField: 'lotId',
              foreignField: '_id',
              as: 'lot'
            }
          },
          { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
          { $match: { 'lot.clientId': { $ne: null, $type: 'objectId' } } },
          {
            $group: {
              _id: { clientId: '$lot.clientId' },
              totalQuantity: { $sum: '$quantity' },
              count: { $sum: 1 }
            }
          }
        ])
      ]).then(([lotStats, stitchingStats, washingStats, finishingStats]) => {
        const allStats = [...lotStats, ...stitchingStats, ...washingStats, ...finishingStats].filter(
          curr => curr._id?.clientId && isValidObjectId(curr._id?.clientId)
        );
        return allStats.reduce((acc, curr) => {
          const clientId = curr._id.clientId.toString();
          if (!acc[clientId]) acc[clientId] = { statuses: [] };
          acc[clientId].statuses.push({
            status: curr._id.status || null,
            totalQuantity: curr.totalQuantity,
            count: curr.count
          });
          return acc;
        }, {});
      });

      const clientIds = Object.keys(clientGroups).filter(isValidObjectId);
      const clients = await Client.find({ _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) } }).lean();
      const clientNameMap = clients.reduce((acc, client) => {
        // House labels are kept in this breakdown — the production is real and consumed real
        // capacity — but marked, so nobody reads GREYSAGE as a customer.
        acc[client._id.toString()] = client.isInternal ? `${client.name} (in-house)` : client.name;
        return acc;
      }, {});

      clientData = await Promise.all(clientIds.flatMap(clientId => {
        const clientGroup = clientGroups[clientId];
        const clientName = clientNameMap[clientId] || 'Unknown Client';
        return clientCategories.map(async category => {
          let totalQuantity = 0;
          let count = 0;
          if (category.key === 'activeLots') {
            totalQuantity = clientGroup.statuses
              .filter(item => [2, 3, 4].includes(item.status))
              .reduce((sum, item) => sum + item.totalQuantity, 0);
            count = clientGroup.statuses
              .filter(item => [2, 3, 4].includes(item.status))
              .reduce((sum, item) => sum + item.count, 0);
          } else if (category.key === 'inStitching') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 2);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          } else if (category.key === 'inWashing') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 3);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          } else if (category.key === 'inFinishing') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 4);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          } else if (category.key === 'completed') {
            const statusMatch = clientGroup.statuses.find(item => item.status === 5);
            totalQuantity = statusMatch ? statusMatch.totalQuantity : 0;
            count = statusMatch ? statusMatch.count : 0;
          }
          const trend = await getMonthlyTrendData(fromDate, toDate, category, clientId);
          return {
            title: `${category.title} (${clientName}, / ${count} lots)`,
            value: totalQuantity >= 1000 ? `${(totalQuantity / 1000).toFixed(1)}k` : totalQuantity.toString(),
            interval,
            trend: category.trend,
            data: trend.data,
            labels: trend.labels
          };
        });
      }));
    }

    // Calculate Overall Quantity Since Inception (unfiltered by date or client)
    const overallSinceInception = await Lot.aggregate([
      { $match: { status: 5 } },
      {
        $lookup: {
          from: Stitching.collection.collectionName,
          localField: '_id',
          foreignField: 'lotId',
          as: 'stitching'
        }
      },
      { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } },
          count: { $sum: 1 }
        }
      }
    ]);
    const sinceInceptionValue = overallSinceInception[0]?.totalQuantity || 0;
    const sinceInceptionCount = overallSinceInception[0]?.count || 0;
    const sinceInceptionTrend = await getMonthlyTrendData('2023-01-01', new Date().toISOString(), { title: 'Completed' });

    const sinceInceptionData = {
      title: `Overall Completed / (${sinceInceptionCount} lots)`,
      value: sinceInceptionValue >= 1000 ? `${(sinceInceptionValue / 1000).toFixed(1)}k` : sinceInceptionValue.toString(),
      interval: 'Since Inception',
      trend: 'neutral',
      data: sinceInceptionTrend.data,
      labels: sinceInceptionTrend.labels
    };

    return {
      overall: overallData,
      byClient: clientData,
      sinceInception: sinceInceptionData
    };
    });
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching lot status summary' });
  }
};

const getAllClientCompletedQuantities = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['clientCompletedQty-v2', req.query.fromDate, req.query.toDate, req.query.interval || 'monthly'], DASH_TTL, async () => {
    const dateFilter = getDateRangeFilter(req.query);
    const { fromDate, toDate, interval = 'monthly' } = req.query;

    // Aggregate lot quantities by client and time period (joining Stitching for quantity)
    const clientMonthlyData = await Lot.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: Stitching.collection.collectionName,
          localField: '_id',
          foreignField: 'lotId',
          as: 'stitching'
        }
      },
      { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
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
            // House labels stay in the chart — the capacity was really consumed — but are
            // flagged so "Total Quantity by Client" can't be misread as customer demand.
            isHouse: { $ifNull: ['$clientDetails.isInternal', false] },
            year: { $year: '$date' },
            ...(interval === 'monthly' && { month: { $month: '$date' } }),
            ...(interval === 'quarterly' && { quarter: { $concat: [{ $substr: [{ $toString: { $ceil: { $divide: [{ $month: '$date' }, 3] } } }, 0, 1] }, 'Q'] } }),
          },
          totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } }
        }
      },
      {
        $project: {
          clientName: '$_id.clientName',
          isHouse: '$_id.isHouse',
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
          clientMap[item.clientName] = { isHouse: !!item.isHouse, data: Array(labels.length).fill(0) };
        }
        clientMap[item.clientName].data[index] += item.totalQuantity;
      }
    });

    const barChartSeries = Object.keys(clientMap).map(clientName => ({
      id: clientName.replace(' ', '-').toLowerCase(),
      // The chart legend is hidden, so the series label IS the tooltip text — the marker has
      // to live in the label itself to be visible anywhere.
      label: clientMap[clientName].isHouse ? `${clientName} (in-house)` : clientName,
      isHouse: clientMap[clientName].isHouse,
      data: clientMap[clientName].data,
      stack: 'A',
    }));

    // Calculate total quantity and trend
    const totalQuantity = clientMonthlyData.reduce((sum, item) => sum + item.totalQuantity, 0);
    // Split out so the card can say what share of the headline has no buyer behind it.
    const houseQuantity = clientMonthlyData
      .filter(item => item.isHouse)
      .reduce((sum, item) => sum + item.totalQuantity, 0);
    const customerQuantity = totalQuantity - houseQuantity;
    const trend = totalQuantity > 0 ? 'up' : 'neutral';

    // Format interval string
    const intervalLabel = interval === 'yearly' ? 'Yearly' :
                         interval === 'quarterly' ? 'Quarterly' : 'Monthly';
    const intervalText = fromDate && toDate
      ? `${intervalLabel} from ${new Date(fromDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(toDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
      : `${intervalLabel} Range`;

    return {
      totalQuantity,
      customerQuantity,
      houseQuantity,
      trend,
      interval: intervalText,
      series: barChartSeries,
      labels,
    };
    });
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching client monthly quantities' });
  }
};

// Lots by Status (replaces Orders by Status)
const getOrdersByStatus = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['ordersByStatus', req.query.fromDate, req.query.toDate], DASH_TTL, async () => {
    const dateFilter = getDateRangeFilter(req.query);
    const lotsByStatus = await Lot.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const labels = ['Stitching', 'Washing', 'Finishing', 'Finished', 'Partially Dispatched', 'Dispatched'];
    const data = Array(6).fill(0);
    lotsByStatus.forEach(item => {
      const idx = item._id - 2; // status 2 maps to index 0
      if (idx >= 0 && idx < 6) data[idx] = item.count;
    });

    return {
      labels,
      datasets: [{
        label: 'Number of Lots',
        data,
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#2AA89A'],
        borderColor: ['#CC4B67', '#2A8CBF', '#CCA33D', '#3A9999', '#7A52CC', '#1F8077'],
        borderWidth: 1
      }]
    };
    });
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching lot status data' });
  }
};

// Production Stages
const getProductionStages = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['productionStages', req.query.fromDate, req.query.toDate], DASH_TTL, async () => {
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

    return {
      labels: ['Stitching', 'Washing', 'Finishing'],
      datasets: [{
        label: 'Lots in Stage',
        data: [stitchingCount, washingCount, finishingCount],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
        borderColor: ['#CC4B67', '#2A8CBF', '#CCA33D'],
        borderWidth: 1
      }]
    };
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching production stages data' });
  }
};

// Financial Summary: Invoice Status
const getInvoiceStatus = async (req, res) => {
  try {
    // NOTE: this chart was silently broken and always rendered zeros. Two causes,
    // both fixed here:
    //   1. It bucketed into ['Pending','Paid','Partial'], which are statuses from the
    //      OLD skeletal Invoice schema deleted in the 2026-05 Sales rewrite. The live
    //      enum is ['draft','issued','cancelled'], so nothing ever matched.
    //   2. It filtered on `req.user._id`, but the JWT payload is { userId, role } —
    //      `_id` is undefined. That also poisoned the cache key below, so every
    //      non-admin shared a single cache entry keyed on the string "undefined".
    //      Invoice has no per-user ownership field at all, so the filter is dropped.
    const payload = await getOrSet(DASH, ['invoiceStatus', req.query.fromDate, req.query.toDate], DASH_TTL, async () => {
    const dateFilter = getDateRangeFilter(req.query);
    const invoiceStatus = await Invoice.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statuses = ['draft', 'issued', 'cancelled'];
    const labels = ['Draft', 'Issued', 'Cancelled'];
    const data = Array(statuses.length).fill(0);
    invoiceStatus.forEach(item => {
      const index = statuses.indexOf(String(item._id || '').toLowerCase());
      if (index !== -1) data[index] = item.count;
    });

    return {
      labels,
      datasets: [{
        label: 'Invoice Status',
        data,
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
        borderColor: ['#CC4B67', '#2A8CBF', '#CCA33D'],
        borderWidth: 1
      }]
    };
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching invoice status data' });
  }
};

// Vendor Performance: Quantity Shortfalls
const getVendorPerformance = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['vendorPerformance', req.query.fromDate, req.query.toDate], DASH_TTL, async () => {
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

    return {
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
    };
    });
    res.json(payload);
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

// Top Fit Styles (from Lot.fitStyleId + Stitching for quantities)
const getTopFitStyles = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['topFitStyles', req.query.fromDate, req.query.toDate], DASH_TTL, async () => {
    const dateFilter = getDateRangeFilter(req.query);
    const topFitStyles = await Lot.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: Stitching.collection.collectionName,
          localField: '_id',
          foreignField: 'lotId',
          as: 'stitching'
        }
      },
      { $unwind: { path: '$stitching', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$fitStyleId',
          totalQuantity: { $sum: { $subtract: [{ $ifNull: ['$stitching.quantity', 0] }, { $ifNull: ['$stitching.quantityShort', 0] }] } }
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

    return {
      labels: topFitStyles.map(item => item.name),
      datasets: [{
        label: 'Quantity Ordered',
        data: topFitStyles.map(item => item.totalQuantity),
        backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF'],
        borderColor: ['#2A8CBF', '#CC4B67', '#CCA33D', '#3A9999', '#7A52CC'],
        borderWidth: 1
      }]
    };
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching top fit styles data' });
  }
};

// Production Dashboard (mirrors DashboardExcel logic using MongoDB data)
const getProductionDashboard = async (req, res) => {
  try {
    const payload = await getOrSet(DASH, ['productionDashboard', req.query.fromDate, req.query.toDate], DASH_TTL, async () => {
    const startTime = Date.now();
    const { fromDate, toDate } = req.query;

    // Build date filter for stitching
    const stitchingMatch = {};
    if (fromDate || toDate) {
      stitchingMatch.date = {};
      if (fromDate) stitchingMatch.date.$gte = new Date(fromDate);
      if (toDate) stitchingMatch.date.$lte = new Date(toDate);
    }

    // Aggregation pipeline for stitching - single query with $lookup joins
    const stitchingRecords = await Stitching.aggregate([
      { $match: stitchingMatch },
      { $lookup: { from: 'lots', localField: 'lotId', foreignField: '_id', as: 'lot' } },
      { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'clients', localField: 'lot.clientId', foreignField: '_id', as: 'client' } },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'stitchingvendors', localField: 'vendorId', foreignField: '_id', as: 'vendor' } },
      { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } },
      { $project: {
        _lotId: '$lot._id',
        lotNumber: '$lot.lotNumber',
        quantity: 1,
        quantityShort: 1,
        clientName: { $ifNull: ['$client.name', 'Unknown'] },
        stitchingVendorName: { $ifNull: ['$vendor.name', 'Unknown'] }
      }}
    ]);

    // Get lot IDs for scoped washing query
    const lotIds = stitchingRecords.map(s => s._lotId).filter(Boolean);

    // Aggregation pipeline for washing - only for matched lots
    const washingRecords = await Washing.aggregate([
      { $match: { lotId: { $in: lotIds } } },
      { $lookup: { from: 'washingvendors', localField: 'vendorId', foreignField: '_id', as: 'vendor' } },
      { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } },
      { $project: {
        lotId: 1,
        washerName: { $ifNull: ['$vendor.name', 'Unknown'] },
        washOutDate: 1,
        washDetails: 1
      }}
    ]);

    // Build a map of lotId -> washing record for quick lookup
    const washingByLot = {};
    for (const w of washingRecords) {
      const lotId = w.lotId?.toString();
      if (lotId) washingByLot[lotId] = w;
    }

    // Build lot-level data from stitching records (subtract stitching quantityShort)
    const lotData = {};
    for (const st of stitchingRecords) {
      const lotId = st._lotId?.toString();
      if (!lotId) continue;
      lotData[lotId] = {
        quantity: (st.quantity || 0) - (st.quantityShort || 0),
        clientName: st.clientName,
        lotNumber: st.lotNumber || '',
        washerName: null,
        status: 'making',
      };
    }

    // Update status from washing records and subtract washing quantityShort
    for (const [lotId, washing] of Object.entries(washingByLot)) {
      if (!lotData[lotId]) continue;
      lotData[lotId].washerName = washing.washerName;
      lotData[lotId].status = washing.washOutDate ? 'outWashing' : 'inWashing';
      // Subtract washing shorts from washDetails
      const washShort = (washing.washDetails || []).reduce((sum, d) => sum + (d.quantityShort || 0), 0);
      lotData[lotId].quantity -= washShort;
    }

    // Query finishing records and subtract finishing quantityShort
    const finishingRecords = await Finishing.find({ lotId: { $in: lotIds } }).lean();
    for (const fr of finishingRecords) {
      const lotId = fr.lotId?.toString();
      if (!lotId || !lotData[lotId]) continue;
      lotData[lotId].quantity -= (fr.quantityShort || 0);
    }

    // Filter stitching records for lots not in washing or finishing
    const lotsInWashing = new Set(washingRecords.map(w => w.lotId?.toString()).filter(Boolean));
    const lotsInFinishing = new Set(finishingRecords.map(f => f.lotId?.toString()).filter(Boolean));
    const filteredStitchingRecords = stitchingRecords.filter(st => {
      const lotId = st._lotId?.toString();
      return lotId && !lotsInWashing.has(lotId) && !lotsInFinishing.has(lotId);
    });

    // Compute KPIs, client summary, washer summary, breakdown
    let totalPcs = 0, totalMaking = 0, totalInWashing = 0, totalOutWashing = 0;
    const clientMap = {};
    const washerMap = {};
    const breakdownMap = {};

    for (const lot of Object.values(lotData)) {
      const { quantity, clientName, lotNumber, washerName, status } = lot;
      totalPcs += quantity;

      // Client map
      if (!clientMap[clientName]) clientMap[clientName] = { total: 0, making: 0, inWashing: 0, outWashing: 0 };
      clientMap[clientName].total += quantity;

      // Washer map
      const washer = washerName || '\u2014';
      if (washerName) {
        if (!washerMap[washerName]) washerMap[washerName] = { total: 0, inWashing: 0, outWashing: 0, pending: 0 };
        washerMap[washerName].total += quantity;
      }

      // Breakdown map (grouped by client + washer), exclude raw stitching/making rows from washing breakdown
      if (status !== 'making') {
        const bKey = `${clientName}|${washer}`;
        if (!breakdownMap[bKey]) {
          breakdownMap[bKey] = { client: clientName, lots: new Set(), washer, pcs: 0, making: 0, inWashing: 0, outWashing: 0 };
        }
        if (lotNumber) breakdownMap[bKey].lots.add(lotNumber);
        breakdownMap[bKey].pcs += quantity;

        if (status === 'inWashing') {
          totalInWashing += quantity;
          clientMap[clientName].inWashing += quantity;
          if (washerName) {
            washerMap[washerName].inWashing += quantity;
            washerMap[washerName].pending += quantity;
          }
          breakdownMap[bKey].inWashing += quantity;
        } else if (status === 'outWashing') {
          totalOutWashing += quantity;
          clientMap[clientName].outWashing += quantity;
          if (washerName) {
            washerMap[washerName].outWashing += quantity;
          }
          breakdownMap[bKey].outWashing += quantity;
        }
      } else {
        totalMaking += quantity;
        clientMap[clientName].making += quantity;
      }
    }

    // Build response arrays
    const client_summary = Object.entries(clientMap)
      .map(([name, data]) => ({
        CLIENT: name,
        TOTAL: data.total,
        MAKING: data.making,
        IN_WASHING: data.inWashing,
        OUT_WASHING: data.outWashing,
      }))
      .sort((a, b) => a.CLIENT.localeCompare(b.CLIENT));

    const washer_summary = Object.entries(washerMap)
      .map(([name, data]) => ({
        WASHER: name,
        TOTAL: data.total,
        IN_WASHING: data.inWashing,
        OUT_WASHING: data.outWashing,
        PENDING: data.pending,
      }))
      .sort((a, b) => a.WASHER.localeCompare(b.WASHER));

    // Build stitching vendor map
    const stitchingVendorMap = {};
    for (const st of stitchingRecords) {
      const vendorName = st.stitchingVendorName;
      const lotId = st._lotId?.toString();
      const quantity = (st.quantity || 0) - (st.quantityShort || 0);
      
      if (!stitchingVendorMap[vendorName]) {
        stitchingVendorMap[vendorName] = { total: 0, inStitching: 0, completed: 0 };
      }
      stitchingVendorMap[vendorName].total += quantity;
      
      // If lot is in washing or finishing, stitching is completed
      if (lotsInWashing.has(lotId) || lotsInFinishing.has(lotId)) {
        stitchingVendorMap[vendorName].completed += quantity;
      } else {
        stitchingVendorMap[vendorName].inStitching += quantity;
      }
    }

    const stitching_vendor_summary = Object.entries(stitchingVendorMap)
      .map(([name, data]) => ({
        STITCHING_VENDOR: name,
        TOTAL: data.total,
        IN_STITCHING: data.inStitching,
        COMPLETED: data.completed,
      }))
      .sort((a, b) => a.STITCHING_VENDOR.localeCompare(b.STITCHING_VENDOR));

    // Build stitching breakdown
    const stitchingBreakdownMap = {};
    for (const st of filteredStitchingRecords) {
      const clientName = st.clientName;
      const vendorName = st.stitchingVendorName;
      const quantity = (st.quantity || 0) - (st.quantityShort || 0);
      const key = `${clientName}|${vendorName}`;
      if (!stitchingBreakdownMap[key]) {
        stitchingBreakdownMap[key] = { client: clientName, vendor: vendorName, pcs: 0, lots: new Set() };
      }
      stitchingBreakdownMap[key].pcs += quantity;
      if (st.lotNumber) stitchingBreakdownMap[key].lots.add(st.lotNumber);
    }

    const stitching_rows = Object.values(stitchingBreakdownMap)
      .map(b => ({
        CLIENT: b.client,
        LOT_COUNT: b.lots.size,
        LOT_NO: Array.from(b.lots).sort().join(', '),
        STITCHING_VENDOR: b.vendor,
        PCS: b.pcs,
      }))
      .sort((a, b) => {
        const clientSort = a.CLIENT.localeCompare(b.CLIENT);
        return clientSort || a.STITCHING_VENDOR.localeCompare(b.STITCHING_VENDOR);
      });

    const rows = Object.values(breakdownMap)
      .map(b => ({
        CLIENT: b.client,
        LOT_COUNT: b.lots.size,
        LOT_NO: Array.from(b.lots).sort().join(', '),
        WASHING: b.washer,
        PCS: b.pcs,
        MAKING: b.making,
        IN_WASHING: b.inWashing,
        OUT_WASHING: b.outWashing,
      }))
      .sort((a, b) => {
        const clientSort = a.CLIENT.localeCompare(b.CLIENT);
        return clientSort || a.WASHING.localeCompare(b.WASHING);
      });
      // .sort((a, b) => b.PCS - a.PCS);

    // Dispatch KPIs — good-pcs aggregation over lots that reached finishing (scoped by
    // Finishing.date to honour the date filter), split by the lot's CURRENT status. Marking
    // finish-out advances a lot 4 -> 5, so status is the lot-level "finish-out marked" signal:
    //   - "In Finishing"     = pcs in lots still being finished        (status 4, no finish-out).
    //   - "Pending Dispatch" = finished pcs not yet dispatched         (status 5 + 6); a
    //       part-dispatched lot (6) contributes only its REMAINING pcs via the per-lot
    //       subtraction of already-invoiced (dispatched) pcs below.
    const finishingDateMatch = {};
    if (fromDate || toDate) {
      finishingDateMatch.date = {};
      if (fromDate) finishingDateMatch.date.$gte = new Date(fromDate);
      if (toDate) finishingDateMatch.date.$lte = new Date(toDate);
    }
    const finishingByStatusAgg = await Finishing.aggregate([
      { $match: finishingDateMatch },
      { $group: { _id: '$lotId', finalGross: { $sum: { $subtract: ['$quantity', { $ifNull: ['$quantityShort', 0] }] } } } },
      { $lookup: { from: Lot.collection.collectionName, localField: '_id', foreignField: '_id', as: 'lot' } },
      { $unwind: '$lot' },
      {
        $project: {
          status: '$lot.status',
          awaiting: {
            $max: [
              0,
              { $subtract: [{ $subtract: ['$finalGross', { $ifNull: ['$lot.damagedPcs', 0] }] }, { $ifNull: ['$lot.invoicedPcs', 0] }] }
            ]
          }
        }
      },
      { $group: { _id: '$status', awaiting: { $sum: '$awaiting' } } }
    ]);
    const awaitingByStatus = finishingByStatusAgg.reduce((acc, r) => { acc[r._id] = r.awaiting; return acc; }, {});
    const total_in_finishing = awaitingByStatus[4] || 0;
    const total_pending_dispatch = (awaitingByStatus[5] || 0) + (awaitingByStatus[6] || 0);
    const total_part_dispatch_pending = awaitingByStatus[6] || 0; // subset of pending, from part-dispatched lots

    // "Dispatched" = actual good pcs invoiced across ALL lots (incl. lots dispatched before
    //   finishing). A cumulative current-state total, not narrowed by the date filter.
    const dispatchedAgg = await Lot.aggregate([
      { $group: { _id: null, totalDispatched: { $sum: { $ifNull: ['$invoicedPcs', 0] } } } }
    ]);
    const total_dispatched = dispatchedAgg[0]?.totalDispatched || 0;

    const processingTime = (Date.now() - startTime) / 1000;

    return {
      total_pcs: totalPcs,
      total_making: totalMaking,
      total_in_washing: totalInWashing,
      total_out_washing: totalOutWashing,
      total_in_finishing,
      total_pending_dispatch,
      total_part_dispatch_pending,
      total_dispatched,
      client_summary,
      washer_summary,
      stitching_vendor_summary,
      rows,
      stitching_breakdown: stitching_rows,
      processing_time: processingTime,
      timestamp: new Date().toISOString(),
    };
    });
    res.json(payload);
  } catch (error) {
    console.error('Error in production dashboard:', error);
    res.status(500).json({ error: 'Error fetching production dashboard data' });
  }
};

module.exports = { getOrdersByStatus, getProductionStages, getInvoiceStatus, getVendorPerformance, getAuditLog, getTopFitStyles, getOrderStatusSummary, getAllClientCompletedQuantities, getProductionDashboard };
