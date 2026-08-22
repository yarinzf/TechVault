'use strict';

const BusinessTarget = require('../models/BusinessTarget');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { getIsraelDayBoundaries, getIsraelMonthBoundaries, getIsraelDateParts } = require('../utils/timezone');
const { getRangeStats } = require('./analyticsDaily.service');

const round2 = (n) => Math.round((n || 0) * 100) / 100;

// Which real AnalyticsDaily-derived total a given metric's "actual" comes
// from. Every metric here is either a direct summable field or one of the
// derived rates getRangeStats already computes — never independently
// re-derived, so a target's "actual" always agrees with what the dashboard
// itself shows for the same period.
function actualForMetric(metric, totals) {
  switch (metric) {
    case 'daily_revenue':
    case 'monthly_revenue':      return totals.revenue;
    case 'daily_orders':
    case 'monthly_orders':       return totals.paidOrders;
    case 'new_customers':        return totals.newCustomers;
    case 'conversion_rate':      return totals.conversionRate;
    case 'cancellation_rate':    return totals.cancellationRate;
    case 'abandoned_cart_rate':  return totals.abandonedCartRate;
    default:
      throw new AppError(`Unknown target metric: ${metric}`, StatusCodes.BAD_REQUEST, 'INVALID_METRIC');
  }
}

// Real actual value + progress% for one (metric, periodStart) target,
// computed independently of the stored targetValue — see BusinessTarget.js
// header. Returns { target: <doc|null>, actual, progressPercent }.
async function getTargetProgress(metric, periodType, periodStart) {
  const target = await BusinessTarget.findOne({ metric, periodType, periodStart }).lean();
  const { start, end } = periodType === 'day'
    ? getIsraelDayBoundaries(periodStart)
    : getIsraelMonthBoundaries(getIsraelDateParts(periodStart).year, getIsraelDateParts(periodStart).month);

  const totals = await getRangeStats(start, end);
  const actual = round2(actualForMetric(metric, totals));

  const progressPercent = target && target.targetValue > 0
    ? round2((actual / target.targetValue) * 100)
    : null; // no target set — never fabricate a percentage against nothing

  return {
    metric, periodType,
    periodStart: start, periodEnd: end,
    target: target ? round2(target.targetValue) : null,
    actual,
    progressPercent,
    source: target?.source ?? null,
  };
}

// Real progress for every metric that has a target defined for the given
// Israel day — powers the PerformanceGoals dashboard widget in one call.
async function getDailyGoalsProgress(date = new Date()) {
  const { start } = getIsraelDayBoundaries(date);
  const dailyMetrics = ['daily_revenue', 'daily_orders', 'conversion_rate', 'abandoned_cart_rate', 'cancellation_rate'];
  return Promise.all(dailyMetrics.map((metric) => getTargetProgress(metric, 'day', start)));
}

async function getMonthlyGoalsProgress(date = new Date()) {
  const { year, month } = getIsraelDateParts(date);
  const { start } = getIsraelMonthBoundaries(year, month);
  const monthlyMetrics = ['monthly_revenue', 'monthly_orders', 'new_customers', 'cancellation_rate'];
  return Promise.all(monthlyMetrics.map((metric) => getTargetProgress(metric, 'month', start)));
}

// ─── Admin CRUD ─────────────────────────────────────────────────────────────
async function listTargets({ metric, periodType, from, to }) {
  const filter = {};
  if (metric) filter.metric = metric;
  if (periodType) filter.periodType = periodType;
  if (from || to) {
    filter.periodStart = {};
    if (from) filter.periodStart.$gte = new Date(from);
    if (to)   filter.periodStart.$lte = new Date(to);
  }
  return BusinessTarget.find(filter).sort({ periodStart: -1 }).lean();
}

// Admins may only set/edit a target whose period has not yet closed — a
// past period's target is a historical record of what was planned at the
// time, not something that can be quietly rewritten after the fact (see
// requirement #17: "Do not mutate historical targets merely because actual
// business performance changes").
async function upsertTarget({ metric, periodType, periodStart: periodStartInput, targetValue, notes }, actorId) {
  const bounds = periodType === 'day'
    ? getIsraelDayBoundaries(new Date(periodStartInput))
    : getIsraelMonthBoundaries(getIsraelDateParts(new Date(periodStartInput)).year, getIsraelDateParts(new Date(periodStartInput)).month);

  const { start: todayStart } = getIsraelDayBoundaries(new Date());
  const existing = await BusinessTarget.findOne({ metric, periodType, periodStart: bounds.start }).lean();
  const periodHasClosed = bounds.end <= todayStart;

  if (existing && periodHasClosed) {
    throw new AppError(
      'Cannot edit a target whose period has already closed',
      StatusCodes.CONFLICT,
      'TARGET_PERIOD_CLOSED'
    );
  }
  if (!existing && periodHasClosed) {
    throw new AppError(
      'Cannot create a target for a period that has already closed',
      StatusCodes.CONFLICT,
      'TARGET_PERIOD_CLOSED'
    );
  }

  return BusinessTarget.findOneAndUpdate(
    { metric, periodType, periodStart: bounds.start },
    {
      $set: {
        periodEnd: bounds.end, targetValue, notes: notes ?? undefined,
        source: 'admin_set', createdBy: actorId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

module.exports = {
  actualForMetric,
  getTargetProgress,
  getDailyGoalsProgress,
  getMonthlyGoalsProgress,
  listTargets,
  upsertTarget,
};
