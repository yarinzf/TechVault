#!/usr/bin/env node
'use strict';

/**
 * generateHistoricalAnalytics.js — HISTORICAL ANALYTICS BASELINE GENERATOR.
 *
 * Gives TechVault a realistic ~22-month operating history (see
 * server/config/analytics.js — HISTORICAL_WINDOW_MONTHS / HISTORICAL_DATA_CUTOFF)
 * WITHOUT creating a single fake Order document. It writes only into the
 * analytics layer:
 *   - AnalyticsDaily     (one row per historical Israel calendar day)
 *   - ProductSalesMonthly (historical rows, reconciled against the daily totals)
 *   - BusinessTarget     (historical + near-future daily/monthly targets)
 *   - Product.historicalSalesCount / historicalRevenue (per-product baseline)
 *   - a small number of real, back-dated historical Campaign documents with
 *     a frozen `historicalStats` summary
 *
 * Real Orders/Users/Carts/InventoryMovement/etc. are never touched — see
 * requirement #6 in the analytics redesign ("do not fake hundreds of normal
 * Orders"). Every number is a pure, deterministic function of the real
 * Product catalog read at run time (server/utils/deterministicRandom.js) —
 * re-running this script against the same catalog always reproduces the
 * exact same historical baseline.
 *
 * Reconciliation guarantee: for every historical month, the SUM of that
 * month's AnalyticsDaily.revenue/unitsSold across its days EXACTLY equals
 * the SUM of that month's ProductSalesMonthly.revenue/unitsSold across all
 * products (see allocateMonthlyProductSales / apportionMonthlyUnitsToDays)
 * — never two independently-invented numbers that happen to disagree.
 *
 * Safety model (mirrors server/scripts/curateProductionStorefront.js):
 *   - Requires an explicit --dry-run or --apply flag; anything else prints
 *     usage and exits non-zero without touching the database.
 *   - When NODE_ENV=production: refuses to run unless MONGO_URI_PROD is set
 *     and does not resolve to localhost, and HISTORICAL_SEED_CONFIRM is set
 *     to the exact required value (never stored in .env). Dev/test runs
 *     skip these production-only gates.
 *   - Idempotent: every write is tagged HISTORICAL_SEED_SOURCE
 *     ('historical_seed_v1'). --apply refuses to run a second time once
 *     that marker is already present anywhere — re-running only prints
 *     "already initialized" and makes no changes.
 *   - Never deletes/overwrites real Orders/Users/Carts/Products (only ADDS
 *     the historicalSalesCount/historicalRevenue fields on existing
 *     Product documents and creates new, clearly-marked Campaign rows).
 *
 * Usage:
 *   node server/scripts/generateHistoricalAnalytics.js --dry-run
 *   node server/scripts/generateHistoricalAnalytics.js --apply
 */

const mongoose = require('mongoose');
const {
  HISTORICAL_DATA_CUTOFF,
  HISTORICAL_WINDOW_MONTHS,
  HISTORICAL_SEED_SOURCE,
} = require('../config/analytics');
const {
  getIsraelDateParts,
  getIsraelMonthBoundaries,
  israelMidnightUtc,
} = require('../utils/timezone');
const { rngFor, nextFloat, nextInt } = require('../utils/deterministicRandom');

const REQUIRED_CONFIRM_VALUE = 'TECHVAULT_PRODUCTION';
const FUTURE_TARGET_DAYS = 90; // how far past the cutoff to pre-generate BusinessTarget rows

// ─── Business-scale curve — grows from a modest starting daily volume to
// roughly the ₪38,000/day band the brief's own daily-target example uses,
// over the full historical window. ────────────────────────────────────────
const START_DAILY_ORDERS = 22;
const END_DAILY_ORDERS   = 85;
const START_AOV = 320;
const END_AOV    = 445;

const CANCEL_RATE_RANGE   = [0.03, 0.065];
const REFUND_RATE_RANGE   = [0.01, 0.025];
const NEW_CUSTOMER_RATIO_RANGE = [0.25, 0.42];
const CONVERSION_RATE_RANGE    = [0.022, 0.038]; // 2.2%-3.8%
const ABANDON_RATE_RANGE       = [0.60, 0.75];
const PAGES_PER_SESSION_RANGE  = [2.4, 4.6];

// How much a month's raw sum of per-product orderCount values (each
// product's own "distinct orders containing it") over-counts the TRUE
// number of distinct orders that month, because some real orders contain
// more than one distinct product (a mouse + a mousepad, a monitor + a
// cable, etc). 1.05-1.20 means the average order spans roughly 1.05x-1.20x
// as many product-rows as it does distinct orders — i.e. the strong
// majority of orders are single-product, a believable minority span two or
// more. See buildFullPlan's monthOrders computation / finalizeMonthOrders.
const BASKET_DIVERSITY_FACTOR_RANGE = [1.05, 1.20];

// ─── Safety guards (mirrors curateProductionStorefront.js) ─────────────────
function assertProductionSafety() {
  if (process.env.NODE_ENV !== 'production') return; // dev/test — no gate
  const errors = [];
  const uri = process.env.MONGO_URI_PROD || '';
  if (!uri) errors.push('MONGO_URI_PROD is not set');
  else if (/localhost|127\.0\.0\.1/i.test(uri)) errors.push('MONGO_URI_PROD resolves to localhost — refusing to run against a local database');
  if (process.env.HISTORICAL_SEED_CONFIRM !== REQUIRED_CONFIRM_VALUE) {
    errors.push(`HISTORICAL_SEED_CONFIRM must equal exactly "${REQUIRED_CONFIRM_VALUE}"`);
  }
  if (errors.length) throw new Error('ABORT — production safety check failed:\n  - ' + errors.join('\n  - '));
}

function assertConnectionIsNotLocal() {
  if (process.env.NODE_ENV !== 'production') return;
  const host = mongoose.connection.host || '';
  if (/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error(`ABORT — connected Mongo host "${host}" looks local, not production`);
  }
}

// ─── Calendar helpers ───────────────────────────────────────────────────────
function windowStartDate() {
  const { year, month } = getIsraelDateParts(HISTORICAL_DATA_CUTOFF);
  let y = year, m = month - HISTORICAL_WINDOW_MONTHS;
  while (m <= 0) { m += 12; y -= 1; }
  return getIsraelMonthBoundaries(y, m).start;
}

