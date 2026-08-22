'use strict';

const logger = require('../config/logger');
const { finalizeDay } = require('../services/analyticsDaily.service');
const { getIsraelDayBoundaries } = require('../utils/timezone');

/**
 * Finalizes YESTERDAY's Israel calendar day into AnalyticsDaily (source:
 * 'live') — the real live counterpart to the historical generator's seeded
 * rows. Runs at 01:00 Israel-adjacent server time, comfortably after
 * yesterday's last possible Israel-local moment has passed.
 *
 * Deliberately never touches TODAY's row — this redesign's read path
 * (analyticsDaily.service.js#getRangeStats/getDayStats) always computes
 * "today" live instead, so there is nothing to fix up if this job runs a
 * few minutes early/late relative to true Israel midnight.
 */
module.exports = async function dailySnapshot() {
  const yesterdayInstant = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { start, end } = getIsraelDayBoundaries(yesterdayInstant);

  const row = await finalizeDay(start, end);

  logger.info(
    `[dailySnapshot] ${start.toISOString().slice(0, 10)}: ` +
    `orders=${row.orders}, paidOrders=${row.paidOrders}, revenue=₪${row.revenue.toFixed(2)}, ` +
    `aov=₪${row.aov.toFixed(2)}, newCustomers=${row.newCustomers}, ` +
    `sessions=${row.sessions}, conversionRate=${row.conversionRate}%, ` +
    `abandonedCarts=${row.abandonedCarts}`
  );
};
