'use strict';

const Order   = require('../models/Order');
const Product = require('../models/Product');
const User    = require('../models/User');
const Alert   = require('../models/Alert');
const { ROLES } = require('../config/roles');

// ─── Shared helpers ───────────────────────────────────────────────────────────
const round2    = (n) => Math.round(n * 100) / 100;
const pct       = (num, den) => den === 0 ? 0 : round2((num / den) * 100);
const daysAgo   = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1_000);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// ─── Shared filter definitions (mirror admin.service.js) ─────────────────────
// Only paid orders that haven't been cancelled or refunded count as recognized revenue.
const REVENUE_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refunded'] },
};
// Product sales: exclude pre-fulfillment and terminal-negative statuses.
const SALES_MATCH = {
  status: { $nin: ['cancelled', 'refunded', 'pending'] },
};

// ─── Range resolver ───────────────────────────────────────────────────────────
// Converts query params (range OR dateFrom/dateTo) → { from: Date|null, to: Date, days: number|null }
// `days` is null when explicit dates are provided (growth% comparison unavailable).
const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

const resolveRange = (query) => {
  const now = new Date();
  if (query.dateFrom || query.dateTo) {
    return {
      from: query.dateFrom ? new Date(query.dateFrom) : null,
      to:   query.dateTo   ? new Date(query.dateTo)   : now,
      days: null,
    };
  }
  const range = query.range || '30d';
  const days  = RANGE_DAYS[range] ?? 30;
  const from  = range === 'today' ? startOfToday() : daysAgo(days);
  return { from, to: now, days };
};

const rangeFilter = ({ from, to }) => ({
  ...(from ? { $gte: from } : {}),
  ...(to   ? { $lte: to   } : {}),
});

