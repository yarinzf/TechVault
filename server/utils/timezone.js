'use strict';

const { BUSINESS_TIMEZONE } = require('../config/analytics');

/**
 * Asia/Jerusalem-aware day/month boundary helpers, built on Node's built-in
 * (full-ICU) Intl support — no new dependency needed. Every new analytics
 * code path (AnalyticsDaily, BusinessTarget, the historical generator) uses
 * these instead of ad hoc `new Date(); d.setHours(0,0,0,0)` or UTC-implicit
 * `$dateToString`, so "today"/"this month" mean the same real Israel
 * calendar day everywhere — including across the admin.service.js /
 * analytics.service.js / report.service.js boundary code this replaces.
 *
 * Handles DST correctly because the offset is always recomputed near the
 * actual instant in question, never assumed fixed.
 */

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function formatPartsAsObject(date) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

// The standard two-step technique for computing a timezone's UTC offset at a
// specific instant: format the instant in the target zone, re-interpret
// those wall-clock numbers as if they were UTC, and diff against the real
// instant. Evaluated close to the instant being asked about so it's always
// correct across a DST transition (Israel's DST changes happen at 02:00
// local, never at midnight, so this stays unambiguous for day-boundary use).
function getTimeZoneOffsetMs(date) {
  const p = formatPartsAsObject(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

// The real UTC instant of Israel local midnight beginning the given
// Israel calendar date (year/month/day, 1-indexed month).
function israelMidnightUtc(year, month, day) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetMs = getTimeZoneOffsetMs(guess);
  return new Date(guess.getTime() - offsetMs);
}

// Israel calendar Y/M/D for a given instant (defaults to now).
function getIsraelDateParts(date = new Date()) {
  const p = formatPartsAsObject(date);
  return { year: p.year, month: p.month, day: p.day };
}

// 'YYYY-MM-DD' Israel calendar date key for a given instant.
function toIsraelDateKey(date = new Date()) {
  const { year, month, day } = getIsraelDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// { start, end } — start is Israel midnight beginning the calendar day that
// contains `date`; end is the following Israel midnight (exclusive upper
// bound, matching this codebase's existing $gte/$lt month-boundary
// convention in recommendation.service.js#getUtcMonthBoundaries).
function getIsraelDayBoundaries(date = new Date()) {
  const { year, month, day } = getIsraelDateParts(date);
  const start = israelMidnightUtc(year, month, day);
  const nextDay = new Date(start.getTime() + 25 * 60 * 60 * 1000); // guaranteed to land on the next Israel day even across a 23h DST-spring-forward day
  const { year: ny, month: nm, day: nd } = getIsraelDateParts(nextDay);
  const end = israelMidnightUtc(ny, nm, nd);
  return { start, end };
}

// { start, end } for a specific Israel calendar day (Y/M/D), without needing
// an instant within it — used by the historical generator, which iterates
// calendar dates directly.
function getIsraelDayBoundariesForDate(year, month, day) {
  const start = israelMidnightUtc(year, month, day);
  return getIsraelDayBoundaries(new Date(start.getTime() + 12 * 60 * 60 * 1000)); // noon-ish within that day, safely mid-day
}

// { start, end } for an Israel calendar month (1-indexed month), end
// exclusive (first instant of the following month).
function getIsraelMonthBoundaries(year, month) {
  const start = israelMidnightUtc(year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = israelMidnightUtc(nextYear, nextMonth, 1);
  return { start, end };
}

// True if `date` falls on today's Israel calendar date.
function isIsraelToday(date) {
  return toIsraelDateKey(date) === toIsraelDateKey(new Date());
}

module.exports = {
  getIsraelDateParts,
  toIsraelDateKey,
  getIsraelDayBoundaries,
  getIsraelDayBoundariesForDate,
  getIsraelMonthBoundaries,
  israelMidnightUtc,
  isIsraelToday,
};