// Every historical Israel calendar day from windowStart (inclusive) to
// HISTORICAL_DATA_CUTOFF (exclusive) — never includes the cutoff day itself
// or anything after it, which is live-only territory.
function buildHistoricalDayList() {
  const start = windowStartDate();
  const days = [];
  let cursor = start;
  let idx = 0;
  while (cursor < HISTORICAL_DATA_CUTOFF) {
    const { year, month, day } = getIsraelDateParts(new Date(cursor.getTime() + 12 * 60 * 60 * 1000));
    const dayStart = israelMidnightUtc(year, month, day);
    const nextCursor = new Date(dayStart.getTime() + 25 * 60 * 60 * 1000);
    const { year: ny, month: nm, day: nd } = getIsraelDateParts(nextCursor);
    const dayEnd = israelMidnightUtc(ny, nm, nd);
    days.push({ year, month, day, dateStart: dayStart, dateEnd: dayEnd, dayIndex: idx, monthKey: `${year}-${month}` });
    cursor = dayEnd;
    idx += 1;
  }
  return days;
}

// Future (cutoff-onward) calendar days — target-only, no AnalyticsDaily/
// ProductSalesMonthly rows are ever generated for these.
function buildFutureDayList(historicalDays) {
  const days = [];
  let cursor = HISTORICAL_DATA_CUTOFF;
  let idx = historicalDays.length;
  const endInstant = new Date(HISTORICAL_DATA_CUTOFF.getTime() + FUTURE_TARGET_DAYS * 24 * 60 * 60 * 1000);
  while (cursor < endInstant) {
    const { year, month, day } = getIsraelDateParts(new Date(cursor.getTime() + 12 * 60 * 60 * 1000));
    const dayStart = israelMidnightUtc(year, month, day);
    const nextCursor = new Date(dayStart.getTime() + 25 * 60 * 60 * 1000);
    const { year: ny, month: nm, day: nd } = getIsraelDateParts(nextCursor);
    const dayEnd = israelMidnightUtc(ny, nm, nd);
    days.push({ year, month, day, dateStart: dayStart, dateEnd: dayEnd, dayIndex: idx, monthKey: `${year}-${month}` });
    cursor = dayEnd;
    idx += 1;
  }
  return days;
}

const WEEKDAY_FACTOR = [1.05, 1.0, 1.0, 1.0, 1.05, 0.55, 0.35]; // Sun..Sat — Israeli weekend (Fri/Sat) is quiet
function weekdayFactor(year, month, day) {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_FACTOR[dow];
}

// Approximate Gregorian-month seasonality for an Israeli electronics store —
// deliberately simple (real Jewish-calendar holiday dates shift year to
// year; this is a defensible approximation, not a precise Hebrew-calendar
// model) plus one genuinely date-specific spike: Black Friday week.
function isBlackFridayWeek(year, month, day) {
  if (month !== 11) return false;
  // Last Friday of November, +/- 3 days.
  const lastDay = new Date(Date.UTC(year, 11, 0)).getUTCDate();
  let lastFriday = lastDay;
  while (new Date(Date.UTC(year, 10, lastFriday)).getUTCDay() !== 5) lastFriday -= 1;
  return Math.abs(day - lastFriday) <= 3;
}

function seasonalFactor(year, month, day, monthIndexInWindow) {
  if (isBlackFridayWeek(year, month, day)) return 2.1;
  const base = { 11: 1.3, 12: 1.2, 9: 1.1, 4: 1.1 }[month] ?? 1.0;
  const occasionalWeakMonth = monthIndexInWindow % 7 === 5 ? 0.88 : 1.0;
  return base * occasionalWeakMonth;
}

// ─── Per-day business curve — the ONE place order/revenue-scale numbers are
// invented; everything downstream (AnalyticsDaily fields, ProductSalesMonthly
// allocation, BusinessTarget) is derived FROM this, never independently. ───
function computeDayCurve(dayInfo, totalHistoricalDays, monthIndexInWindow) {
  const { year, month, day, dayIndex } = dayInfo;
  const progress = totalHistoricalDays > 1 ? dayIndex / (totalHistoricalDays - 1) : 1;

  const rng = rngFor(`${HISTORICAL_SEED_SOURCE}:day:${year}-${month}-${day}`);
  const noise = nextFloat(rng, 0.92, 1.08);

  const wFactor = weekdayFactor(year, month, day);
  const sFactor = seasonalFactor(year, month, day, monthIndexInWindow);

  const baseOrders = START_DAILY_ORDERS + (END_DAILY_ORDERS - START_DAILY_ORDERS) * progress;
  // A PRELIMINARY order estimate — used ONLY to derive `revenue` (the true,
  // fixed driver everything else in this generator reconciles against) via
  // revenue = orders × aov. It is NOT the final paidOrders. The real,
  // reported paidOrders is derived later in finalizeMonthOrders(), from the
  // SAME real per-product unit/order allocation units come from — an
  // independently-invented order count cannot be trusted to stay consistent
  // with a price/category-aware unit allocation (a desktop-heavy revenue
  // month needs far fewer units — and therefore far fewer orders — to reach
  // the same revenue than an accessory-heavy month would). See
  // finalizeMonthOrders for the fix to the orders/units business invariant.
  const preliminaryOrders = Math.max(1, Math.round(baseOrders * wFactor * sFactor * noise));

  // "Target" curve — the SAME base trend but WITHOUT the day's own
  // weekday/seasonal/noise wobble, rounded to a plannable figure. This is
  // what BusinessTarget stores: a smooth plan a real business would have
  // set in advance, which actual daily results then naturally beat or miss.
  const targetOrdersRaw = baseOrders;
  const aov = START_AOV + (END_AOV - START_AOV) * progress * nextFloat(rngFor(`${HISTORICAL_SEED_SOURCE}:aov:${year}-${month}-${day}`), 0.97, 1.03);

  const revenue = Math.round(preliminaryOrders * aov * 100) / 100;
  const targetRevenueRaw = targetOrdersRaw * aov;

  // Rates — stored (not just applied once) so finalizeMonthOrders can
  // recompute every order-derived field against the REAL, reconciled
  // paidOrders without re-rolling any randomness. Still fully deterministic:
  // each rate is drawn exactly once, here, from this day's own rng.
  const rates = {
    cancelRate:       nextFloat(rng, ...CANCEL_RATE_RANGE),
    refundRate:       nextFloat(rng, ...REFUND_RATE_RANGE),
    newCustomerRatio: nextFloat(rng, ...NEW_CUSTOMER_RATIO_RANGE),
    conversionRate:   nextFloat(rng, ...CONVERSION_RATE_RANGE),
    pagesPerSession:  nextFloat(rng, ...PAGES_PER_SESSION_RANGE),
    abandonRate:      nextFloat(rng, ...ABANDON_RATE_RANGE),
  };

  const lowStockEvents   = nextInt(rng, 0, 3);
  const outOfStockEvents = nextInt(rng, 0, 1);
  const restockEvents    = nextInt(rng, 0, 2);

  return {
    dayInfo, aov, rates,
    analyticsDaily: {
      date: dayInfo.dateStart, source: HISTORICAL_SEED_SOURCE,
      // orders/paidOrders/aov/cancelledOrders/refundedOrders/refundAmount/
      // newCustomers/returningCustomers/sessions/productPageViews/
      // conversionRate/cartsStarted/abandonedCarts/abandonedCartValue are
      // all finalized later by finalizeMonthOrders() once the real,
      // unit-derived monthOrders is known — never trust the zeros below as
      // final. unitsSold is filled in later too (apportionMonthlyUnitsToDays).
      revenue, orders: 0, paidOrders: 0, unitsSold: 0,
      cancelledOrders: 0, refundedOrders: 0, refundAmount: 0,
      newCustomers: 0, returningCustomers: 0,
      aov: 0,
      sessions: 0, productPageViews: 0, conversionRate: 0,
      cartsStarted: 0, abandonedCarts: 0, abandonedCartValue: 0,
      lowStockEvents, outOfStockEvents, restockEvents,
    },
    targets: {
      dailyRevenueTarget: Math.round(targetRevenueRaw / 100) * 100, // rounded to a plannable ₪100
      targetRevenueRaw, // kept at full precision for finalizeMonthOrders' order-target apportionment
      dailyOrdersTarget: 0, // finalized later, reconciled with the real order scale
    },
  };
}