// ─── 1. Overview — all key KPIs in one call ───────────────────────────────────
// Returns: { revenue, orders, customers, alerts }
const getOverview = async (query) => {
  const range = resolveRange(query);
  const createdAtFilter = range.from ? { createdAt: rangeFilter(range) } : {};
  const revenueFilter   = { ...REVENUE_MATCH, ...createdAtFilter };

  // Previous period for growth % calculation (same length, ending at range.from)
  const prevFilter = (range.from && range.days)
    ? {
        ...REVENUE_MATCH,
        createdAt: { $gte: daysAgo(range.days * 2), $lt: range.from },
      }
    : null;

  const [
    revenueAgg,
    refundedAgg,
    prevRevenueAgg,
    orderStatusAgg,
    uniqueCustomersAgg,
    newCustomers,
    openAlerts,
  ] = await Promise.all([
    // Gross revenue + paid order count for current period
    Order.aggregate([
      { $match: revenueFilter },
      { $group: { _id: null, gross: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),

    // Total refunded money across all orders in range (regardless of payment status)
    Order.aggregate([
      { $match: { ...createdAtFilter, refundedAmount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$refundedAmount' } } },
    ]),

    // Previous period gross for growth%
    prevFilter
      ? Order.aggregate([
          { $match: prevFilter },
          { $group: { _id: null, gross: { $sum: '$total' } } },
        ])
      : Promise.resolve([]),

    // Order count by status within range
    Order.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Unique paying customers within range
    Order.aggregate([
      { $match: { ...createdAtFilter, paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] } } },
      { $group: { _id: '$user' } },
      { $count: 'total' },
    ]),

    // New registered customer accounts in range
    range.from
      ? User.countDocuments({ role: ROLES.USER, createdAt: rangeFilter(range) })
      : User.countDocuments({ role: ROLES.USER }),

    Alert.countDocuments({ isResolved: false }),
  ]);

  const gross     = revenueAgg[0]?.gross ?? 0;
  const paidCount = revenueAgg[0]?.count ?? 0;
  const refunded  = refundedAgg[0]?.total ?? 0;
  const prevGross = prevRevenueAgg[0]?.gross ?? 0;

  const byStatus = {};
  for (const { _id, count } of orderStatusAgg) byStatus[_id] = count;

  const total       = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const cancelled   = byStatus.cancelled ?? 0;
  const refundedOrders = byStatus.refunded ?? 0;
  const delivered   = byStatus.delivered ?? 0;
  const fulfilled   = ['confirmed', 'processing', 'shipped', 'delivered', 'refunded']
    .reduce((s, k) => s + (byStatus[k] ?? 0), 0);

  return {
    revenue: {
      gross:    round2(gross),
      net:      round2(gross - refunded),
      refunded: round2(refunded),
      aov:      paidCount > 0 ? round2(gross / paidCount) : 0,
      ordersCount: paidCount,
      growth:   prevGross > 0 ? round2(((gross - prevGross) / prevGross) * 100) : null,
    },
    orders: {
      total,
      byStatus,
      cancellationRate: pct(cancelled, total),
      refundRate:       pct(refundedOrders, paidCount + refundedOrders),
      completionRate:   pct(delivered, fulfilled),
    },
    customers: {
      unique: uniqueCustomersAgg[0]?.total ?? 0,
      new:    newCustomers,
    },
    alerts: {
      open: openAlerts,
    },
  };
};

// ─── 2. Revenue analytics ─────────────────────────────────────────────────────
// Returns: { summary: { gross, net, refunded, aov, ordersCount, growth }, series: [...] }
const getRevenueAnalytics = async (query) => {
  const range  = resolveRange(query);
  const period = query.period || 'day';

  const match = { ...REVENUE_MATCH };
  if (range.from) match.createdAt = rangeFilter(range);

  const prevMatch = (range.from && range.days)
    ? { ...REVENUE_MATCH, createdAt: { $gte: daysAgo(range.days * 2), $lt: range.from } }
    : null;

  const formatMap = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m' };
  const dateFmt   = formatMap[period] ?? '%Y-%m-%d';

  const [summaryAgg, refundedAgg, prevAgg, seriesAgg] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: { _id: null, gross: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),

    Order.aggregate([
      { $match: { ...(range.from ? { createdAt: rangeFilter(range) } : {}), refundedAmount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$refundedAmount' } } },
    ]),

    prevMatch
      ? Order.aggregate([
          { $match: prevMatch },
          { $group: { _id: null, gross: { $sum: '$total' } } },
        ])
      : Promise.resolve([]),

    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id:     { $dateToString: { format: dateFmt, date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id:      0,
          period:   '$_id',
          revenue:  { $round: ['$revenue', 2] },
          orders:   1,
          avgOrder: {
            $round: [{ $divide: ['$revenue', { $max: ['$orders', 1] }] }, 2],
          },
        },
      },
    ]),
  ]);

  const gross    = summaryAgg[0]?.gross   ?? 0;
  const count    = summaryAgg[0]?.count   ?? 0;
  const refunded = refundedAgg[0]?.total  ?? 0;
  const prevGross = prevAgg[0]?.gross     ?? 0;

  return {
    summary: {
      gross:       round2(gross),
      net:         round2(gross - refunded),
      refunded:    round2(refunded),
      aov:         count > 0 ? round2(gross / count) : 0,
      ordersCount: count,
      growth:      prevGross > 0 ? round2(((gross - prevGross) / prevGross) * 100) : null,
    },
    series: seriesAgg,
  };
};

// ─── 3. Order analytics ───────────────────────────────────────────────────────
// Returns: { summary, byStatus, trend, topCustomers, repeatCustomers, anomalies }
const getOrderAnalytics = async (query) => {
  const range = resolveRange(query);
  const createdAtFilter = range.from ? { createdAt: rangeFilter(range) } : {};

  const [
    // Order counts and groupings
    countByStatus,
    topCustomers,
    repeatCustomersAgg,
    uniqueCustomersAgg,
    trend,
    // Anomaly comparison window: last 24h vs 7d average
    ord24h, can24h, ref24h,
    ord7d,  can7d,  ref7d,
  ] = await Promise.all([
    Order.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    Order.aggregate([
      { $match: { ...REVENUE_MATCH, ...createdAtFilter } },
      { $group: { _id: '$user', spent: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { spent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from:         'users',
          localField:   '_id',
          foreignField: '_id',
          as:           'userDoc',
        },
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0, userId: '$_id',
          name:   { $ifNull: ['$userDoc.name',  'לא ידוע'] },
          email:  { $ifNull: ['$userDoc.email', ''] },
          spent:  { $round: ['$spent', 2] },
          orders: 1,
        },
      },
    ]),

    // Users with more than 1 order in the range → repeat customers
    Order.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'repeatCount' },
    ]),

    Order.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: '$user' } },
      { $count: 'total' },
    ]),

    // Daily order trend with per-day revenue snapshot
    Order.aggregate([
      { $match: createdAtFilter },
      {
        $group: {
          _id:    { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count:  { $sum: 1 },
          revenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0, period: '$_id', count: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ]),

    // Anomaly window — always compare fixed 24h vs 7d (not affected by range)
    Order.countDocuments({ createdAt: { $gte: daysAgo(1) } }),
    Order.countDocuments({ status: 'cancelled',   createdAt: { $gte: daysAgo(1) } }),
    Order.countDocuments({
      paymentStatus: { $in: ['refunded', 'partially_refunded'] },
      createdAt: { $gte: daysAgo(1) },
    }),
    Order.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
    Order.countDocuments({ status: 'cancelled',   createdAt: { $gte: daysAgo(7) } }),
    Order.countDocuments({
      paymentStatus: { $in: ['refunded', 'partially_refunded'] },
      createdAt: { $gte: daysAgo(7) },
    }),
  ]);

  const byStatus = {};
  for (const { _id, count } of countByStatus) byStatus[_id] = count;

  const total         = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const cancelled     = byStatus.cancelled  ?? 0;
  const refundedOrds  = byStatus.refunded   ?? 0;
  const delivered     = byStatus.delivered  ?? 0;
  const paidAndRefund = (byStatus.delivered ?? 0) + refundedOrds +
    (byStatus.shipped ?? 0) + (byStatus.processing ?? 0) + (byStatus.confirmed ?? 0);
  const fulfilled     = ['confirmed', 'processing', 'shipped', 'delivered', 'refunded']
    .reduce((s, k) => s + (byStatus[k] ?? 0), 0);

  const repeatCount           = repeatCustomersAgg[0]?.repeatCount ?? 0;
  const totalUniqueCustomers  = uniqueCustomersAgg[0]?.total       ?? 0;

  // Anomaly rules
  const dailyAvgOrders = ord7d / 7;
  const dailyAvgCancel = can7d / 7;
  const dailyAvgRefund = ref7d / 7;
  const anomalies      = [];

  if (dailyAvgOrders > 0 && ord24h < dailyAvgOrders * 0.5) {
    anomalies.push({
      type: 'sales_drop', severity: 'warning',
      message: `מכירות ב-24 שעות (${ord24h}) נמוכות מ-50% מהממוצע היומי (${dailyAvgOrders.toFixed(1)})`,
    });
  }
  if (dailyAvgCancel > 0 && can24h > dailyAvgCancel * 2) {
    anomalies.push({
      type: 'cancel_spike', severity: 'warning',
      message: `ביטולים ב-24 שעות (${can24h}) גבוהים פי 2 מהממוצע (${dailyAvgCancel.toFixed(1)})`,
    });
  }
  if (dailyAvgRefund > 0 && ref24h > dailyAvgRefund * 3) {
    anomalies.push({
      type: 'refund_spike', severity: 'critical',
      message: `החזרות ב-24 שעות (${ref24h}) גבוהות פי 3 מהממוצע (${dailyAvgRefund.toFixed(1)})`,
    });
  }

  return {
    summary: {
      total,
      cancellationRate: pct(cancelled, total),
      refundRate:       pct(refundedOrds, paidAndRefund),
      completionRate:   pct(delivered, fulfilled),
    },
    byStatus,
    trend,
    topCustomers,
    repeatCustomers: {
      count: repeatCount,
      rate:  pct(repeatCount, totalUniqueCustomers),
    },
    anomalies,
  };
};

