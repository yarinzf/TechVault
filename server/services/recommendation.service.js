'use strict';

const mongoose = require('mongoose');
const Order   = require('../models/Order');
const Product = require('../models/Product');
const { getActiveDiscountMap, calculateDiscountedPrice } = require('./campaign.service');

const ACTIVE_MATCH = { isDeleted: false, isPublished: true };

// A real, completed, paid sale — mirrors report.service.js's REVENUE_MATCH,
// the most rigorous "did money actually change hands" definition already
// established in this codebase (used for real revenue reporting), rather
// than this file's own looser status-only check (used elsewhere below for
// lower-stakes recommendation heuristics) or analytics.service.js's
// fulfillment-stage-based SALES_MATCH (which excludes the 'pending' status
// for a different, admin-pipeline reason unrelated to "was this paid for").
// Best Sellers is customer-facing and represents real purchases, so it uses
// the strictest, payment-verified signal: paymentStatus checked directly,
// not inferred from order.status alone.
const SALES_TRUTH_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refunded'] },
};

const PROJECT_FIELDS = {
  name: 1, slug: 1, images: 1, price: 1, compareAtPrice: 1,
  brand: 1, category: 1, 'ratings.average': 1, 'ratings.count': 1,
  stock: 1, salesCount: 1,
};

// ─── Related products for a given product ─────────────────────────────────────
// Strategy: same category + same brand (highest rating), then fill from category.
const getProductRecommendations = async (productId, limit = 8) => {
  const id = new mongoose.Types.ObjectId(productId);

  const source = await Product.findById(id, { category: 1, brand: 1 }).lean();
  if (!source) return [];

  const base = { ...ACTIVE_MATCH, _id: { $ne: id } };

  // Fetch same-brand-and-category, then same-category only; deduplicate by _id
  const [sameBrandCat, sameCat] = await Promise.all([
    source.brand
      ? Product.find({ ...base, category: source.category, brand: source.brand }, PROJECT_FIELDS)
          .sort({ 'ratings.average': -1, salesCount: -1 })
          .limit(limit)
          .lean()
      : Promise.resolve([]),

    Product.find({ ...base, category: source.category }, PROJECT_FIELDS)
      .sort({ 'ratings.average': -1, salesCount: -1 })
      .limit(limit)
      .lean(),
  ]);

  // Merge: brand matches first, then fill from category, dedup
  const seen = new Set();
  const merged = [];
  for (const p of [...sameBrandCat, ...sameCat]) {
    const key = p._id.toString();
    if (!seen.has(key)) { seen.add(key); merged.push(p); }
    if (merged.length >= limit) break;
  }

  // If still under limit, pull "customers also bought" from order co-occurrence
  if (merged.length < limit) {
    const coIds = merged.map(p => p._id);
    coIds.push(id);

    const also = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'refunded', 'pending_payment'] }, 'items.product': id } },
      { $unwind: '$items' },
      { $match: { 'items.product': { $nin: coIds } } },
      { $group: { _id: '$items.product', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit - merged.length },
      {
        $lookup: {
          from: 'products', localField: '_id', foreignField: '_id',
          pipeline: [
            { $match: ACTIVE_MATCH },
            { $project: PROJECT_FIELDS },
          ],
          as: 'prod',
        },
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: false } },
      { $replaceRoot: { newRoot: '$prod' } },
    ]);

    for (const p of also) {
      if (merged.length >= limit) break;
      merged.push(p);
    }
  }

  return merged.slice(0, limit);
};

// ─── Customers also bought (co-purchase from order history) ───────────────────
const getAlsoBought = async (productId, limit = 6) => {
  const id = new mongoose.Types.ObjectId(productId);

  const results = await Order.aggregate([
    { $match: { status: { $nin: ['cancelled', 'refunded', 'pending_payment'] }, 'items.product': id } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $ne: id } } },
    { $group: { _id: '$items.product', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'products', localField: '_id', foreignField: '_id',
        pipeline: [
          { $match: ACTIVE_MATCH },
          { $project: PROJECT_FIELDS },
        ],
        as: 'prod',
      },
    },
    { $unwind: { path: '$prod', preserveNullAndEmptyArrays: false } },
    { $replaceRoot: { newRoot: '$prod' } },
  ]);

  return results;
};