// Distributes `total` proportionally to `weights`, with each slot capped at
// `caps[i]` — used to keep a single day's paidOrders from ever exceeding
// that SAME day's already-assigned unitsSold (not just the month aggregate).
// Pass 1: proportional-and-rounded, then clipped to each slot's cap. Pass 2:
// greedily tops up any slot with remaining headroom, in index order, until
// `total` is fully placed. Guaranteed to succeed whenever
// `total <= sum(caps)` (always true here — see finalizeMonthOrders).
function allocateWithCaps(total, weights, caps) {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const proportional = weights.map((w) => (weightSum > 0 ? total * (w / weightSum) : 0));
  const allocated = proportional.map((v, i) => Math.min(Math.round(v), caps[i]));

  let leftover = total - allocated.reduce((s, v) => s + v, 0);
  for (let i = 0; i < allocated.length && leftover > 0; i++) {
    const headroom = caps[i] - allocated[i];
    if (headroom <= 0) continue;
    const take = Math.min(headroom, leftover);
    allocated[i] += take;
    leftover -= take;
  }
  return allocated;
}

// ─── Finalize orders — the REAL, unit-reconciled paidOrders per day ───────
//
// Every completed merchandise order must contain at least one real unit —
// enforced at the DAY level, not just the month total: paidOrders for a
// given day can never exceed that SAME day's unitsSold (already assigned by
// apportionMonthlyUnitsToDays, which MUST run before this function — see
// buildFullPlan). `monthOrders` (computed by the caller from the real per-
// product orderCount values allocateMonthlyProductSales produced — the SAME
// data units come from, deflated by a realistic "average distinct products
// per order" factor) is distributed across days proportional to revenue
// share via allocateWithCaps, capped per-day at unitsSold — guaranteed to
// fully place `monthOrders` without violating any day's cap, because
// monthOrders <= monthUnitsSold = sum(caps) always holds (see
// BASKET_DIVERSITY_FACTOR_RANGE). Every other order-derived field (aov,
// cancellations, refunds, new/returning customers, sessions, conversion,
// cart abandonment) is then recomputed from the day's STORED rates (see
// computeDayCurve) against this real paidOrders — never re-rolled, still
// fully deterministic.
function finalizeMonthOrders(curves, monthOrders) {
  const revenueWeights = curves.map((c) => c.analyticsDaily.revenue);
  const unitCaps = curves.map((c) => c.analyticsDaily.unitsSold);
  const dayOrdersArr = allocateWithCaps(monthOrders, revenueWeights, unitCaps);

  const monthTargetRevenueRaw = curves.reduce((s, c) => s + c.targets.targetRevenueRaw, 0);
  let allocatedTargetOrders = 0;

  curves.forEach((c, i) => {
    const isLast = i === curves.length - 1;
    const paidOrders = dayOrdersArr[i];

    const targetRawShare = monthTargetRevenueRaw > 0
      ? Math.round(monthOrders * (c.targets.targetRevenueRaw / monthTargetRevenueRaw))
      : 0;
    const dayTargetOrders = isLast ? (monthOrders - allocatedTargetOrders) : targetRawShare;
    allocatedTargetOrders += dayTargetOrders;

    const { cancelRate, refundRate, newCustomerRatio, conversionRate, pagesPerSession, abandonRate } = c.rates;

    const cancelledOrders = Math.round(paidOrders * cancelRate);
    const refundedOrders  = Math.round(paidOrders * refundRate);
    const refundAmount    = Math.round(refundedOrders * c.aov * 0.85 * 100) / 100;
    const orders = paidOrders + cancelledOrders + refundedOrders;

    const distinctBuyers = Math.round(paidOrders * 0.88);
    const newCustomers = Math.round(distinctBuyers * newCustomerRatio);
    const returningCustomers = Math.max(0, distinctBuyers - newCustomers);

    const sessions = Math.max(paidOrders, Math.round(paidOrders / conversionRate));
    const productPageViews = Math.round(sessions * pagesPerSession);
    const actualConversionRate = sessions > 0 ? (paidOrders / sessions) * 100 : 0;

    // Abandonment: cartsStarted derived so abandonedCarts/(abandonedCarts+paidOrders)
    // EXACTLY equals the day's abandonment rate — exact-by-construction.
    const cartsStarted = Math.max(paidOrders, Math.round(paidOrders / (1 - abandonRate)));
    const abandonedCarts = cartsStarted - paidOrders;
    const abandonedCartValue = Math.round(abandonedCarts * c.aov * 0.7 * 100) / 100;

    Object.assign(c.analyticsDaily, {
      orders, paidOrders,
      cancelledOrders, refundedOrders, refundAmount,
      newCustomers, returningCustomers,
      // AOV is DERIVED — revenue / paidOrders, the correct revenue/order
      // population — never independently guessed, so it can never drift
      // from what Dashboard/Reports would compute from the same two fields.
      aov: paidOrders > 0 ? Math.round((c.analyticsDaily.revenue / paidOrders) * 100) / 100 : 0,
      sessions, productPageViews,
      conversionRate: Math.round(actualConversionRate * 100) / 100,
      cartsStarted, abandonedCarts, abandonedCartValue,
    });
    c.targets.dailyOrdersTarget = Math.max(0, Math.round(dayTargetOrders / 5) * 5);
  });
}

