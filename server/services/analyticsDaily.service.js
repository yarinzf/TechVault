'use strict';

const mongoose = require('mongoose');
const Order   = require('../models/Order');
const User    = require('../models/User');
const AnalyticsDaily = require('../models/AnalyticsDaily');
const { ROLES } = require('../config/roles');
const { getIsraelDayBoundaries, isIsraelToday, toIsraelDateKey, getIsraelDateParts } = require('../utils/timezone');

// Same business-rule constant used across admin.service.js/analytics.service.js/
// report.service.js — kept as its own local copy (matching this codebase's
// existing convention of duplicating this exact literal per file) rather than
// introducing a new shared-constants module as an out-of-scope refactor.
const REVENUE_MATCH = { paymentStatus: 'paid', status: { $nin: ['cancelled', 'refunded'] } };

const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Computes real, live business stats for one Israel calendar day directly
 * from Order/User — never persisted by this function. Used for (a) "today",
 * which this redesign deliberately never reads from AnalyticsDaily, and
 * (b) by dailySnapshot.job.js to finalize a just-completed day's row.
 */
async function computeLiveDayStats(dayStart, dayEnd) {
  const [orderFacet, cancelledOrders, refundedAgg, newCustomers, buyerIds] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: dayStart, $lt: dayEnd } } },
      {
        $facet: {
          all: [{ $count: 'count' }],
          paid: [
            { $match: REVENUE_MATCH },
            {
              $group: {
                _id: null,
                revenue:     { $sum: '$total' },
                paidOrders:  { $sum: 1 },
                buyerIds:    { $addToSet: '$user' },
              },
            },
          ],
          units: [
            { $match: REVENUE_MATCH },
            { $unwind: '$items' },
            { $match: { 'items.itemType': 'product' } },
            { $group: { _id: null, unitsSold: { $sum: '$items.quantity' } } },
          ],
        },
      },
    ]),
    Order.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd }, status: 'cancelled' }),
    Order.aggregate([
      { $match: { createdAt: { $gte: dayStart, $lt: dayEnd }, refundedAmount: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$refundedAmount' } } },
    ]),
    User.countDocuments({ role: ROLES.USER, createdAt: { $gte: dayStart, $lt: dayEnd } }),
    // Placeholder resolved below once orderFacet is known — see buyerIds usage.
    Promise.resolve(null),
  ]);
  void buyerIds;

  const paidRow  = orderFacet[0]?.paid?.[0]  ?? { revenue: 0, paidOrders: 0, buyerIds: [] };
  const unitsRow = orderFacet[0]?.units?.[0] ?? { unitsSold: 0 };
  const allCount = orderFacet[0]?.all?.[0]?.count ?? 0;
  const refunded = refundedAgg[0] ?? { count: 0, amount: 0 };

  // Returning customers: distinct buyers today whose account existed BEFORE
  // today (i.e. not a same-day signup) — a real query against User, not
  // inferred/estimated.
  let returningCustomers = 0;
  if (paidRow.buyerIds.length > 0) {
    returningCustomers = await User.countDocuments({
      _id: { $in: paidRow.buyerIds },
      createdAt: { $lt: dayStart },
    });
  }

  const revenue = round2(paidRow.revenue);
  const paidOrders = paidRow.paidOrders;

  return {
    revenue,
    orders: allCount,
    paidOrders,
    unitsSold: unitsRow.unitsSold,
    cancelledOrders,
    refundedOrders: refunded.count,
    refundAmount: round2(refunded.amount),
    newCustomers,
    returningCustomers,
    aov: paidOrders > 0 ? round2(revenue / paidOrders) : 0,
  };
}

/**
 * Finalizes one Israel calendar day into AnalyticsDaily — upserts the
 * financial fields computed live from real Order/User data, WITHOUT
 * clobbering whatever traffic/cart counters (sessions, cartsStarted,
 * abandonedCarts, etc.) already accumulated on that day's row via
 * incrementDailyCounters. Called by dailySnapshot.job.js once a day has
 * fully completed (never for "today", which stays live-only).
 */
