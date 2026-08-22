'use strict';

/**
 * Single source of truth for the historical-analytics redesign's constants.
 *
 * TechVault's real transactional history is short (this is a young
 * production deployment). To give Admin/Warehouse/SuperAdmin a believable
 * ~2-year operating history, a deterministic historical baseline is seeded
 * for every calendar day/month strictly BEFORE HISTORICAL_DATA_CUTOFF, and
 * every day from the cutoff onward is live, genuinely computed from real
 * Order/Product/Cart/etc. activity. The two are additive per period — see
 * server/docs/analytics-architecture.md for the full continuity model.
 *
 * HISTORICAL_DATA_CUTOFF is a real Date instant (Israel local midnight,
 * 2026-08-22), not just a display string — every service/script that needs
 * "is this date historical or live" compares against this single constant.
 */
const HISTORICAL_DATA_CUTOFF = new Date('2026-08-22T00:00:00+03:00');

// TechVault is an Israel-only storefront — all daily/monthly analytics
// bucketing and business-target periods use this timezone (see
// server/utils/timezone.js), not the server process's local/UTC time.
const BUSINESS_TIMEZONE = 'Asia/Jerusalem';

// How far back the seeded historical baseline reaches, in whole calendar
// months before the cutoff month. 22 months before an Aug 2026 cutoff lands
// the window start in Oct 2024 — comfortably inside "operating ~2 years".
const HISTORICAL_WINDOW_MONTHS = 22;

// Idempotency/audit tag stamped on every document the historical generator
// writes (AnalyticsDaily.source, ProductSalesMonthly.source,
// BusinessTarget.source, Campaign.historicalStats.source, Product's
// historical fields are matched against this via the generator's own
// tracking, not stored per-field). Bump the version suffix (v2, v3, ...)
// only for a deliberate, reviewed regeneration — never to silently
// re-run the same logic.
const HISTORICAL_SEED_SOURCE = 'historical_seed_v1';

module.exports = {
  HISTORICAL_DATA_CUTOFF,
  BUSINESS_TIMEZONE,
  HISTORICAL_WINDOW_MONTHS,
  HISTORICAL_SEED_SOURCE,
};