// ─── Category demand economics ──────────────────────────────────────────────
// A category's REVENUE weight = demandIndex × realAvgPrice(category).
// avgPrice comes from the REAL catalog (computed at run time from actual
// Product.price values — never hardcoded). demandIndex is a documented,
// defensible purchase-FREQUENCY heuristic — there is no real historical
// transaction data to derive frequency from (that's the entire premise of
// this generator), so it is keyed on category name using standard retail
// economics: small accessory/peripheral items are bought often (impulse
// purchases, gifts, multiple per household, frequent replacement); big-
// ticket computers/monitors are bought rarely (one purchase serves a
// household for years). This is deliberately decoupled from SKU count: a
// category with 5x more SKUs does not automatically earn 5x more revenue —
// it only means that category's own revenue share is split across more
// products (a longer tail within it), matching real catalog economics
// instead of "whichever category has the most SKUs wins".
const HIGH_FREQUENCY_KEYWORDS = [
  'mice', 'mouse', 'keyboard', 'headphone', 'headset', 'speaker', 'cable',
  'charger', 'case', 'mousepad', 'webcam', 'microphone', 'accessor', 'earbud',
];
const MEDIUM_FREQUENCY_KEYWORDS = [
  'storage', 'ssd', 'hdd', 'ram', 'memory', 'psu', 'power supply', 'cooling',
  'fan', 'network', 'router', 'smart home', 'printer', 'smartwatch', 'watch',
  'gaming chair', 'controller', 'flash drive', 'memory card',
];
const LOW_FREQUENCY_KEYWORDS = [
  'monitor', 'gpu', 'graphics', 'cpu', 'processor', 'motherboard', 'laptop',
  'tablet', 'tv', 'television', 'camera', 'console',
];
const LOWEST_FREQUENCY_KEYWORDS = [
  'desktop', 'mini pc', 'all-in-one', 'all in one', 'workstation',
];

function classifyCategoryDemandIndex(categoryName) {
  const name = (categoryName || '').toLowerCase();
  if (LOWEST_FREQUENCY_KEYWORDS.some((k) => name.includes(k))) return 0.15;
  if (LOW_FREQUENCY_KEYWORDS.some((k) => name.includes(k))) return 0.35;
  if (MEDIUM_FREQUENCY_KEYWORDS.some((k) => name.includes(k))) return 0.6;
  if (HIGH_FREQUENCY_KEYWORDS.some((k) => name.includes(k))) return 1.0;
  return 0.5; // unclassified category — a neutral default, not a disguised guess at a specific share
}

// One row per real Category with ≥1 priced product — { avgPrice, demandIndex, weight }.
function computeCategoryWeights(products, categoryNameById) {
  const byCategory = new Map();
  for (const p of products) {
    if (!p.category || !(p.price > 0)) continue;
    const key = String(p.category);
    const entry = byCategory.get(key) ?? { sumPrice: 0, count: 0 };
    entry.sumPrice += p.price;
    entry.count += 1;
    byCategory.set(key, entry);
  }
  const weights = new Map();
  for (const [catId, { sumPrice, count }] of byCategory) {
    const avgPrice = sumPrice / count;
    const demandIndex = classifyCategoryDemandIndex(categoryNameById.get(catId));
    weights.set(catId, { avgPrice: Math.round(avgPrice * 100) / 100, demandIndex, weight: demandIndex * avgPrice });
  }
  return weights;
}

// ─── Long-tail participation tiers ──────────────────────────────────────────
// A REAL ecommerce catalog does not sell every SKU every month — most SKUs
// don't sell every month at all. Each product is assigned ONE tier for its
// whole lifetime (ranked by its own popularity weight WITHIN its category,
// so a strong seller in a small category isn't unfairly buried behind an
// unrelated bestseller from a much larger one). The tier's
// participationProb is then rolled FRESH, deterministically, every single
// month (see allocateMonthlyProductSales) — a long-tail SKU that never wins
// its low-probability monthly roll across the whole ~22-month window ends
// up with zero historical sales, exactly the real-world long-tail shape.
const PARTICIPATION_TIERS = [
  { maxPercentile: 0.05, tier: 'bestseller', participationProb: 0.98 },
  { maxPercentile: 0.20, tier: 'strong',     participationProb: 0.75 },
  { maxPercentile: 0.50, tier: 'average',    participationProb: 0.35 },
  { maxPercentile: 0.80, tier: 'slow',       participationProb: 0.08 },
  { maxPercentile: 1.01, tier: 'longtail',   participationProb: 0.015 },
];
function tierForPercentile(percentile) {
  return PARTICIPATION_TIERS.find((t) => percentile <= t.maxPercentile);
}

// ─── Per-product profile — stable for the product's whole lifetime, never
// re-rolled per month, so "bestsellers stay bestsellers" across the window. ─
function buildProductProfiles(products, windowStart) {
  const totalWindowDays = Math.round((HISTORICAL_DATA_CUTOFF - windowStart) / (24 * 60 * 60 * 1000));
  const base = products.map((p) => {
    const key = p.sku || String(p._id);
    const launchRng = rngFor(`${HISTORICAL_SEED_SOURCE}:launch:${key}`);
    // Skewed toward 0 — most products "launch" near the window start (full
    // history); a smaller tail launches progressively later; a few land
    // within days of the cutoff (effectively zero historical sales).
    const launchFraction = Math.pow(launchRng(), 4);
    const launchOffsetDays = Math.round(launchFraction * totalWindowDays);
    const historicalLaunchDate = new Date(windowStart.getTime() + launchOffsetDays * 24 * 60 * 60 * 1000);

    const popularityRng = rngFor(`${HISTORICAL_SEED_SOURCE}:popularity:${key}`);
    const weight = Math.pow(popularityRng(), 2); // heavier tail = a smaller set of real within-category bestsellers

    return { product: p, historicalLaunchDate, weight };
  });

  const byCategory = new Map();
  for (const p of base) {
    const key = String(p.product.category);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(p);
  }
  for (const [, group] of byCategory) {
    const sorted = [...group].sort((a, b) => b.weight - a.weight);
    sorted.forEach((p, i) => {
      const percentile = group.length > 1 ? i / (group.length - 1) : 0;
      const t = tierForPercentile(percentile);
      p.tier = t.tier;
      p.participationProb = t.participationProb;
    });
  }

  return base;
}

