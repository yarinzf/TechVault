'use strict';

const Order   = require('../models/Order');
const User    = require('../models/User');
const Product = require('../models/Product');
const logger  = require('../config/logger');

/**
 * Daily analytics snapshot — logs a summary of today's key metrics.
 * Runs at 01:00 AM, covering the previous calendar day.
 *
 * Placeholder: in a future iteration this can write to an AnalyticsSnapshot
 * collection for the Admin Reports page to query instead of re-aggregating.
 */
module.exports = async function dailySnapshot() {
  const now      = new Date();
  const dayStart = new Date(now);
  dayStart.setDate(dayStart.getDate() - 1);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const dateLabel = dayStart.toISOString().slice(0, 10);

  const [orderStats, newUsers, lowStockCount] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: dayStart, $lte: dayEnd },
          status:    { $nin: ['cancelled', 'pending_payment'] },
        },
      },
      {
        $group: {
          _id:      null,
          count:    { $sum: 1 },
          revenue:  { $sum: '$total' },
          avgOrder: { $avg: '$total' },
        },
      },
    ]),
    User.countDocuments({ createdAt: { $gte: dayStart, $lte: dayEnd } }),
    Product.countDocuments({
      isDeleted: false, isPublished: true,
      $expr: { $lte: ['$stock', '$minStock'] },
    }),
  ]);

  const stats = orderStats[0] ?? { count: 0, revenue: 0, avgOrder: 0 };

  logger.info(
    `[dailySnapshot] ${dateLabel}: ` +
    `orders=${stats.count}, ` +
    `revenue=₪${stats.revenue.toFixed(2)}, ` +
    `avgOrder=₪${(stats.avgOrder || 0).toFixed(2)}, ` +
    `newUsers=${newUsers}, ` +
    `lowStockProducts=${lowStockCount}`
  );
};