// ─── Trending — high salesCount in recent 30 days ─────────────────────────────
const getTrending = async (limit = 8) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);

  const results = await Order.aggregate([
    { $match: { status: { $nin: ['cancelled', 'refunded', 'pending_payment'] }, createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', recentSales: { $sum: '$items.quantity' } } },
    { $sort: { recentSales: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'products', localField: '_id', foreignField: '_id',
        pipeline: [
          { $match: ACTIVE_MATCH },
          { $project: PROJECT_FIELDS },
        ],
        as: 'prod',
      },
    },
    { $unwind: { path: '$prod', preserveNullAndEmptyArrays: false } },
    {
      $replaceRoot: {
        newRoot: { $mergeObjects: ['$prod', { recentSales: '$recentSales' }] },
      },
    },
  ]);

  return results;
};

// ─── Top-rated — minimum 3 reviews, sorted by average desc ───────────────────
const getTopRated = async (limit = 8) => {
  return Product.find({
    ...ACTIVE_MATCH,
    'ratings.count':   { $gte: 3 },
    'ratings.average': { $gte: 3.5 },
  }, PROJECT_FIELDS)
    .sort({ 'ratings.average': -1, 'ratings.count': -1 })
    .limit(limit)
    .lean();
};

// ─── Best-sellers — real, lifetime quantity sold from actual paid orders ──────
//
// Product.salesCount is NOT used here — it's seeded with large static
// baseline values in server/data/**/*.js (e.g. `salesCount: 172`) and only
// incremented/decremented incrementally on top of that fake baseline by
// order.service.js, so it can never represent genuine sales history. This
// aggregates directly from real Order/OrderItem data instead, ranked by
// total QUANTITY sold (not order count — a single order for 3 units counts
// as 3, not 1), lifetime-to-date (matches the visible Sapir reference's own
// rendering, which sorts by `salesRankTotal`/shows `salesCountTotal` — the
// monthly/weekly fields exist in its demo data but are never what's
// actually rendered on the page).
//
// One aggregation computes the FULL real ranking (not capped at `limit`)
// because "is this product the #1 seller in its own category" must be
// judged against every real seller, not just whichever ones survived a
// small page-size cutoff — see isCategoryLeader below.
const getBestSellers = async (limit = 5) => {
  const fullRanking = await Order.aggregate([
    { $match: SALES_TRUTH_MATCH },
    { $unwind: '$items' },
    { $match: { 'items.itemType': 'product' } }, // membership lines have no real Product document
    { $group: { _id: '$items.product', unitsSold: { $sum: '$items.quantity' } } },
    { $match: { unitsSold: { $gt: 0 } } },
    {
      $lookup: {
        from: 'products', localField: '_id', foreignField: '_id',
        pipeline: [{ $match: ACTIVE_MATCH }, { $project: { category: 1 } }],
        as: 'prod',
      },
    },
    // No preserveNullAndEmptyArrays — a product that's deleted/unpublished/
    // gone produces no `prod` match and is dropped here, at the DB level,
    // rather than filtered out after the fact.
    { $unwind: '$prod' },
    { $project: { _id: 1, unitsSold: 1, category: '$prod.category' } },
    { $sort: { unitsSold: -1, _id: 1 } }, // deterministic tie-break by _id
  ]);

  if (fullRanking.length === 0) return [];

  // Category leader = the single highest-unitsSold real product within each
  // real category, computed against the FULL ranking above — never just the
  // displayed top N, so a weak product can't "become" a leader merely
  // because its stronger same-category competitors were cut off by `limit`.
  const categoryLeaderIds = new Set();
  const seenCategories = new Set();
  for (const r of fullRanking) {
    if (!r.category) continue;
    const catKey = String(r.category);
    if (!seenCategories.has(catKey)) {
      seenCategories.add(catKey);
      categoryLeaderIds.add(String(r._id));
    }
  }

  const top = fullRanking.slice(0, limit);
  const productIds = top.map((r) => r._id);

  const [products, discountMap] = await Promise.all([
    Product.find({ _id: { $in: productIds } })
      .populate('category', 'name slug')
      .select('name slug brand images category price stock ratings')
      .lean(),
    getActiveDiscountMap(),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));

  return top
    .map((r, i) => {
      const p = productById.get(String(r._id));
      if (!p) return null; // defensive; the $lookup/$unwind above already excludes these
      const discountPercent = discountMap.get(String(p._id)) ?? null;
      return {
        _id:      p._id,
        slug:     p.slug,
        name:     p.name,
        brand:    p.brand ?? null,
        images:   p.images ?? [],
        category: p.category ? { _id: p.category._id, name: p.category.name, slug: p.category.slug } : null,
        price:    p.price,
        stock:    p.stock,
        ratings:  p.ratings ?? { average: 0, count: 0 },
        discountPercent,
        discountedPrice: discountPercent != null ? calculateDiscountedPrice(p.price, discountPercent) : null,
        unitsSold: r.unitsSold,
        rank: i + 1,
        isCategoryLeader: categoryLeaderIds.has(String(r._id)),
      };
    })
    .filter(Boolean);
};

module.exports = {
  getProductRecommendations,
  getAlsoBought,
  getTrending,
  getTopRated,
  getBestSellers,
};
