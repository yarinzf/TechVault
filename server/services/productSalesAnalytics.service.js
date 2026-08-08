'use strict';

const mongoose = require('mongoose');
const Order               = require('../models/Order');
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
async function rebuildProductSalesMonth(year, month, { dryRun = false } = {}) {
  const { start, end } = getUtcMonthBoundaries(year, month);

  // Two-stage grouping so orderCount counts DISTINCT orders, not line
  // items: first collapse to one row per (product, order) pair — a
  // defensive step in case an order ever has more than one line item for
  // the same product — then group those rows by product, summing
  // unitsSold/revenue across all its orders and counting the rows (= the
  // number of distinct qualifying orders that contained it).
  const rows = await Order.aggregate([
    { $match: { ...SALES_TRUTH_MATCH, createdAt: { $gte: start, $lt: end } } },
    { $unwind: '$items' },
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
        ProductSalesMonthly.findOneAndUpdate(
          { product: r._id, year, month },
          { $set: { unitsSold: r.unitsSold, orderCount: r.orderCount, revenue: Math.round(r.revenue * 100) / 100 } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );
  }

  // Reconcile away stale rows — a product that had a record for this month
  // from an earlier rebuild but has zero qualifying sales NOW (e.g. its
  // only order was since cancelled/refunded) must not keep a phantom
  // positive value.
  const staleFilter = { year, month, product: { $nin: currentProductIds } };
  const staleCount = await ProductSalesMonthly.countDocuments(staleFilter);
  if (!dryRun && staleCount > 0) {
    await ProductSalesMonthly.deleteMany(staleFilter);
  }

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
// totalUnitsSold is derived directly from real Order history (not summed
// from ProductSalesMonthly), so it's correct even for a product whose
// analytics haven't been rebuilt yet, or for a month range wider than the
// requested history window — it never falls back to the old seeded
// Product.salesCount.
async function getProductSalesHistory(productId, months = 12) {
  const id = new mongoose.Types.ObjectId(productId);

  const totalAgg = await Order.aggregate([
    { $match: SALES_TRUTH_MATCH },
    { $unwind: '$items' },
    { $match: { 'items.itemType': 'product', 'items.product': id } },
    { $group: { _id: null, unitsSold: { $sum: '$items.quantity' } } },
  ]);
  const totalUnitsSold = totalAgg[0]?.unitsSold ?? 0;

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
