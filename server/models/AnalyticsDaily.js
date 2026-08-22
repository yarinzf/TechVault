'use strict';

const mongoose = require('mongoose');

/**
 * The single materialized daily business-analytics table. One row per real
 * Israel calendar day (see server/utils/timezone.js), covering revenue/
 * orders, traffic/conversion, cart abandonment, and coarse inventory-event
 * counts — deliberately one table rather than a family of
 * AnalyticsDaily/CategoryAnalyticsDaily/TrafficAnalyticsDaily/... tables,
 * since a day's worth of business activity is cheap to store together and
 * every range query (7d/30d/90d/MTD/YTD/1y/all-time) needs the same rows.
 *
 * `date` is stored as the exact Israel-midnight UTC instant beginning that
 * calendar day (server/utils/timezone.js#israelMidnightUtc) — never a plain
 * date-only value with implicit UTC-midnight semantics, which would be
 * wrong for an Israel business by 2-3 hours.
 *
 * Two kinds of rows:
 *  - source: 'historical_seed_v1' — written once by the historical
 *    generator for every day strictly before HISTORICAL_DATA_CUTOFF.
 *  - source: 'live' — written by the (now-persisting) dailySnapshot job for
 *    each Israel calendar day AFTER it has fully completed. The CURRENT,
 *    still-in-progress Israel day is deliberately never given a row here —
 *    "today" is always computed live via real-time Order/Cart/etc.
 *    aggregation (see analyticsDaily.service.js), matching how the existing
 *    dashboard already treats "today" before this redesign.
 *
 * Every field is either a real aggregate of real transactional data (revenue,
 * orders, unitsSold, cancelledOrders, refundedOrders, refundAmount,
 * newCustomers, returningCustomers) or a real count of a genuinely tracked
 * event (sessions/productPageViews via the new /api/v1/track/visit beacon;
 * cartsStarted/abandonedCarts/abandonedCartValue via cleanupCarts.job.js;
 * lowStockEvents/outOfStockEvents/restockEvents via inventory.service.js).
 * None of these are ever fabricated independently of each other — see
 * server/docs/analytics-architecture.md for the exact reconciliation rules
 * the historical generator follows.
 */
const analyticsDailySchema = new mongoose.Schema(
  {
    date:   { type: Date, required: true },
    source: { type: String, enum: ['historical_seed_v1', 'live'], required: true },

    // ── Revenue / orders ────────────────────────────────────────────────
    revenue:         { type: Number, default: 0, min: 0 },
    orders:          { type: Number, default: 0, min: 0 }, // all orders created this day, any status
    paidOrders:      { type: Number, default: 0, min: 0 }, // REVENUE_MATCH-qualifying orders
    unitsSold:       { type: Number, default: 0, min: 0 },
    cancelledOrders: { type: Number, default: 0, min: 0 },
    refundedOrders:  { type: Number, default: 0, min: 0 },
    refundAmount:    { type: Number, default: 0, min: 0 },
    newCustomers:       { type: Number, default: 0, min: 0 },
    returningCustomers: { type: Number, default: 0, min: 0 },
    aov:                { type: Number, default: 0, min: 0 }, // stored for query convenience; always revenue/paidOrders

    // ── Traffic / conversion ────────────────────────────────────────────
    sessions:         { type: Number, default: 0, min: 0 },
    productPageViews: { type: Number, default: 0, min: 0 },
    conversionRate:   { type: Number, default: 0, min: 0 }, // stored derived value: paidOrders / sessions * 100

    // ── Cart abandonment ────────────────────────────────────────────────
    cartsStarted:       { type: Number, default: 0, min: 0 },
    abandonedCarts:     { type: Number, default: 0, min: 0 },
    abandonedCartValue: { type: Number, default: 0, min: 0 },

    // ── Inventory events (coarse daily counts, no per-item ledger rows) ─
    lowStockEvents:   { type: Number, default: 0, min: 0 },
    outOfStockEvents: { type: Number, default: 0, min: 0 },
    restockEvents:    { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// One row per calendar day — every writer (generator, dailySnapshot job)
// upserts against this key, so a re-run is always idempotent.
analyticsDailySchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('AnalyticsDaily', analyticsDailySchema);
