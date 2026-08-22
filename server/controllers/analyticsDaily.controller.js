'use strict';

const { sendSuccess } = require('../utils/response');
const { getRangeStats } = require('../services/analyticsDaily.service');
const { getIsraelDayBoundaries, getIsraelMonthBoundaries, getIsraelDateParts } = require('../utils/timezone');

const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

// Resolves ?range=today|7d|30d|90d|1y|mtd|ytd|all or explicit
// ?dateFrom=&dateTo=, always on real Israel calendar-day boundaries — the
// same semantics AnalyticsDaily itself is keyed on.
function resolveRange(query) {
  const { start: todayStart, end: todayEnd } = getIsraelDayBoundaries(new Date());

  if (query.dateFrom || query.dateTo) {
    const from = query.dateFrom ? getIsraelDayBoundaries(new Date(query.dateFrom)).start : todayStart;
    const to   = query.dateTo   ? getIsraelDayBoundaries(new Date(query.dateTo)).end     : todayEnd;
    return { from, to };
  }

  const range = query.range || '30d';
  if (range === 'mtd') {
    const { year, month } = getIsraelDateParts(new Date());
    return { from: getIsraelMonthBoundaries(year, month).start, to: todayEnd };
  }
  if (range === 'ytd') {
    return { from: getIsraelMonthBoundaries(getIsraelDateParts(new Date()).year, 1).start, to: todayEnd };
  }
  if (range === 'all') {
    // Effectively "since the business existed" — 10 years back is a safe,
    // generous ceiling that will always be well before both the historical
    // seed window and any real production data.
    return { from: new Date(todayStart.getTime() - 10 * 365 * 24 * 60 * 60 * 1000), to: todayEnd };
  }

  const days = RANGE_DAYS[range] ?? 30;
  const from = range === 'today' ? todayStart : new Date(todayEnd.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to: todayEnd };
}

const getDailyAnalytics = async (req, res, next) => {
  try {
    const { from, to } = resolveRange(req.query);
    const totals = await getRangeStats(from, to);
    sendSuccess(res, { range: { from, to }, totals }, 'Daily analytics retrieved');
  } catch (err) { next(err); }
};

module.exports = { getDailyAnalytics, resolveRange };