// Distributes one month's total revenue in two stages: first across
// CATEGORIES (weighted by real price × demand-frequency, never SKU count),
// then within each category across its currently-ACTIVE products (a
// product only participates in a given month if it passes its tier's
// deterministic monthly roll AND has already launched). unitsSold_p is
// derived from revenue_p and the product's REAL price, never independently
// invented — so revenue/units/price stay mutually consistent for every row,
// and SUM(share) always reconciles exactly to monthRevenue.
function allocateMonthlyProductSales(monthRevenue, profiles, monthEnd, categoryWeights, monthKey) {
  const launched = profiles.filter((p) => p.historicalLaunchDate < monthEnd && p.product.price > 0);
  if (launched.length === 0 || monthRevenue <= 0) return { rows: [], monthUnitsSold: 0 };

  let active = launched.filter((p) => {
    const gateRng = rngFor(`${HISTORICAL_SEED_SOURCE}:participation:${p.product.sku}:${monthKey}`);
    return gateRng() < p.participationProb;
  });

  // The day-level revenue curve (computeDayCurve) is fixed independently of
  // product allocation — a month's revenue MUST land somewhere, or
  // AnalyticsDaily and ProductSalesMonthly stop reconciling. It is possible
  // (rare at real catalog scale, but not impossible — and more likely on a
  // very small/young catalog, or the very first historical month before
  // most products have launched) for every launched product to fail its
  // own tier's monthly roll in the SAME month. Deterministic fallback: the
  // single highest-weight launched product for that month is force-included
  // rather than leaving the month's revenue unallocated — driven by the
  // same weight ranking as everything else, never randomness.
  if (active.length === 0) {
    active = [[...launched].sort((a, b) => b.weight - a.weight)[0]];
  }

  const byCategory = new Map();
  for (const p of active) {
    const key = String(p.product.category);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(p);
  }
  const categoryKeys = [...byCategory.keys()].sort(); // deterministic order
  const totalCategoryWeight = categoryKeys.reduce((s, k) => s + (categoryWeights.get(k)?.weight ?? 0), 0);

  const rows = [];
  let allocatedRevenue = 0;
  categoryKeys.forEach((catKey, ci) => {
    const isLastCategory = ci === categoryKeys.length - 1;
    const catWeight = categoryWeights.get(catKey)?.weight ?? 0;
    const categoryShare = isLastCategory
      ? (monthRevenue - allocatedRevenue)
      : Math.round((monthRevenue * catWeight / totalCategoryWeight) * 100) / 100;
    allocatedRevenue += categoryShare;
    if (categoryShare <= 0) return;

    const group = byCategory.get(catKey);
    const totalProductWeight = group.reduce((s, p) => s + p.weight, 0);
    let allocatedInCategory = 0;
    group.forEach((p, pi) => {
      const isLastProduct = pi === group.length - 1;
      const share = isLastProduct
        ? (categoryShare - allocatedInCategory)
        : Math.round((categoryShare * p.weight / totalProductWeight) * 100) / 100;
      allocatedInCategory += share;
      if (share <= 0) return;

      const unitsSold = Math.max(1, Math.round(share / p.product.price));
      const orderCount = Math.max(1, Math.round(unitsSold * nextFloat(rngFor(`${HISTORICAL_SEED_SOURCE}:orders:${p.product.sku}`), 0.75, 0.95)));
      rows.push({ product: p.product._id, revenue: Math.round(share * 100) / 100, unitsSold, orderCount });
    });
  });

  const monthUnitsSold = rows.reduce((s, r) => s + r.unitsSold, 0);
  return { rows, monthUnitsSold };
}

// Spreads a month's product-derived unitsSold total back across that
// month's days, proportional to each day's own revenue share within the
// month — keeps AnalyticsDaily.unitsSold and the ProductSalesMonthly
// per-product totals reconciled to the same monthly figure by construction.
function apportionMonthlyUnitsToDays(monthDays, monthRevenue, monthUnitsSold) {
  if (monthRevenue <= 0 || monthUnitsSold <= 0) {
    monthDays.forEach((d) => { d.analyticsDaily.unitsSold = 0; });
    return;
  }
  let allocated = 0;
  monthDays.forEach((d, i) => {
    const isLast = i === monthDays.length - 1;
    const share = isLast
      ? monthUnitsSold - allocated
      : Math.round(monthUnitsSold * (d.analyticsDaily.revenue / monthRevenue));
    d.analyticsDaily.unitsSold = Math.max(0, share);
    allocated += share;
  });
}

// ─── Business targets — historical (reconciled to actuals with deliberate
// drift) + a near-future window so the widget never shows "no target set". ─
function buildDailyTargets(curves) {
  return curves.map((c) => [
    { metric: 'daily_revenue', periodType: 'day', periodStart: c.dayInfo.dateStart, periodEnd: c.dayInfo.dateEnd, targetValue: c.targets.dailyRevenueTarget },
    { metric: 'daily_orders', periodType: 'day', periodStart: c.dayInfo.dateStart, periodEnd: c.dayInfo.dateEnd, targetValue: c.targets.dailyOrdersTarget },
  ]).flat();
}

function buildMonthlyTargets(monthGroups) {
  const rows = [];
  for (const [monthKey, group] of monthGroups) {
    const [year, month] = monthKey.split('-').map(Number);
    const { start, end } = getIsraelMonthBoundaries(year, month);
    const revenueTarget = group.curves.reduce((s, c) => s + c.targets.dailyRevenueTarget, 0);
    const ordersTarget  = group.curves.reduce((s, c) => s + c.targets.dailyOrdersTarget, 0);
    const actualNewCustomers = group.curves.reduce((s, c) => s + c.analyticsDaily.newCustomers, 0);
    const rng = rngFor(`${HISTORICAL_SEED_SOURCE}:monthly-target:${monthKey}`);

    rows.push(
      { metric: 'monthly_revenue', periodType: 'month', periodStart: start, periodEnd: end, targetValue: Math.round(revenueTarget / 1000) * 1000 },
      { metric: 'monthly_orders', periodType: 'month', periodStart: start, periodEnd: end, targetValue: Math.round(ordersTarget / 10) * 10 },
      { metric: 'new_customers', periodType: 'month', periodStart: start, periodEnd: end, targetValue: Math.round(actualNewCustomers * nextFloat(rng, 0.9, 1.15)) },
      { metric: 'cancellation_rate', periodType: 'month', periodStart: start, periodEnd: end, targetValue: 5.0 },
    );
  }
  return rows;
}

// Future (cutoff-onward) targets — same smooth curve extrapolated forward,
// no AnalyticsDaily/ProductSalesMonthly counterpart (those must come from
// real activity), so only the target half is generated here.
function buildFutureTargets(futureDays, totalHistoricalDays) {
  const dailyRows = [];
  const byMonth = new Map();
  futureDays.forEach((dayInfo) => {
    const rng = rngFor(`${HISTORICAL_SEED_SOURCE}:future-day:${dayInfo.year}-${dayInfo.month}-${dayInfo.day}`);
    const progress = 1 + (dayInfo.dayIndex - totalHistoricalDays) / totalHistoricalDays * 0.15; // mild continued growth past the cutoff
    const baseOrders = END_DAILY_ORDERS * Math.min(progress, 1.3);
    const aov = END_AOV * nextFloat(rng, 0.98, 1.02);
    const revenueTarget = Math.round((baseOrders * aov) / 100) * 100;
    const ordersTarget = Math.round(baseOrders / 5) * 5;

    dailyRows.push(
      { metric: 'daily_revenue', periodType: 'day', periodStart: dayInfo.dateStart, periodEnd: dayInfo.dateEnd, targetValue: revenueTarget },
      { metric: 'daily_orders', periodType: 'day', periodStart: dayInfo.dateStart, periodEnd: dayInfo.dateEnd, targetValue: ordersTarget },
    );

    if (!byMonth.has(dayInfo.monthKey)) byMonth.set(dayInfo.monthKey, []);
    byMonth.get(dayInfo.monthKey).push({ revenueTarget, ordersTarget });
  });

  const monthlyRows = [];
  for (const [monthKey, entries] of byMonth) {
    // Only generate a monthly target for a month that's FULLY covered by
    // the future window (a partially-covered month, e.g. the remainder of
    // the cutoff month, would understate a real full-month target) —
    // matches the historical loop's per-month targets exactly for months
    // this window fully spans.
    const [year, month] = monthKey.split('-').map(Number);
    const { start, end } = getIsraelMonthBoundaries(year, month);
    const daysInMonth = Math.round((end - start) / (24 * 60 * 60 * 1000));
    if (entries.length < daysInMonth) continue;
    monthlyRows.push(
      { metric: 'monthly_revenue', periodType: 'month', periodStart: start, periodEnd: end, targetValue: entries.reduce((s, e) => s + e.revenueTarget, 0) },
      { metric: 'monthly_orders', periodType: 'month', periodStart: start, periodEnd: end, targetValue: entries.reduce((s, e) => s + e.ordersTarget, 0) },
    );
  }

  return [...dailyRows, ...monthlyRows];
}