async function finalizeDay(dayStart, dayEnd) {
  const stats = await computeLiveDayStats(dayStart, dayEnd);

  const updated = await AnalyticsDaily.findOneAndUpdate(
    { date: dayStart },
    {
      $set: { ...stats, source: 'live' },
      $setOnInsert: { date: dayStart },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // conversionRate depends on the day's session counter, which may have
  // been incremented independently of this financial finalize — recompute
  // it now that both halves are guaranteed present.
  const conversionRate = updated.sessions > 0 ? round2((updated.paidOrders / updated.sessions) * 100) : 0;
  if (conversionRate !== updated.conversionRate) {
    updated.conversionRate = conversionRate;
    await updated.save();
  }

  return updated;
}

/**
 * $inc-upserts one or more running counters onto TODAY's AnalyticsDaily row
 * (creating it with source:'live' if this is the first event of the day).
 * Used by the /track/visit beacon (sessions/productPageViews), the cart
 * service's first-item-added hook (cartsStarted), and cleanupCarts.job.js
 * (abandonedCarts/abandonedCartValue). Financial fields on this same row are
 * NEVER trusted for "today" — every read path recomputes them live via
 * computeLiveDayStats instead (see getRangeStats/getDayStats below).
 */
async function incrementDailyCounters(fields) {
  const { start } = getIsraelDayBoundaries(new Date());
  const inc = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value) inc[key] = value;
  }
  if (Object.keys(inc).length === 0) return;

  await AnalyticsDaily.findOneAndUpdate(
    { date: start },
    { $inc: inc, $setOnInsert: { date: start, source: 'live' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Real stats for a single Israel calendar day, regardless of whether it's
 * historical (seeded), a finalized past live day, or today (always
 * live-computed, merged with today's counter row if one exists).
 */
async function getDayStats(dayStart, dayEnd) {
  if (isIsraelToday(dayStart)) {
    const live = await computeLiveDayStats(dayStart, dayEnd);
    const counterRow = await AnalyticsDaily.findOne({ date: dayStart }).lean();
    const sessions = counterRow?.sessions ?? 0;
    return {
      ...live,
      sessions,
      productPageViews: counterRow?.productPageViews ?? 0,
      conversionRate: sessions > 0 ? round2((live.paidOrders / sessions) * 100) : 0,
      cartsStarted: counterRow?.cartsStarted ?? 0,
      abandonedCarts: counterRow?.abandonedCarts ?? 0,
      abandonedCartValue: counterRow?.abandonedCartValue ?? 0,
      lowStockEvents: counterRow?.lowStockEvents ?? 0,
      outOfStockEvents: counterRow?.outOfStockEvents ?? 0,
      restockEvents: counterRow?.restockEvents ?? 0,
      source: 'live',
    };
  }

  const row = await AnalyticsDaily.findOne({ date: dayStart }).lean();
  if (row) return row;

  // A past day with no row at all — the honest answer is zero, never a
  // silent fabrication. This only happens for a day that predates both the
  // historical seed's window AND real production data (e.g. before the
  // business existed at all).
  return {
    date: dayStart, source: null, revenue: 0, orders: 0, paidOrders: 0, unitsSold: 0,
    cancelledOrders: 0, refundedOrders: 0, refundAmount: 0, newCustomers: 0,
    returningCustomers: 0, aov: 0, sessions: 0, productPageViews: 0, conversionRate: 0,
    cartsStarted: 0, abandonedCarts: 0, abandonedCartValue: 0,
    lowStockEvents: 0, outOfStockEvents: 0, restockEvents: 0,
  };
}

const SUMMABLE_FIELDS = [
  'revenue', 'orders', 'paidOrders', 'unitsSold', 'cancelledOrders', 'refundedOrders',
  'refundAmount', 'newCustomers', 'returningCustomers', 'sessions', 'productPageViews',
  'cartsStarted', 'abandonedCarts', 'abandonedCartValue',
  'lowStockEvents', 'outOfStockEvents', 'restockEvents',
];

function emptyTotals() {
  const t = {};
  for (const f of SUMMABLE_FIELDS) t[f] = 0;
  return t;
}

function addInto(totals, row) {
  for (const f of SUMMABLE_FIELDS) totals[f] += row[f] || 0;
}

function deriveRates(totals) {
  return {
    ...totals,
    revenue: round2(totals.revenue),
    refundAmount: round2(totals.refundAmount),
    abandonedCartValue: round2(totals.abandonedCartValue),
    aov: totals.paidOrders > 0 ? round2(totals.revenue / totals.paidOrders) : 0,
    conversionRate: totals.sessions > 0 ? round2((totals.paidOrders / totals.sessions) * 100) : 0,
    cancellationRate: totals.orders > 0 ? round2((totals.cancelledOrders / totals.orders) * 100) : 0,
    abandonedCartRate: (totals.abandonedCarts + totals.paidOrders) > 0
      ? round2((totals.abandonedCarts / (totals.abandonedCarts + totals.paidOrders)) * 100)
      : 0,
  };
}

/**
 * Real totals for an arbitrary [from, to) Israel-aligned date range,
 * combining persisted AnalyticsDaily rows (historical seed + finalized live
 * days) with a live computation for today if the range includes it — never
 * a full live Order scan across the whole range (the historical portion is
 * always served from the small, indexed AnalyticsDaily collection).
 */
async function getRangeStats(from, to) {
  const totals = emptyTotals();

  const { start: todayStart, end: todayEnd } = getIsraelDayBoundaries(new Date());
  const persistedTo = to > todayStart ? todayStart : to; // exclusive upper bound for the persisted-rows query

  if (from < persistedTo) {
    const rows = await AnalyticsDaily.find({ date: { $gte: from, $lt: persistedTo } }).lean();
    for (const row of rows) addInto(totals, row);
  }

  if (to > todayStart && from < todayEnd) {
    const todayRow = await getDayStats(todayStart, todayEnd);
    addInto(totals, todayRow);
  }

  return deriveRates(totals);
}

/**
 * Real day-by-day revenue/order series for [from, to) — the single shared
 * primitive behind every "revenue over time" view in the app (Dashboard,
 * Analytics tab, Reports/CSV). Historical/finalized-live days are read
 * directly from AnalyticsDaily (cheap, indexed); if the range includes
 * today, one extra live computation is appended. This guarantees the
 * Dashboard, the Analytics tab, and the Reports/CSV export can never show
 * different totals for the same date range — they all call this function
 * (or getRangeStats, which sums the same rows) rather than each running
 * their own independent live-only Order aggregation.
 */
async function getDailySeries(from, to) {
  const { start: todayStart, end: todayEnd } = getIsraelDayBoundaries(new Date());
  const persistedTo = to > todayStart ? todayStart : to;

  const rows = from < persistedTo
    ? await AnalyticsDaily.find({ date: { $gte: from, $lt: persistedTo } }).sort({ date: 1 }).lean()
    : [];

  if (to > todayStart && from < todayEnd) {
    const todayRow = await getDayStats(todayStart, todayEnd);
    rows.push({ ...todayRow, date: todayStart });
  }

  return rows.map((r) => ({
    date: r.date,
    revenue: round2(r.revenue), orders: r.orders, paidOrders: r.paidOrders,
    unitsSold: r.unitsSold, cancelledOrders: r.cancelledOrders, refundedOrders: r.refundedOrders,
    refundAmount: round2(r.refundAmount), newCustomers: r.newCustomers, returningCustomers: r.returningCustomers,
    aov: r.paidOrders > 0 ? round2(r.revenue / r.paidOrders) : 0,
  }));
}

// Groups a daily series into week ('%Y-%U', ISO-ish week-of-year to match
// the existing $dateToString('%Y-%U') convention used elsewhere) or month
// ('%Y-%m') buckets — client-side summation over the SAME rows getRangeStats
// already reads, so a "monthly" report row can never silently disagree with
// the daily figures or the range summary.
function bucketSeriesByPeriod(dailySeries, period) {
  if (period === 'day') {
    return dailySeries.map((d) => ({
      period: toIsraelDateKey(d.date), revenue: d.revenue, orders: d.paidOrders,
      avgOrder: d.paidOrders > 0 ? round2(d.revenue / d.paidOrders) : 0,
    }));
  }

  const keyFor = (date) => {
    const { year, month } = getIsraelDateParts(date);
    if (period === 'month') return `${year}-${String(month).padStart(2, '0')}`;
    // ISO-ish week key: yyyy-Www using the date's own Israel-calendar day-of-year / 7 —
    // a display bucket only (not used for any correctness-critical boundary).
    const dayOfYear = Math.floor((date - new Date(Date.UTC(year, 0, 1))) / 86400000);
    return `${year}-W${String(Math.floor(dayOfYear / 7) + 1).padStart(2, '0')}`;
  };

  const buckets = new Map();
  for (const d of dailySeries) {
    const key = keyFor(d.date);
    const b = buckets.get(key) ?? { period: key, revenue: 0, orders: 0 };
    b.revenue += d.revenue;
    b.orders += d.paidOrders;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .map((b) => ({ ...b, revenue: round2(b.revenue), avgOrder: b.orders > 0 ? round2(b.revenue / b.orders) : 0 }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// A safe "since the business existed" floor — well before the seeded
// historical window and any real production data. The single shared
// constant for every "all time" range across admin.service.js/
// analytics.service.js/report.service.js.
const ALL_TIME_FLOOR = new Date('2000-01-01T00:00:00Z');

// Resolves { dateFrom, dateTo } request query params (plain 'YYYY-MM-DD'
// strings, or absent) into Israel-midnight-aligned { from, to } boundaries —
// `to` is the EXCLUSIVE instant starting the day AFTER dateTo, matching
// AnalyticsDaily's own date semantics exactly. Using a naive UTC
// `23:59:59.999` upper bound (the pre-redesign convention) would
// occasionally include or exclude the wrong AnalyticsDaily row, since an
// Israel midnight can fall as early as ~21:00 UTC — this is the single
// shared resolver every date-ranged report/analytics endpoint should use.
function resolveIsraelRangeParams({ dateFrom, dateTo } = {}) {
  const from = dateFrom ? getIsraelDayBoundaries(new Date(dateFrom)).start : ALL_TIME_FLOOR;
  const to   = dateTo   ? getIsraelDayBoundaries(new Date(dateTo)).end     : new Date();
  return { from, to };
}

module.exports = {
  REVENUE_MATCH,
  ALL_TIME_FLOOR,
  computeLiveDayStats,
  finalizeDay,
  incrementDailyCounters,
  getDayStats,
  getRangeStats,
  getDailySeries,
  bucketSeriesByPeriod,
  resolveIsraelRangeParams,
  SUMMABLE_FIELDS,
};
