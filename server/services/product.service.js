'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const InventoryMovement = require('../models/InventoryMovement');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');
const { getActiveDiscountMap } = require('./campaign.service');
const { SPEC_PARAM_MAP: KB_SPEC_MAP } = require('../utils/catalog/keyboardFilterConfig');
const { SPEC_PARAM_MAP: MN_SPEC_MAP } = require('../utils/catalog/monitorFilterConfig');
const { SPEC_PARAM_MAP: MS_SPEC_MAP } = require('../utils/catalog/mouseFilterConfig');
const { SPEC_PARAM_MAP: DT_SPEC_MAP } = require('../utils/catalog/desktopFilterConfig');
const { SPEC_PARAM_MAP: HP_SPEC_MAP } = require('../utils/catalog/headphoneFilterConfig');
const SPEC_PARAM_MAP = { ...KB_SPEC_MAP, ...MN_SPEC_MAP, ...MS_SPEC_MAP, ...DT_SPEC_MAP, ...HP_SPEC_MAP };
const { LEGACY_CATEGORY_ALIASES } = require('../config/categoryTaxonomy');

// ─── Base filter applied to every public query ────────────────────────────────
const PUBLIC_FILTER = { isPublished: true, isDeleted: false };

// ─── New Arrivals — single canonical "new" window, in days ────────────────────
// Reused by the products list filter (?new=true), the New Brands derivation,
// and the client's arrival-label helper — never re-defined independently.
const NEW_PRODUCT_DAYS = 14;

// ─── Category slug/id → matching product-category id(s) ───────────────────────
// A leaf category (no children) resolves to just itself. A main category with
// real subcategories resolves to itself PLUS every direct child, so
// /category/computers aggregates laptops+desktops+mini-pc+all-in-one in one
// query rather than requiring the client to fetch each child separately.
// Only one level deep — the canonical taxonomy is main→leaf, never deeper.
// Returns null when the category can't be resolved at all (caller forces
// zero results, matching the prior behavior for an unknown slug).
const resolveCategoryFilterIds = async (categoryParam) => {
  let cat;
  if (mongoose.Types.ObjectId.isValid(categoryParam)) {
    cat = await Category.findById(categoryParam).select('_id').lean();
  } else {
    const resolvedSlug = LEGACY_CATEGORY_ALIASES[categoryParam] || categoryParam;
    cat = await Category.findOne({ slug: resolvedSlug }).select('_id').lean();
  }
  if (!cat) return null;

  const children = await Category.find({ parentCategory: cat._id }).select('_id').lean();
  return children.length > 0 ? [cat._id, ...children.map((ch) => ch._id)] : [cat._id];
};

