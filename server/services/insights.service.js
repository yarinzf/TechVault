'use strict';

const Order    = require('../models/Order');
const Product  = require('../models/Product');
const Wishlist = require('../models/Wishlist');
const Review   = require('../models/Review');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1_000);
const round2  = (n) => Math.round(n * 100) / 100;

// ─── Low stock risk ────────────────────────────────────────────────────────────
// Active products where stock <= minStock, ordered by turnover (fastest moving first)
const getLowStockRisks = async (limit = 10) => {
  return Product.aggregate([
    { $match: { isDeleted: false, isPublished: true } },
    {
      $addFields: {
        turnoverRate: {
          $round: [{
            $divide: ['$salesCount', { $add: ['$stock', '$salesCount', 1] }],
          }, 3],
        },
      },
    },
    { $match: { $expr: { $lte: ['$stock', '$minStock'] } } },
    { $sort: { turnoverRate: -1, stock: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0, productId: '$_id', name: 1, sku: 1,
        stock: 1, minStock: 1, salesCount: 1, turnoverRate: 1,
      },
    },
  ]);
};

// ─── Sales drop ───────────────────────────────────────────────────────────────
// Products that sold in the previous 30d window but have 0 sales in the last 7d
// and had meaningful sales before (>= 3 units in the prior period).
const getSalesDrop = async (limit = 10) => {
  const now     = new Date();
  const day7    = daysAgo(7);
  const day37   = daysAgo(37);

  const [recent, prior] = await Promise.all([
    Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'refunded', 'pending_payment'] }, createdAt: { $gte: day7 } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', recentQty: { $sum: '$items.quantity' } } },
    ]),
    Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'refunded', 'pending_payment'] }, createdAt: { $gte: day37, $lt: day7 } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', priorQty: { $sum: '$items.quantity' } } },
      { $match: { priorQty: { $gte: 3 } } },
    ]),
  ]);

  const recentMap = new Map(recent.map(r => [r._id.toString(), r.recentQty]));

  // Products with strong prior sales but zero recent sales
  const dropped = prior
    .filter(p => !recentMap.has(p._id.toString()))
    .slice(0, limit);

  if (!dropped.length) return [];

  const ids = dropped.map(d => d._id);
  const products = await Product.find(
    { _id: { $in: ids }, isDeleted: false },
    { name: 1, sku: 1, stock: 1, images: 1 }
  ).lean();

  const prodMap = new Map(products.map(p => [p._id.toString(), p]));

  return dropped.map(d => {
    const prod = prodMap.get(d._id.toString());
    return {
      productId: d._id,
      name:      prod?.name ?? 'לא ידוע',
      sku:       prod?.sku  ?? '',
      stock:     prod?.stock ?? 0,
      priorQty:  d.priorQty,
      recentQty: 0,
    };
  }).filter(d => prodMap.has(d.productId.toString()));
};

// ─── Most wishlisted ──────────────────────────────────────────────────────────
const getMostWishlisted = async (limit = 8) => {
  return Wishlist.aggregate([
    { $unwind: '$products' },
    { $group: { _id: '$products', wishlistCount: { $sum: 1 } } },
    { $sort: { wishlistCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'products', localField: '_id', foreignField: '_id',
        pipeline: [
          { $match: { isDeleted: false } },
          { $project: { name: 1, sku: 1, stock: 1, price: 1, images: 1 } },
        ],
        as: 'prod',
      },
    },
    { $unwind: { path: '$prod', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name:         '$prod.name',
        sku:          '$prod.sku',
        stock:        '$prod.stock',
        price:        '$prod.price',
        wishlistCount: 1,
      },
    },
  ]);
};

// ─── Most reviewed ────────────────────────────────────────────────────────────
const getMostReviewed = async (limit = 8) => {
  return Review.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$product', reviewCount: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
    { $sort: { reviewCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'products', localField: '_id', foreignField: '_id',
        pipeline: [
          { $match: { isDeleted: false } },
          { $project: { name: 1, sku: 1, stock: 1 } },
        ],
        as: 'prod',
      },
    },
    { $unwind: { path: '$prod', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name:        '$prod.name',
        sku:         '$prod.sku',
        reviewCount: 1,
        avgRating:   { $round: ['$avgRating', 1] },
      },
    },
  ]);
};