// ─── Historical campaigns — a small, explicit set (Black Friday of each
// historical year), reusing real eligible products, never inventing a
// parallel campaign metric that isn't derivable from the same seeded sales. ─
function buildHistoricalCampaigns(monthGroups, profiles) {
  const campaigns = [];
  for (const [monthKey, group] of monthGroups) {
    const [year, month] = monthKey.split('-').map(Number);
    if (month !== 11) continue; // Black Friday months only

    const blackFridayDays = group.curves.filter((c) => isBlackFridayWeek(c.dayInfo.year, c.dayInfo.month, c.dayInfo.day));
    if (blackFridayDays.length === 0) continue;

    const { start: monthStart, end: monthEnd } = getIsraelMonthBoundaries(year, month);
    const eligible = profiles.filter((p) => p.historicalLaunchDate < monthEnd && p.product.price > 0);
    if (eligible.length === 0) continue;

    const rng = rngFor(`${HISTORICAL_SEED_SOURCE}:campaign:${monthKey}`);
    const sorted = [...eligible].sort((a, b) => b.weight - a.weight); // real bestsellers headline the campaign
    const picked = sorted.slice(0, Math.min(8, sorted.length));

    const bfDayStart = blackFridayDays[0].dayInfo.dateStart;
    const bfDayEnd = blackFridayDays[blackFridayDays.length - 1].dayInfo.dateEnd;
    const discountPercent = nextInt(rng, 25, 35);

    // Attribution is a SLICE of the already-seeded Black Friday-week revenue
    // for the picked products' month, not additional sales — matches the
    // live campaignAnalytics.service.js semantics (attribution labels a
    // subset of real sales, it doesn't create separate ones).
    const monthRevenueForPicked = group.rows.filter((r) => picked.some((p) => String(p.product._id) === String(r.product)));
    const attributedRevenue = Math.round(monthRevenueForPicked.reduce((s, r) => s + r.revenue, 0) * 0.22 * 100) / 100;
    const attributedUnits = Math.round(monthRevenueForPicked.reduce((s, r) => s + r.unitsSold, 0) * 0.22);
    const discountGenerated = Math.round(attributedRevenue * (discountPercent / (100 - discountPercent)) * 100) / 100;

    campaigns.push({
      name: `${HISTORICAL_SEED_SOURCE} — Black Friday ${year}`,
      title: `מבצע בלאק פריידיי ${year}`,
      discountPercent,
      startDate: bfDayStart,
      endDate: bfDayEnd,
      isActive: false,
      products: picked.map((p) => p.product._id),
      placement: 'none',
      historicalStats: {
        attributedOrders: Math.max(1, Math.round(attributedUnits / 1.3)),
        unitsSold: attributedUnits,
        revenue: attributedRevenue,
        discountGenerated,
        source: HISTORICAL_SEED_SOURCE,
      },
    });
  }
  return campaigns;
}