const listProducts = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = { ...PUBLIC_FILTER };

  // Category: accept slug (human-readable, including legacy aliases) or
  // ObjectId string. A main category aggregates its subcategories.
  if (query.category) {
    const ids = await resolveCategoryFilterIds(query.category);
    // Not found → force zero results rather than ignoring the filter
    filter.category = ids ? { $in: ids } : { $in: [] };
  }

  if (query.brand)    filter.brand = new RegExp(query.brand.trim(), 'i');
  if (query.featured  === 'true') filter.isFeatured = true;
  if (query.inStock   === 'true') filter.stock = { $gt: 0 };

  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) filter.price.$gte = parseFloat(query.minPrice);
    if (query.maxPrice) filter.price.$lte = parseFloat(query.maxPrice);
  }

  if (query.search) filter.$text = { $search: query.search };

  // Spec-based filters — URL param → MongoDB Map key mapping defined centrally
  // in keyboardFilterConfig.js. Values may be comma-separated for OR matching:
  //   specKeyboardType=Mechanical,Optical → { $in: ['Mechanical', 'Optical'] }
  for (const [param, specKey] of Object.entries(SPEC_PARAM_MAP)) {
    if (query[param]) {
      const values = query[param].split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        filter[`specs.${specKey}`] = values[0];
      } else if (values.length > 1) {
        filter[`specs.${specKey}`] = { $in: values };
      }
    }
  }

  // Tag-based signals: trending and bestSeller filter by product tags array
  const tagFilters = [];
  if (query.trending   === 'true') tagFilters.push('trending');
  if (query.bestSeller === 'true') tagFilters.push('best-seller');
  if (tagFilters.length > 0) filter.tags = { $in: tagFilters };

  // New Arrivals: catalog-added timestamp (createdAt) within the window.
  // `newDays` narrows the window for a specific view (e.g. "arrived this
  // week" uses 7) without ever exceeding the canonical NEW_PRODUCT_DAYS —
  // one shared rule, only ever made stricter, never redefined.
  if (query.new === 'true') {
    const days = Math.min(parseInt(query.newDays, 10) || NEW_PRODUCT_DAYS, NEW_PRODUCT_DAYS);
    filter.createdAt = { $gte: new Date(Date.now() - days * 86400000) };
  }

  const sortMap = {
    price_asc:  { price: 1 },
    price_desc: { price: -1 },
    newest:     { createdAt: -1 },
    rating:     { 'ratings.average': -1 },
    popularity: { salesCount: -1 },
    name:       { name: 1 },
  };
  const sort = sortMap[query.sort] || { createdAt: -1 };

  // onSale: active campaign products only (campaigns are the sole discount source).
  let preloadedDiscountMap = null;
  if (query.onSale === 'true') {
    preloadedDiscountMap = await getActiveDiscountMap();
    const campaignIds = [...preloadedDiscountMap.keys()].map(id => {
      try { return new mongoose.Types.ObjectId(id); } catch { return null; }
    }).filter(Boolean);
    // No active campaigns → force zero results rather than leaking non-campaign products
    filter._id = campaignIds.length > 0 ? { $in: campaignIds } : { $in: [] };
  }

  const [products, total, discountMap] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).populate('category', 'name slug'),
    Product.countDocuments(filter),
    preloadedDiscountMap ? Promise.resolve(preloadedDiscountMap) : getActiveDiscountMap(),
  ]);

  const enriched = products.map((p) => {
    const discount = discountMap.get(p._id.toString());
    if (!discount) return p;
    const obj = p.toObject();
    obj.discountedPrice = Math.round(p.price * (1 - discount / 100) * 100) / 100;
    obj.discountPercent = discount;
    return obj;
  });

  return { products: enriched, meta: paginateMeta(total, page, limit) };
};

// New Arrivals — "new brands" are brands whose EARLIEST catalog product is
// still within the New window, i.e. every one of that brand's published,
// non-deleted products was added recently — not just some of them. A single
// aggregation ($group by brand, $min createdAt), never one query per brand.
const getNewBrands = async (limit = 8) => {
  const threshold = new Date(Date.now() - NEW_PRODUCT_DAYS * 86400000);
  const results = await Product.aggregate([
    { $match: PUBLIC_FILTER },
    { $group: { _id: '$brand', earliest: { $min: '$createdAt' }, count: { $sum: 1 } } },
    { $match: { _id: { $ne: null }, earliest: { $gte: threshold } } },
    { $sort: { earliest: -1 } },
    { $limit: limit },
  ]);
  return results.map((r) => ({ brand: r._id, productCount: r.count, earliestAddedAt: r.earliest }));
};

// Flat list including parentCategory — the frontend builds the main→child
// tree from this (see client/src/constants/categories.js buildCategoryTree).
// Deliberately no product counts: computing them here would mean an extra
// aggregation per category on every request; not worth it for a rarely-
// changing nav list (see Step 7 of the catalog architecture task).
const listCategories = async () => {
  return Category.find({ isActive: true }).select('name slug parentCategory').sort({ name: 1 }).lean();
};

