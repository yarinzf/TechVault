'use strict';

const mongoose = require('mongoose');

/**
 * Persisted business targets/goals — replaces the hardcoded literals that
 * used to live directly in client/src/features/admin/components/
 * PerformanceGoals.jsx. A target here is a PLAN, never an actual: the
 * "actual" value for any (metric, period) is always computed independently
 * (see server/services/businessTarget.service.js#getActualForTarget), and
 * this document is never mutated just because real performance came in
 * above or below it — see requirement #17 in the analytics redesign.
 *
 * periodStart/periodEnd are Israel-timezone-aligned boundaries (see
 * server/utils/timezone.js) — a 'day' target's periodStart/periodEnd is
 * exactly one Israel calendar day, a 'month' target's is one Israel
 * calendar month.
 */
const METRICS = [
  'daily_revenue',
  'monthly_revenue',
  'daily_orders',
  'monthly_orders',
  'new_customers',
  'conversion_rate',
  'cancellation_rate',
  'abandoned_cart_rate',
];

const businessTargetSchema = new mongoose.Schema(
  {
    metric:     { type: String, enum: METRICS, required: true },
    periodType: { type: String, enum: ['day', 'month'], required: true },
    periodStart: { type: Date, required: true },
    periodEnd:   { type: Date, required: true },

    targetValue: { type: Number, required: true, min: 0 },

    // Who/what created this row — null for seeded historical/near-future
    // rows, a real admin's User._id when hand-set via the targets API.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // 'historical_seed_v1' (generator), 'admin_set' (via the targets API),
    // or 'auto_generated' (a future rolling-forward helper reusing the same
    // trend formula the generator uses — not built in this pass beyond the
    // exported helper it could call).
    source: { type: String, enum: ['historical_seed_v1', 'admin_set', 'auto_generated'], required: true },

    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// One target per (metric, periodType, periodStart) — upserts against this
// key are idempotent, matching every other historical-seed collection.
businessTargetSchema.index({ metric: 1, periodType: 1, periodStart: 1 }, { unique: true });
// Range queries ("all daily_revenue targets between X and Y").
businessTargetSchema.index({ metric: 1, periodStart: 1 });

module.exports = mongoose.model('BusinessTarget', businessTargetSchema);
module.exports.METRICS = METRICS;