// ─── Plan ────────────────────────────────────────────────────────────────
async function buildFullPlan() {
  const Product = require('../models/Product');
  const Category = require('../models/Category');
  const AnalyticsDaily = require('../models/AnalyticsDaily');
  const ProductSalesMonthly = require('../models/ProductSalesMonthly');
  const BusinessTarget = require('../models/BusinessTarget');
  const Campaign = require('../models/Campaign');

  const alreadyApplied = (await AnalyticsDaily.countDocuments({ source: HISTORICAL_SEED_SOURCE })) > 0;

  const productCountBefore = await Product.countDocuments();
  const products = await Product.find({ isDeleted: false })
    .select('sku price category brand').lean();
  const categoryNameById = new Map(
    (await Category.find().select('name').lean()).map((c) => [String(c._id), c.name])
  );
  const categoryWeights = computeCategoryWeights(products, categoryNameById);

  const windowStart = windowStartDate();
  const historicalDays = buildHistoricalDayList();
  const futureDays = buildFutureDayList(historicalDays);
  const profiles = buildProductProfiles(products, windowStart);

  const monthGroups = new Map(); // monthKey -> { curves: [...], rows: [...] }
  historicalDays.forEach((dayInfo, i) => {
    if (!monthGroups.has(dayInfo.monthKey)) monthGroups.set(dayInfo.monthKey, { curves: [], rows: [] });
  });

  const monthKeys = [...monthGroups.keys()];
  monthKeys.forEach((monthKey, monthIndexInWindow) => {
    const group = monthGroups.get(monthKey);
    historicalDays.filter((d) => d.monthKey === monthKey).forEach((dayInfo) => {
      group.curves.push(computeDayCurve(dayInfo, historicalDays.length, monthIndexInWindow));
    });
  });

  // Product allocation + order/unit finalization, one month at a time.
  for (const [monthKey, group] of monthGroups) {
    const [year, month] = monthKey.split('-').map(Number);
    const { end: monthEnd } = getIsraelMonthBoundaries(year, month);
    const monthRevenue = group.curves.reduce((s, c) => s + c.analyticsDaily.revenue, 0);
    const { rows, monthUnitsSold } = allocateMonthlyProductSales(monthRevenue, profiles, monthEnd, categoryWeights, monthKey);
    group.rows = rows;

    if (rows.length === 0) {
      // No product has launched yet (or none qualify) this month — showing
      // sales revenue before any product exists is incoherent, so this
      // month's revenue (and everything derived from it) is zeroed too.
      // Only realistically reachable in the window's first few days on a
      // very small catalog — at real (thousands-of-products) scale some
      // product is essentially always launched well before month 1 ends.
      group.curves.forEach((c) => { c.analyticsDaily.revenue = 0; });
      apportionMonthlyUnitsToDays(group.curves, 0, 0);
      finalizeMonthOrders(group.curves, 0);
      continue;
    }

    // Units MUST be apportioned to days before orders — finalizeMonthOrders
    // caps each day's paidOrders at that SAME day's unitsSold, so the
    // orders<=units invariant holds per-day, not just as a month aggregate.
    apportionMonthlyUnitsToDays(group.curves, monthRevenue, monthUnitsSold);

    // monthOrders — the REAL distinct-order count for the month, derived
    // from the SAME per-product allocation units come from (never an
    // independent guess). See BASKET_DIVERSITY_FACTOR_RANGE and
    // finalizeMonthOrders for why this guarantees monthOrders <= monthUnitsSold.
    const rawOrderSum = rows.reduce((s, r) => s + r.orderCount, 0);
    const basketDiversityFactor = nextFloat(rngFor(`${HISTORICAL_SEED_SOURCE}:basket:${monthKey}`), ...BASKET_DIVERSITY_FACTOR_RANGE);
    const monthOrders = Math.max(1, Math.round(rawOrderSum / basketDiversityFactor));

    finalizeMonthOrders(group.curves, monthOrders);
  }

  // Aggregate per-product totals across all months (-> Product.historicalSalesCount/historicalRevenue).
  const productTotals = new Map(); // productId(string) -> { unitsSold, revenue }
  for (const [, group] of monthGroups) {
    for (const row of group.rows) {
      const key = String(row.product);
      const cur = productTotals.get(key) ?? { unitsSold: 0, revenue: 0 };
      cur.unitsSold += row.unitsSold;
      cur.revenue += row.revenue;
      productTotals.set(key, cur);
    }
  }

  const allCurves = [...monthGroups.values()].flatMap((g) => g.curves);
  const flatDailyTargets = buildDailyTargets(allCurves);
  const monthlyTargets = buildMonthlyTargets(monthGroups);
  const futureTargets = buildFutureTargets(futureDays, historicalDays.length);
  const campaigns = buildHistoricalCampaigns(monthGroups, profiles);

  const totalRevenue = allCurves.reduce((s, c) => s + c.analyticsDaily.revenue, 0);
  const totalOrders = allCurves.reduce((s, c) => s + c.analyticsDaily.paidOrders, 0);
  const totalUnits = allCurves.reduce((s, c) => s + c.analyticsDaily.unitsSold, 0);
  const productsWithHistory = productTotals.size;

  return {
    alreadyApplied,
    productCountBefore,
    windowStart, cutoff: HISTORICAL_DATA_CUTOFF,
    historicalDayCount: historicalDays.length,
    futureDayCount: futureDays.length,
    eligibleProductCount: products.length,
    productsWithHistory,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders, totalUnits,
    monthGroups, productTotals,
    dailyTargets: flatDailyTargets, monthlyTargets, futureTargets,
    campaigns,
  };
}

function printPlan(plan) {
  console.log('='.repeat(78));
  console.log('HISTORICAL ANALYTICS BASELINE — PLAN');
  console.log('='.repeat(78));
  console.log(`Window: ${plan.windowStart.toISOString().slice(0, 10)} -> ${plan.cutoff.toISOString().slice(0, 10)} (${plan.historicalDayCount} days)`);
  console.log(`Future target days generated: ${plan.futureDayCount}`);
  console.log(`Already initialized: ${plan.alreadyApplied ? 'YES — a second --apply will be a safe no-op' : 'no'}`);
  console.log(`Real products read: ${plan.eligibleProductCount} (${plan.productsWithHistory} received historical sales)`);
  console.log(`Product count (before, will not change): ${plan.productCountBefore}`);
  console.log('\n--- Totals ---');
  console.log(`Total historical revenue: ₪${plan.totalRevenue.toLocaleString()}`);
  console.log(`Total historical paid orders: ${plan.totalOrders.toLocaleString()}`);
  console.log(`Total historical units sold: ${plan.totalUnits.toLocaleString()}`);
  console.log(`Months generated: ${plan.monthGroups.size}`);
  console.log(`Daily targets: ${plan.dailyTargets.length}, Monthly targets: ${plan.monthlyTargets.length}, Future targets: ${plan.futureTargets.length}`);
  console.log(`Historical campaigns: ${plan.campaigns.length}`);
  plan.campaigns.forEach((c) => console.log(`  - ${c.title} (${c.startDate.toISOString().slice(0, 10)} -> ${c.endDate.toISOString().slice(0, 10)}, ${c.products.length} products, ₪${c.historicalStats.revenue} attributed)`));
  console.log('\n--- Sample months (first, middle, last) ---');
  const monthKeys = [...plan.monthGroups.keys()];
  [monthKeys[0], monthKeys[Math.floor(monthKeys.length / 2)], monthKeys[monthKeys.length - 1]].filter(Boolean).forEach((mk) => {
    const g = plan.monthGroups.get(mk);
    const rev = g.curves.reduce((s, c) => s + c.analyticsDaily.revenue, 0);
    const ord = g.curves.reduce((s, c) => s + c.analyticsDaily.paidOrders, 0);
    console.log(`  ${mk}: revenue=₪${Math.round(rev).toLocaleString()}, orders=${ord}, products with sales=${g.rows.length}`);
  });
  console.log('='.repeat(78));
}