// ─── 4. Product analytics ─────────────────────────────────────────────────────
// Returns: { topSelling, categoryPerformance, lowConversion, inventoryRisk }
const getProductAnalytics = async (query) => {
  const range = resolveRange(query);
  const createdAtFilter = range.from ? { createdAt: rangeFilter(range) } : {};

  const now = new Date();

  const [topSelling, categoryPerformance, lowConversion, inventoryRisk] = await Promise.all([

    // Top products by revenue from completed orders
    Order.aggregate([
      { $match: { ...SALES_MATCH, ...createdAtFilter } },
      { $unwind: '$items' },
      {
        $group: {
          _id:      '$items.product',
          name:     { $first: '$items.name' },
          sku:      { $first: '$items.sku' },
          totalQty: { $sum: '$items.quantity' },
          revenue:  { $sum: '$items.totalPrice' },
          orders:   { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 15 },
      // Enrich with live stock and category from Product
      {
        $lookup: {
          from: 'products', localField: '_id', foreignField: '_id', as: 'prod',
        },
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0, product: '$_id', name: 1, sku: 1, totalQty: 1, orders: 1,
          revenue:  { $round: ['$revenue', 2] },
          stock:    { $ifNull: ['$prod.stock', null] },
          category: { $ifNull: ['$prod.category', null] },
        },
      },
    ]),

    // Revenue and volume by category
    Order.aggregate([
      { $match: { ...SALES_MATCH, ...createdAtFilter } },
      { $unwind: '$items' },
      {
        $group: {
          _id:     '$items.product',
          revenue: { $sum: '$items.totalPrice' },
          qty:     { $sum: '$items.quantity' },
          orders:  { $sum: 1 },
        },
      },
      // Join to get the product's category
      {
        $lookup: {
          from: 'products', localField: '_id', foreignField: '_id',
          pipeline: [{ $project: { category: 1 } }],
          as: 'prod',
        },
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      // Collapse by category
      {
        $group: {
          _id:     '$prod.category',
          revenue: { $sum: '$revenue' },
          qty:     { $sum: '$qty' },
          orders:  { $sum: '$orders' },
        },
      },
      // Join to get category name
      {
        $lookup: {
          from: 'categories', localField: '_id', foreignField: '_id',
          pipeline: [{ $project: { name: 1 } }],
          as: 'cat',
        },
      },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          categoryId: '$_id',
          category:   { $ifNull: ['$cat.name', 'לא מקוטלג'] },
          revenue:    { $round: ['$revenue', 2] },
          qty:        1,
          orders:     1,
        },
      },
      { $sort: { revenue: -1 } },
    ]),

    // Published products with stock but very few sales (low conversion)
    // Only surfaces products published for at least 14 days to avoid false positives.
    Product.aggregate([
      { $match: { isDeleted: false, isPublished: true, stock: { $gt: 0 } } },
      {
        $addFields: {
          daysPublished: {
            $divide: [{ $subtract: [now, '$createdAt'] }, 86_400_000],
          },
        },
      },
      { $match: { daysPublished: { $gte: 14 }, salesCount: { $lt: 3 } } },
      { $sort: { salesCount: 1, daysPublished: -1 } },
      { $limit: 15 },
      {
        $project: {
          _id: 0, productId: '$_id', name: 1, sku: 1,
          salesCount: 1, stock: 1, minStock: 1,
          daysPublished: { $round: ['$daysPublished', 0] },
        },
      },
    ]),

    // Inventory risk: low-stock products ranked by turnover rate
    // turnoverRate ≈ salesCount / (stock + salesCount) — approaches 1 for fast-movers
    Product.aggregate([
      { $match: { isDeleted: false, isPublished: true } },
      {
        $addFields: {
          turnoverRate: {
            $round: [{
              $divide: [
                '$salesCount',
                { $add: ['$stock', '$salesCount', 1] },
              ],
            }, 3],
          },
        },
      },
      // Only surface products where stock is below minStock (or < 20 absolute)
      {
        $match: {
          $expr: { $lte: ['$stock', { $add: ['$minStock', 0] }] },
        },
      },
      { $sort: { stock: 1, turnoverRate: -1 } },
      { $limit: 15 },
      {
        $project: {
          _id: 0, productId: '$_id', name: 1, sku: 1,
          stock: 1, minStock: 1, salesCount: 1, turnoverRate: 1,
        },
      },
    ]),
  ]);

  return { topSelling, categoryPerformance, lowConversion, inventoryRisk };
};

module.exports = { getOverview, getRevenueAnalytics, getOrderAnalytics, getProductAnalytics };
