'use strict';

const mongoose = require('mongoose');
const Order   = require('../models/Order');
const Product = require('../models/Product');

const ACTIVE_MATCH = { isDeleted: false, isPublished: true };

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

// ─── Best-sellers — all-time salesCount ───────────────────────────────────────
const getBestSellers = async (limit = 8) => {
  return Product.find({
    ...ACTIVE_MATCH,
    salesCount: { $gt: 0 },
  }, PROJECT_FIELDS)
    .sort({ salesCount: -1 })
    .limit(limit)
    .lean();
};

module.exports = {
  getProductRecommendations,
  getAlsoBought,
  getTrending,
  getTopRated,
  getBestSellers,
};