const getProduct = async (slug) => {
  const product = await Product
    .findOne({ slug, ...PUBLIC_FILTER })
    .populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');

  const discountMap = await getActiveDiscountMap();
  const discount = discountMap.get(product._id.toString());
  if (!discount) return product;

  const obj = product.toObject();
  obj.discountedPrice = Math.round(product.price * (1 - discount / 100) * 100) / 100;
  obj.discountPercent = discount;
  return obj;
};

// Admin-only full lookup by id — unlike getProduct(), bypasses PUBLIC_FILTER
// so drafts/unpublished products can be loaded for editing.
const getProductByIdAdmin = async (id) => {
  const product = await Product
    .findOne({ _id: id, isDeleted: false })
    .populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');
  return product;
};

const createProduct = async (dto) => {
  return Product.create(dto);
};

const updateProduct = async (id, dto) => {
  const product = await Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: dto },
    { new: true, runValidators: true }
  );
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');
  return product;
};

// Soft-delete: set isDeleted + deletedAt; never destroy the record
const deleteProduct = async (id) => {
  const product = await Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');
  return product;
};

// ─── Autocomplete ─────────────────────────────────────────────────────────────
const autocomplete = async (q, limit = 8) => {
  if (!q || q.trim().length < 2) return [];
  const safeLimit = Math.min(parseInt(limit, 10) || 8, 20);
  const regex = new RegExp('^' + q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  return Product.find(
    { ...PUBLIC_FILTER, name: regex },
    'name nameHe slug sku images price',
    { limit: safeLimit }
  ).lean();
};

const updateStock = async (id, userId, type, amount) => {
  const product = await Product.findOne({ _id: id, isDeleted: false });
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');

  if (type === 'decrease' && product.stock < amount) {
    throw new AppError(
      `Cannot decrease by ${amount}: only ${product.stock} units in stock`,
      StatusCodes.UNPROCESSABLE_ENTITY,
      'STOCK_UNDERFLOW'
    );
  }

  const beforeStock = product.stock;
  const delta = type === 'increase' ? amount : -amount;
  const updated = await Product.findByIdAndUpdate(
    id,
    { $inc: { stock: delta } },
    { new: true, runValidators: true }
  ).populate('category', 'name slug');

  // Non-fatal movement log using the rich InventoryMovement model
  InventoryMovement.create({
    product:       id,
    type:          'adjustment',
    quantity:      amount,
    reason:        type === 'increase' ? 'manual_add' : 'manual_subtract',
    referenceType: 'manual',
    actor:         userId,
    beforeStock,
    afterStock:    updated.stock,
  }).catch(() => {});

  return updated;
};

const getStockHistory = async (id) => {
  const product = await Product.findOne({ _id: id, isDeleted: false }).select('name sku');
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');

  const movements = await InventoryMovement
    .find({ product: id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('actor', 'name email')
    .lean();

  return { product, movements };
};

const getProductsByIds = async (ids) => {
  const objectIds = ids
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) return [];

  const products = await Product
    .find({ _id: { $in: objectIds }, ...PUBLIC_FILTER })
    .populate('category', 'name slug')
    .lean();

  const discountMap = await getActiveDiscountMap();

  const enriched = products.map(p => {
    const discount = discountMap.get(p._id.toString());
    if (!discount) return p;
    return {
      ...p,
      discountedPrice: Math.round(p.price * (1 - discount / 100) * 100) / 100,
      discountPercent: discount,
    };
  });

  // Preserve the caller's requested order
  const byId = new Map(enriched.map(p => [p._id.toString(), p]));
  return ids.map(id => byId.get(id)).filter(Boolean);
};

module.exports = {
  listProducts, listCategories, getProduct, getProductByIdAdmin, getProductsByIds,
  createProduct, updateProduct, deleteProduct,
  autocomplete, updateStock, getStockHistory,
  getNewBrands, NEW_PRODUCT_DAYS,
};
