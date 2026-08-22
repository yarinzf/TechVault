'use strict';

const mongoose = require('mongoose');

/**
 * A materialized/reporting layer over real Order/OrderItem history — NEVER
 * the source of truth itself. Every field here is fully derivable (and
 * re-derivable) from Order documents via
 * productSalesAnalytics.service.js#rebuildProductSalesMonth. If this
 * collection is ever wrong, dropped, or out of sync, it can always be
 * rebuilt from Orders with no data loss — Orders remain authoritative.
 */
const productSalesMonthlySchema = new mongoose.Schema(
  {
    product: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Product',
      required: true,
    },
    year:  { type: Number, required: true, min: 2000, max: 3000 },
    month: { type: Number, required: true, min: 1, max: 12 },

    // Real, aggregated quantity sold this month (qualifying orders only —
    // see SALES_TRUTH_MATCH in recommendation.service.js).
    unitsSold: { type: Number, required: true, min: 0, default: 0 },

    // Count of DISTINCT qualifying orders containing this product this
    // month — not the same as unitsSold (one order for 5 units is
    // orderCount: 1, unitsSold: 5).
    orderCount: { type: Number, required: true, min: 0, default: 0 },

    // Sum of the real, historical OrderItem.totalPrice for this product
    // this month — the actual amount charged at checkout (already
    // reflecting whatever campaign discount applied at that time), never
    // recomputed from the product's current price.
    revenue: { type: Number, required: true, min: 0, default: 0 },

    // 'live' (default) — this row was produced by rebuildProductSalesMonth
    // from real Order documents, exactly as before this field existed.
    // 'historical_seed_v1' — this row was written once by the historical
    // analytics generator. For a month strictly before
    // HISTORICAL_DATA_CUTOFF, rebuildProductSalesMonth never touches it (no
    // real Orders exist there). For the CUTOFF MONTH itself (which can be
    // partially historical, e.g. Aug 1-21, and partially live, Aug 22+),
    // this is set to 'historical_seed_v1' even though the row's `unitsSold`/
    // `revenue`/`orderCount` may later ALSO include a live component — see
    // historicalUnitsSold/historicalRevenue/historicalOrderCount below.
    source: { type: String, enum: ['historical_seed_v1', 'live'], default: 'live' },

    // Frozen historical-seed-only contribution for this exact (product,
    // year, month) — written ONCE by the generator, NEVER modified by
    // rebuildProductSalesMonth. For a purely historical month these equal
    // unitsSold/revenue/orderCount exactly; for the cutoff month they hold
    // only the pre-cutoff (e.g. Aug 1-21) portion. rebuildProductSalesMonth
    // always computes unitsSold = historicalUnitsSold + (real Orders this
    // month), so a live order landing in the cutoff month can only ever ADD
    // to this row, never overwrite/erase its historical portion — the
    // concrete mechanism preventing the cutoff month from losing its
    // pre-cutoff baseline the first time a real order triggers a rebuild.
    historicalUnitsSold:  { type: Number, default: 0, min: 0 },
    historicalRevenue:    { type: Number, default: 0, min: 0 },
    historicalOrderCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// One row per product per month — rebuildProductSalesMonth upserts against
// this exact key, so re-running the rebuild for the same month is always
// idempotent rather than creating duplicates.
productSalesMonthlySchema.index({ product: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('ProductSalesMonthly', productSalesMonthlySchema);
