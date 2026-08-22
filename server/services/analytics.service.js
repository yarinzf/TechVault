'use strict';

const Order   = require('../models/Order');
const Product = require('../models/Product');
const User    = require('../models/User');
const Alert   = require('../models/Alert');
const { ROLES } = require('../config/roles');
const { getIsraelDayBoundaries, getIsraelDateParts } = require('../utils/timezone');
const { getRangeStats, getDailySeries, bucketSeriesByPeriod, ALL_TIME_FLOOR } = require('./analyticsDaily.service');
const ProductSalesMonthly = require('../models/ProductSalesMonthly');

// ─── Shared helpers ───────────────────────────────────────────────────────────
const round2    = (n) => Math.round(n * 100) / 100;
const pct       = (num, den) => den === 0 ? 0 : round2((num / den) * 100);
const daysAgo   = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1_000);
// Israel-calendar-day boundary, not server-local/UTC — see server/utils/timezone.js.
const startOfToday = () => getIsraelDayBoundaries(new Date()).start;

// ─── Shared filter definitions (mirror admin.service.js) ─────────────────────
// Only paid orders that haven't been cancelled or refunded count as recognized
// revenue — still used by getOrderAnalytics#topCustomers below (a live-only,
// per-customer breakdown; see server/docs/analytics-architecture.md for why
// that stays live rather than blended with the seeded historical baseline).
const REVENUE_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refunded'] },
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
//
// revenue/orders (gross/net/refunded/aov/cancellationRate/refundRate/growth)
// are historical-baseline + live reconciled via analyticsDaily.service.js —
// the SAME function backing the Dashboard and Reports/CSV export, so this
// tab can never show a different total for the same range. `byStatus`/
// `completionRate` (fulfillment-pipeline detail), `customers.unique`/
// `topCustomers`-style per-customer breakdowns, and `alerts.open` remain
// live-only real Order/Alert queries — see server/docs/analytics-
// architecture.md for why per-customer and operational-pipeline figures are
// not (and cannot honestly be) blended with the seeded historical baseline.
const getOverview = async (query) => {
  const range = resolveRange(query);
  const createdAtFilter = range.from ? { createdAt: rangeFilter(range) } : {};

  const rangeStats = await getRangeStats(range.from ?? ALL_TIME_FLOOR, range.to);
  const prevRangeStats = (range.from && range.days)
    ? await getRangeStats(daysAgo(range.days * 2), range.from)
    : null;

  const [orderStatusAgg, uniqueCustomersAgg, newCustomers, openAlerts] = await Promise.all([
    // Order count by status within range — live, operational breakdown
    Order.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Unique paying customers within range — inherently live-only (no
    // fake historical Users/Orders exist to derive this from for the
    // seeded window).
    Order.aggregate([
      { $match: { ...createdAtFilter, paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] } } },
      { $group: { _id: '$user' } },
      { $count: 'total' },
    ]),

    // New REGISTERED customer accounts in range — deliberately real/live
    // only, never blended with AnalyticsDaily.newCustomers (a narrative
    // KPI-trend figure used only by the BusinessTarget goal-tracking
    // feature — see analytics-architecture.md).
    range.from
      ? User.countDocuments({ role: ROLES.USER, createdAt: rangeFilter(range) })
      : User.countDocuments({ role: ROLES.USER }),

    Alert.countDocuments({ isResolved: false }),
  ]);

  const byStatus = {};
  for (const { _id, count } of orderStatusAgg) byStatus[_id] = count;

  const total       = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const delivered   = byStatus.delivered ?? 0;
  const fulfilled   = ['confirmed', 'processing', 'shipped', 'delivered', 'refunded']
    .reduce((s, k) => s + (byStatus[k] ?? 0), 0);

  return {
    revenue: {
      gross:    rangeStats.revenue,
      net:      round2(rangeStats.revenue - rangeStats.refundAmount),
      refunded: rangeStats.refundAmount,
      aov:      rangeStats.aov,
      ordersCount: rangeStats.paidOrders,
      growth: prevRangeStats && prevRangeStats.revenue > 0
        ? round2(((rangeStats.revenue - prevRangeStats.revenue) / prevRangeStats.revenue) * 100)
        : null,
    },
    orders: {
      total,
      byStatus,
      cancellationRate: rangeStats.cancellationRate,
      refundRate:       rangeStats.refundedOrders + rangeStats.paidOrders > 0
        ? round2((rangeStats.refundedOrders / (rangeStats.refundedOrders + rangeStats.paidOrders)) * 100)
        : 0,
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
// Historical-baseline + live reconciled — same getDailySeries/
// bucketSeriesByPeriod primitive as admin.service.js#getRevenue and
// report.service.js#getSalesReport.
const getRevenueAnalytics = async (query) => {
  const range  = resolveRange(query);
  const period = query.period || 'day';

  const rangeStats = await getRangeStats(range.from ?? ALL_TIME_FLOOR, range.to);
  const prevRangeStats = (range.from && range.days)
    ? await getRangeStats(daysAgo(range.days * 2), range.from)
    : null;

  const dailySeries = await getDailySeries(range.from ?? ALL_TIME_FLOOR, range.to);
  const series = bucketSeriesByPeriod(dailySeries, ['day', 'week', 'month'].includes(period) ? period : 'day');

  return {
    summary: {
      gross:       rangeStats.revenue,
      net:         round2(rangeStats.revenue - rangeStats.refundAmount),
      refunded:    rangeStats.refundAmount,
      aov:         rangeStats.aov,
      ordersCount: rangeStats.paidOrders,
      growth: prevRangeStats && prevRangeStats.revenue > 0
        ? round2(((rangeStats.revenue - prevRangeStats.revenue) / prevRangeStats.revenue) * 100)
        : null,
    },
    series,
  };
};

// ─── 3. Order analytics ───────────────────────────────────────────────────────
// Returns: { summary, byStatus, trend, topCustomers, repeatCustomers, anomalies }
// summary.cancellationRate/refundRate and `trend` (revenue/order counts per
// day) are historical-baseline + live reconciled (getRangeStats/
// getDailySeries — same primitive as the Dashboard/Reports). `byStatus`/
// `completionRate` (fulfillment-pipeline stage breakdown), `topCustomers`,
// `repeatCustomers`, and `anomalies` (always a fixed real-time 24h/7d
// window, never affected by the requested range) remain live-only real
// queries — pipeline stage and per-customer detail have no seeded
// historical equivalent, see server/docs/analytics-architecture.md.
const getOrderAnalytics = async (query) => {
  const range = resolveRange(query);
  const createdAtFilter = range.from ? { createdAt: rangeFilter(range) } : {};

  const rangeStats = await getRangeStats(range.from ?? ALL_TIME_FLOOR, range.to);
  const dailySeries = await getDailySeries(range.from ?? ALL_TIME_FLOOR, range.to);
  const trend = dailySeries.map((d) => ({ period: d.date.toISOString().slice(0, 10), count: d.orders, revenue: d.revenue }));

  const [
    // Order counts and groupings
    countByStatus,
    topCustomers,
    repeatCustomersAgg,
    uniqueCustomersAgg,
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

  const delivered     = byStatus.delivered  ?? 0;
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
      total: rangeStats.orders,
      cancellationRate: rangeStats.cancellationRate,
      refundRate:       rangeStats.refundedOrders + rangeStats.paidOrders > 0
        ? round2((rangeStats.refundedOrders / (rangeStats.refundedOrders + rangeStats.paidOrders)) * 100)
        : 0,
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

// Converts an [from, to) instant range into a Mongo $or match over
// ProductSalesMonthly's {year, month} key (mirrors admin.service.js's
// identical helper) — a month is included if any part of it overlaps the
// requested range.
function buildMonthRangeMatch(from, to) {
  const start = getIsraelDateParts(from);
  const endInstant = new Date(to.getTime() - 1);
  const end = getIsraelDateParts(endInstant);

  const keys = [];
  let y = start.year, m = start.month;
  while (y < end.year || (y === end.year && m <= end.month)) {
    keys.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { $or: keys };
}

// ─── 4. Product analytics ─────────────────────────────────────────────────────
// Returns: { topSelling, categoryPerformance, lowConversion, inventoryRisk }
// topSelling/categoryPerformance are historical-baseline + live reconciled —
// sourced from ProductSalesMonthly (both 'historical_seed_v1' and 'live'
// rows, the current month kept fresh by the incremental rebuild), NOT a
// live-only Order scan — so a range spanning the historical window
// correctly shows real seeded bestsellers/category mix instead of empty
// results. lowConversion/inventoryRisk are current-state views (not date-
// ranged) and now use each product's TRUE lifetime total
// (historicalSalesCount + salesCount) rather than the live-only salesCount
// field, so a historically-strong seller is never misclassified as "low
// conversion" purely because its live counter happens to be small.
const getProductAnalytics = async (query) => {
  const range = resolveRange(query);
  const now = new Date();
  const monthMatch = buildMonthRangeMatch(range.from ?? ALL_TIME_FLOOR, range.to);

  const [topSelling, categoryPerformance, lowConversion, inventoryRisk] = await Promise.all([

    // Top products by revenue — ProductSalesMonthly, historical + live
    ProductSalesMonthly.aggregate([
      { $match: monthMatch },
      {
        $group: {
          _id:      '$product',
          totalQty: { $sum: '$unitsSold' },
          revenue:  { $sum: '$revenue' },
          orders:   { $sum: '$orderCount' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 15 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      {
        $project: {
          _id: 0, product: '$_id', name: '$prod.name', sku: '$prod.sku', totalQty: 1, orders: 1,
          revenue:  { $round: ['$revenue', 2] },
          stock:    '$prod.stock',
          category: '$prod.category',
        },
      },
    ]),

    // Revenue and volume by category — ProductSalesMonthly, historical + live
    ProductSalesMonthly.aggregate([
      { $match: monthMatch },
      {
        $group: {
          _id:     '$product',
          revenue: { $sum: '$revenue' },
          qty:     { $sum: '$unitsSold' },
          orders:  { $sum: '$orderCount' },
        },
      },
      {
        $lookup: {
          from: 'products', localField: '_id', foreignField: '_id',
          pipeline: [{ $project: { category: 1 } }],
          as: 'prod',
        },
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id:     '$prod.category',
          revenue: { $sum: '$revenue' },
          qty:     { $sum: '$qty' },
          orders:  { $sum: '$orders' },
        },
      },
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

    // Published products with stock but very few LIFETIME sales (historical +
    // live). Only surfaces products published for at least 14 days (real
    // Product.createdAt) to avoid false positives on a genuinely new product.
    Product.aggregate([
      { $match: { isDeleted: false, isPublished: true, stock: { $gt: 0 } } },
      {
        $addFields: {
          daysPublished: { $divide: [{ $subtract: [now, '$createdAt'] }, 86_400_000] },
          totalSold:     { $add: [{ $ifNull: ['$historicalSalesCount', 0] }, '$salesCount'] },
        },
      },
      { $match: { daysPublished: { $gte: 14 }, totalSold: { $lt: 3 } } },
      { $sort: { totalSold: 1, daysPublished: -1 } },
      { $limit: 15 },
      {
        $project: {
          _id: 0, productId: '$_id', name: 1, sku: 1,
          salesCount: '$totalSold', stock: 1, minStock: 1,
          daysPublished: { $round: ['$daysPublished', 0] },
        },
      },
    ]),

    // Inventory risk: low-stock products ranked by turnover rate
    // turnoverRate ≈ totalSold / (stock + totalSold) — approaches 1 for fast-movers
    Product.aggregate([
      { $match: { isDeleted: false, isPublished: true } },
      {
        $addFields: {
          totalSold: { $add: [{ $ifNull: ['$historicalSalesCount', 0] }, '$salesCount'] },
        },
      },
      {
        $addFields: {
          turnoverRate: {
            $round: [{ $divide: ['$totalSold', { $add: ['$stock', '$totalSold', 1] }] }, 3],
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
          stock: 1, minStock: 1, salesCount: '$totalSold', turnoverRate: 1,
        },
      },
    ]),
  ]);

  return { topSelling, categoryPerformance, lowConversion, inventoryRisk };
};

module.exports = { getOverview, getRevenueAnalytics, getOrderAnalytics, getProductAnalytics };