// ─── Apply ───────────────────────────────────────────────────────────────
async function applyPlan(plan) {
  const Product = require('../models/Product');
  const AnalyticsDaily = require('../models/AnalyticsDaily');
  const ProductSalesMonthly = require('../models/ProductSalesMonthly');
  const BusinessTarget = require('../models/BusinessTarget');
  const Campaign = require('../models/Campaign');

  if (plan.alreadyApplied) {
    console.log('ABORT — historical seed marker already present. Refusing to apply again.');
    return { applied: false, reason: 'already_applied' };
  }

  const BATCH_SIZE = 1000;
  const bulkUpsert = async (Model, ops) => {
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = ops.slice(i, i + BATCH_SIZE);
      if (batch.length > 0) await Model.bulkWrite(batch, { ordered: false });
    }
  };

  // AnalyticsDaily
  const allCurves = [...plan.monthGroups.values()].flatMap((g) => g.curves);
  await bulkUpsert(AnalyticsDaily, allCurves.map((c) => ({
    updateOne: {
      filter: { date: c.analyticsDaily.date },
      update: { $set: c.analyticsDaily },
      upsert: true,
    },
  })));

  // ProductSalesMonthly
  const psmOps = [];
  for (const [monthKey, group] of plan.monthGroups) {
    const [year, month] = monthKey.split('-').map(Number);
    for (const row of group.rows) {
      psmOps.push({
        updateOne: {
          filter: { product: row.product, year, month },
          // historicalUnitsSold/historicalRevenue/historicalOrderCount are
          // the frozen baseline rebuildProductSalesMonth will always add a
          // live delta on top of (never overwrite) — see
          // productSalesAnalytics.service.js. unitsSold/revenue/orderCount
          // start equal to the same values so a month that never receives
          // any live order (the common case for most historical months)
          // still displays correctly via the total field alone.
          update: {
            $set: {
              unitsSold: row.unitsSold, orderCount: row.orderCount, revenue: row.revenue,
              historicalUnitsSold: row.unitsSold, historicalOrderCount: row.orderCount, historicalRevenue: row.revenue,
              source: HISTORICAL_SEED_SOURCE,
            },
          },
          upsert: true,
        },
      });
    }
  }
  await bulkUpsert(ProductSalesMonthly, psmOps);

  // Product.historicalSalesCount / historicalRevenue
  const productOps = [...plan.productTotals.entries()].map(([productId, totals]) => ({
    updateOne: {
      filter: { _id: productId },
      update: { $set: { historicalSalesCount: totals.unitsSold, historicalRevenue: Math.round(totals.revenue * 100) / 100 } },
    },
  }));
  await bulkUpsert(Product, productOps);

  // BusinessTarget (historical + future, all sourced 'historical_seed_v1')
  const allTargets = [...plan.dailyTargets, ...plan.monthlyTargets, ...plan.futureTargets];
  await bulkUpsert(BusinessTarget, allTargets.map((t) => ({
    updateOne: {
      filter: { metric: t.metric, periodType: t.periodType, periodStart: t.periodStart },
      update: { $set: { ...t, source: HISTORICAL_SEED_SOURCE, createdBy: null } },
      upsert: true,
    },
  })));

  // Historical campaigns
  const createdCampaignIds = [];
  for (const c of plan.campaigns) {
    const doc = await Campaign.create(c);
    createdCampaignIds.push(String(doc._id));
  }

  const productCountAfter = await Product.countDocuments();

  return {
    applied: true,
    analyticsDailyWritten: allCurves.length,
    productSalesMonthlyWritten: psmOps.length,
    productsUpdated: productOps.length,
    targetsWritten: allTargets.length,
    createdCampaignIds,
    productCountAfter,
  };
}

async function verifyInvariants(plan, applyResult) {
  const Product = require('../models/Product');
  const AnalyticsDaily = require('../models/AnalyticsDaily');
  const ProductSalesMonthly = require('../models/ProductSalesMonthly');

  const problems = [];

  if (applyResult.productCountAfter !== plan.productCountBefore) {
    problems.push(`productCountBefore (${plan.productCountBefore}) !== productCountAfter (${applyResult.productCountAfter}) — this script must never create/delete Products`);
  }

  const analyticsDailyCount = await AnalyticsDaily.countDocuments({ source: HISTORICAL_SEED_SOURCE });
  if (analyticsDailyCount !== plan.historicalDayCount) {
    problems.push(`Expected ${plan.historicalDayCount} historical AnalyticsDaily rows, found ${analyticsDailyCount}`);
  }

  // Reconciliation spot-check: for a sample month, sum(AnalyticsDaily.revenue)
  // must equal sum(ProductSalesMonthly.revenue) for that month — the core
  // internal-consistency guarantee (requirement #7).
  const sampleMonthKey = [...plan.monthGroups.keys()][0];
  if (sampleMonthKey) {
    const [year, month] = sampleMonthKey.split('-').map(Number);
    const group = plan.monthGroups.get(sampleMonthKey);
    const dailySum = Math.round(group.curves.reduce((s, c) => s + c.analyticsDaily.revenue, 0) * 100) / 100;
    const psmRows = await ProductSalesMonthly.find({ year, month, source: HISTORICAL_SEED_SOURCE }).select('revenue').lean();
    const psmSum = Math.round(psmRows.reduce((s, r) => s + r.revenue, 0) * 100) / 100;
    if (Math.abs(dailySum - psmSum) > 1) { // rounding tolerance across many small allocations
      problems.push(`Month ${sampleMonthKey}: AnalyticsDaily revenue sum (₪${dailySum}) does not reconcile with ProductSalesMonthly revenue sum (₪${psmSum})`);
    }
  }

  const productsWithHistory = await Product.countDocuments({ historicalSalesCount: { $gt: 0 } });
  if (productsWithHistory !== plan.productsWithHistory) {
    problems.push(`Expected ${plan.productsWithHistory} products with historicalSalesCount > 0, found ${productsWithHistory}`);
  }

  return problems;
}

// ─── CLI ─────────────────────────────────────────────────────────────────
async function runAsCli() {
  const args = process.argv.slice(2);
  const mode = args.includes('--apply') ? 'apply' : args.includes('--dry-run') ? 'dry-run' : null;

  if (!mode) {
    console.error('Usage: node server/scripts/generateHistoricalAnalytics.js --dry-run | --apply');
    console.error('No flag was provided — refusing to run.');
    process.exit(1);
  }

  assertProductionSafety();

  const { connectDB } = require('../config/db');
  await connectDB();
  assertConnectionIsNotLocal();

  try {
    const plan = await buildFullPlan();
    printPlan(plan);

    if (mode === 'dry-run') {
      console.log('\nDRY RUN ONLY — no data was modified.');
      return;
    }

    if (plan.alreadyApplied) {
      console.log('\nABORT — historical seed already initialized. No changes made.');
      process.exitCode = 1;
      return;
    }

    console.log('\nApplying plan...');
    const applyResult = await applyPlan(plan);
    if (!applyResult.applied) {
      process.exitCode = 1;
      return;
    }

    console.log(`AnalyticsDaily rows written: ${applyResult.analyticsDailyWritten}`);
    console.log(`ProductSalesMonthly rows written: ${applyResult.productSalesMonthlyWritten}`);
    console.log(`Products updated with historical baseline: ${applyResult.productsUpdated}`);
    console.log(`BusinessTarget rows written: ${applyResult.targetsWritten}`);
    console.log(`Historical campaigns created: ${applyResult.createdCampaignIds.length}`);

    const problems = await verifyInvariants(plan, applyResult);
    if (problems.length) {
      console.error('\nPOST-WRITE VERIFICATION FAILED:');
      problems.forEach((p) => console.error('  - ' + p));
      process.exitCode = 1;
      return;
    }

    console.log('\nPost-write verification passed. Historical baseline applied successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nHistorical analytics generation failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  buildFullPlan,
  applyPlan,
  verifyInvariants,
  buildHistoricalDayList,
  buildFutureDayList,
  windowStartDate,
  computeDayCurve,
  buildProductProfiles,
  allocateMonthlyProductSales,
  apportionMonthlyUnitsToDays,
  isBlackFridayWeek,
  classifyCategoryDemandIndex,
  computeCategoryWeights,
  tierForPercentile,
  REQUIRED_CONFIRM_VALUE,
};
