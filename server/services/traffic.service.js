'use strict';

const DailyVisit = require('../models/DailyVisit');
const { toIsraelDateKey } = require('../utils/timezone');
const { incrementDailyCounters } = require('./analyticsDaily.service');

/**
 * Records one tracked page view from the /api/v1/track/visit beacon.
 * Always increments productPageViews; increments sessions only the FIRST
 * time this anonId is seen on the current Israel calendar day (see
 * DailyVisit's unique {anonId, dateKey} index — a duplicate insert is the
 * normal, expected outcome for every page view after the first one today).
 */
async function recordVisit(anonId, { isProductPage = false } = {}) {
  const dateKey = toIsraelDateKey(new Date());
  let isNewSessionToday = false;

  try {
    await DailyVisit.create({ anonId, dateKey });
    isNewSessionToday = true;
  } catch (err) {
    if (err.code !== 11000) throw err; // anything other than the expected duplicate-key is a real error
  }

  await incrementDailyCounters({
    sessions: isNewSessionToday ? 1 : 0,
    productPageViews: isProductPage ? 1 : 0,
  });

  return { isNewSessionToday };
}

module.exports = { recordVisit };
