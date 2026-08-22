'use strict';

const mongoose = require('mongoose');
const Order               = require('../models/Order');
const Product              = require('../models/Product');
const ProductSalesMonthly = require('../models/ProductSalesMonthly');
const { SALES_TRUTH_MATCH, getUtcMonthBoundaries } = require('./recommendation.service');

// ─── Rebuild — the ONLY writer of ProductSalesMonthly ──────────────────────────
//
// Orders remain the sole source of truth. This function is a pure,
// deterministic reconciliation: given a {year, month}, it recomputes the
// real numbers directly from Order/OrderItem data and makes
// ProductSalesMonthly match exactly — upserting rows for products with real
// qualifying sales that month, and removing any row that no longer has any
// (e.g. its only order was cancelled/refunded since the last rebuild).
// Re-running it for the same month always converges to the same result —
// safe to run as many times as needed, including after refunds change the
// underlying Order data.
async function rebuildProductSalesMonth(year, month, { dryRun = false, productIds = null } = {}) {
  const { start, end } = getUtcMonthBoundaries(year, month);

  // productIds (optional): scope the rebuild to a small set of products —
  // used for the cheap, per-order incremental rebuild triggered by real
  // order-lifecycle events (see events/analyticsHandlers.js) instead of a
  // full-month recompute across every product. Stale-row reconciliation
  // below is likewise scoped to just these products, so an unrelated
  // product's row is never touched (and never falsely deleted) by a
  // single order's incremental rebuild.
  const productMatch = productIds && productIds.length > 0
    ? { 'items.product': { $in: productIds } }
    : {};

  // Two-stage grouping so orderCount counts DISTINCT orders, not line
  // items: first collapse to one row per (product, order) pair — a
  // defensive step in case an order ever has more than one line item for
  // the same product — then group those rows by product, summing
  // unitsSold/revenue across all its orders and counting the rows (= the
  // number of distinct qualifying orders that contained it).
  const rows = await Order.aggregate([
    { $match: { ...SALES_TRUTH_MATCH, createdAt: { $gte: start, $lt: end } } },
    { $unwind: '$items' },
    ...(productIds && productIds.length > 0 ? [{ $match: productMatch }] : []),
    { $match: { 'items.itemType': 'product' } },
    {
      $group: {
        _id:      { product: '$items.product', order: '$_id' },
        unitsSold: { $sum: '$items.quantity' },
        // Real, historical, already-discounted transaction value locked at
        // checkout (orderItemSchema.totalPrice) — never the product's
        // current price. See task's revenue-semantics requirement.
        revenue:   { $sum: '$items.totalPrice' },
      },
    },
    {
      $group: {
        _id:        '$_id.product',
        unitsSold:  { $sum: '$unitsSold' },
        revenue:    { $sum: '$revenue' },
        orderCount: { $sum: 1 }, // one increment per distinct (product, order) row above
      },
    },
  ]);

  const currentProductIds = rows.map((r) => r._id);

  if (!dryRun) {
    await Promise.all(
      rows.map((r) =>
        // Aggregation-pipeline update ($set as an array, not an object) so
        // unitsSold/orderCount/revenue are computed as
        // historicalUnitsSold/historicalOrderCount/historicalRevenue (read
        // from the CURRENT document, defaulting to 0 if absent/new) PLUS
        // this real-Order-derived value — never a blind overwrite. This is
        // what lets the cutoff month (partially historical, partially
        // live) accumulate real orders on top of its seeded pre-cutoff
        // baseline instead of losing it the first time a live order
        // triggers a rebuild for that same month. For a purely-live month
        // (historicalUnitsSold never set, defaults to 0), this is
        // equivalent to the old plain $set.
        ProductSalesMonthly.findOneAndUpdate(
          { product: r._id, year, month },
          [{
            $set: {
              // Pipeline-style ($set-as-array) updates bypass Mongoose's
              // setDefaultsOnInsert, so historicalUnitsSold/etc. must be
              // explicitly normalized to 0 here on first insert — otherwise
              // a brand-new row (no prior historical seed for this
              // product/month) would persist these as literally undefined
              // rather than the schema's documented default.
              historicalUnitsSold:  { $ifNull: ['$historicalUnitsSold', 0] },
              historicalOrderCount: { $ifNull: ['$historicalOrderCount', 0] },
              historicalRevenue:    { $ifNull: ['$historicalRevenue', 0] },
              unitsSold:  { $add: [{ $ifNull: ['$historicalUnitsSold', 0] }, r.unitsSold] },
              orderCount: { $add: [{ $ifNull: ['$historicalOrderCount', 0] }, r.orderCount] },
              revenue:    { $round: [{ $add: [{ $ifNull: ['$historicalRevenue', 0] }, r.revenue] }, 2] },
            },
          }],
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );
  }

  // Reconcile products that had a row for this month from an earlier
  // rebuild but have zero REAL qualifying sales now (e.g. their only order
  // was since cancelled/refunded). When scoped to productIds (the
  // incremental-rebuild path), only those specific products are eligible —
  // never the whole month's catalog, which a single order's rebuild has no
  // information about one way or the other.
  //
  // A row with a real historical-seed baseline (historicalUnitsSold > 0)
  // must NEVER be deleted just because its live component dropped to zero
  // — that would erase real pre-cutoff history over a live cancellation
  // that has nothing to do with it. Such rows are RESET to their historical
  // baseline only (unitsSold = historicalUnitsSold, etc.) instead. Only a
  // row with zero historical baseline is deleted outright — the original,
  // unchanged behavior for an ordinary post-cutoff month.
  const staleFilter = productIds && productIds.length > 0
    ? { year, month, product: { $in: productIds, $nin: currentProductIds } }
    : { year, month, product: { $nin: currentProductIds } };
  const staleRows = await ProductSalesMonthly.find(staleFilter).select('_id historicalUnitsSold').lean();
  const toDelete = staleRows.filter((r) => (r.historicalUnitsSold ?? 0) === 0).map((r) => r._id);
  const toReset  = staleRows.filter((r) => (r.historicalUnitsSold ?? 0) > 0).map((r) => r._id);

  if (!dryRun) {
    if (toDelete.length > 0) {
      await ProductSalesMonthly.deleteMany({ _id: { $in: toDelete } });
    }
    if (toReset.length > 0) {
      await ProductSalesMonthly.updateMany(
        { _id: { $in: toReset } },
        [{
          $set: {
            unitsSold:  { $ifNull: ['$historicalUnitsSold', 0] },
            orderCount: { $ifNull: ['$historicalOrderCount', 0] },
            revenue:    { $ifNull: ['$historicalRevenue', 0] },
          },
        }]
      );
    }
  }
  const staleCount = toDelete.length + toReset.length;

  return {
    year, month,
    productsWithSales: rows.length,
    staleRecordsRemoved: staleCount,
    dryRun,
    rows: rows.map((r) => ({
      product: String(r._id),
      unitsSold: r.unitsSold,
      orderCount: r.orderCount,
      revenue: Math.round(r.revenue * 100) / 100,
    })),
  };
}

// Rebuilds every month from {fromYear,fromMonth} through {toYear,toMonth}
// inclusive — a thin loop over rebuildProductSalesMonth, used by the CLI
// script for a date-range rebuild.
async function rebuildProductSalesRange(fromYear, fromMonth, toYear, toMonth, opts = {}) {
  const results = [];
  let y = fromYear, m = fromMonth;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    results.push(await rebuildProductSalesMonth(y, m, opts));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return results;
}

// ─── Admin product sales history ───────────────────────────────────────────────
//
// The LIVE portion of totalUnitsSold is derived directly from real Order
// history (not summed from ProductSalesMonthly), so it's correct even for a
// product whose analytics haven't been rebuilt yet. The historical-baseline
// portion (Product.historicalSalesCount — see server/config/analytics.js)
// is added on top, never blended into the live aggregation itself: real
// Order documents never exist for the seeded historical window, so the two
// sources can only ever be additive, never double-counted. A product with
// no historical baseline (created after the seed ran) simply adds 0.
async function getProductSalesHistory(productId, months = 12) {
  const id = new mongoose.Types.ObjectId(productId);

  const [totalAgg, product] = await Promise.all([
    Order.aggregate([
      { $match: SALES_TRUTH_MATCH },
      { $unwind: '$items' },
      { $match: { 'items.itemType': 'product', 'items.product': id } },
      { $group: { _id: null, unitsSold: { $sum: '$items.quantity' } } },
    ]),
    Product.findById(id).select('historicalSalesCount historicalRevenue').lean(),
  ]);
  const liveUnitsSold = totalAgg[0]?.unitsSold ?? 0;
  const historicalUnitsSold = product?.historicalSalesCount ?? 0;
  const totalUnitsSold = liveUnitsSold + historicalUnitsSold;

  const now = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1; // 1-12

  // Chronological list of the last `months` {year, month} pairs, ending at
  // (and including) the current month.
  const monthKeys = [];
  for (let i = months - 1; i >= 0; i--) {
    const idx = currentYear * 12 + (currentMonth - 1) - i; // 0-based absolute month index
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    monthKeys.push({ year: y, month: m });
  }

  const records = await ProductSalesMonthly.find({
    product: id,
    $or: monthKeys.map(({ year, month }) => ({ year, month })),
  }).lean();
  const byKey = new Map(records.map((r) => [`${r.year}-${r.month}`, r]));

  const history = monthKeys.map(({ year, month }) => {
    const rec = byKey.get(`${year}-${month}`);
    return {
      year, month,
      unitsSold:  rec?.unitsSold  ?? 0,
      orderCount: rec?.orderCount ?? 0,
      revenue:    rec?.revenue    ?? 0,
    };
  });

  const currentMonthEntry  = history[history.length - 1];
  const previousMonthEntry = history.length >= 2 ? history[history.length - 2] : null;

  // Undefined (null), not a fabricated 0% or 100%, when there's no real
  // previous-month baseline to compare against — "safely handled" means
  // never dividing by zero or inventing a percentage, not guessing one.
  const monthOverMonthPercent =
    previousMonthEntry && previousMonthEntry.unitsSold > 0
      ? Math.round(((currentMonthEntry.unitsSold - previousMonthEntry.unitsSold) / previousMonthEntry.unitsSold) * 10000) / 100
      : null;

  return {
    productId: String(id),
    totalUnitsSold,
    historicalUnitsSold, // internal/auditing transparency — not shown as a separate figure to ordinary admin users, just documents the split
    currentMonth: currentMonthEntry,
    previousMonth: previousMonthEntry,
    monthOverMonthPercent,
    history,
  };
}

module.exports = {
  rebuildProductSalesMonth,
  rebuildProductSalesRange,
  getProductSalesHistory,
};