// ─── Highest rated (minimum 5 reviews) ───────────────────────────────────────
const getHighestRated = async (limit = 8) => {
  return Product.find(
    { isDeleted: false, isPublished: true, 'ratings.count': { $gte: 5 }, 'ratings.average': { $gte: 4 } },
    { name: 1, sku: 1, stock: 1, price: 1, images: 1, 'ratings.average': 1, 'ratings.count': 1 }
  )
    .sort({ 'ratings.average': -1, 'ratings.count': -1 })
    .limit(limit)
    .lean();
};

// ─── Cancelled orders trend ───────────────────────────────────────────────────
const getCancellationTrend = async () => {
  const [last7d, prev7d, last30d] = await Promise.all([
    Order.countDocuments({ status: 'cancelled', createdAt: { $gte: daysAgo(7) } }),
    Order.countDocuments({ status: 'cancelled', createdAt: { $gte: daysAgo(14), $lt: daysAgo(7) } }),
    Order.countDocuments({ status: 'cancelled', createdAt: { $gte: daysAgo(30) } }),
  ]);

  const change = prev7d > 0 ? round2(((last7d - prev7d) / prev7d) * 100) : null;

  return { last7d, prev7d, last30d, weekOverWeekChange: change };
};

// ─── Revenue opportunities (high-wishlist, low-stock, no active discount) ─────
const getRevenueOpportunities = async (limit = 8) => {
  // Products with many wishlist saves but out of stock — restock opportunity
  const wishlistCounts = await Wishlist.aggregate([
    { $unwind: '$products' },
    { $group: { _id: '$products', wishlistCount: { $sum: 1 } } },
    { $sort: { wishlistCount: -1 } },
    { $limit: 50 },
  ]);

  if (!wishlistCounts.length) return [];

  const ids = wishlistCounts.map(w => w._id);
  const products = await Product.find(
    { _id: { $in: ids }, isDeleted: false, isPublished: true, stock: { $lte: 10 } },
    { name: 1, sku: 1, stock: 1, price: 1, compareAtPrice: 1 }
  ).lean();

  const countMap = new Map(wishlistCounts.map(w => [w._id.toString(), w.wishlistCount]));

  return products
    .map(p => ({
      productId:    p._id,
      name:         p.name,
      sku:          p.sku,
      stock:        p.stock,
      price:        p.price,
      wishlistCount: countMap.get(p._id.toString()) ?? 0,
    }))
    .sort((a, b) => b.wishlistCount - a.wishlistCount)
    .slice(0, limit);
};

// ─── Main insights aggregator ─────────────────────────────────────────────────
const getInsights = async () => {
  const [
    lowStockRisks,
    salesDrop,
    mostWishlisted,
    mostReviewed,
    highestRated,
    cancellationTrend,
    revenueOpportunities,
  ] = await Promise.all([
    getLowStockRisks(),
    getSalesDrop(),
    getMostWishlisted(),
    getMostReviewed(),
    getHighestRated(),
    getCancellationTrend(),
    getRevenueOpportunities(),
  ]);

  // Derive severity-tagged alerts for critical conditions
  const alerts = [];

  if (lowStockRisks.length > 0) {
    alerts.push({
      type: 'low_stock_risk',
      severity: lowStockRisks.some(p => p.stock === 0) ? 'critical' : 'warning',
      count: lowStockRisks.length,
      message: `${lowStockRisks.length} מוצרים מתחת למלאי המינימלי`,
    });
  }

  if (salesDrop.length > 0) {
    alerts.push({
      type: 'sales_drop',
      severity: 'warning',
      count: salesDrop.length,
      message: `${salesDrop.length} מוצרים שלא נמכרו השבוע לעומת 30 ימים קודמים`,
    });
  }

  if (cancellationTrend.weekOverWeekChange !== null && cancellationTrend.weekOverWeekChange > 50) {
    alerts.push({
      type: 'cancellation_spike',
      severity: cancellationTrend.weekOverWeekChange > 100 ? 'critical' : 'warning',
      count: cancellationTrend.last7d,
      message: `ביטולים השבוע עלו ${cancellationTrend.weekOverWeekChange.toFixed(0)}% לעומת שבוע שעבר`,
    });
  }

  return {
    alerts,
    lowStockRisks,
    salesDrop,
    mostWishlisted,
    mostReviewed,
    highestRated,
    cancellationTrend,
    revenueOpportunities,
  };
};

module.exports = {
  getInsights,
  getLowStockRisks,
  getSalesDrop,
  getMostWishlisted,
  getMostReviewed,
  getHighestRated,
  getCancellationTrend,
  getRevenueOpportunities,
};
