'use strict';

/**
 * Single source of truth for TechVault Club membership commerce constants.
 * The frontend may import a display-only copy of these values, but the
 * server values here are the only ones ever used to build an Order —
 * client-submitted pricing is always ignored.
 *
 * There is ONE membership level (VIP == active Club member). There are NO
 * tiers (no Silver/Gold/Platinum/Diamond). Membership is a TERM (plan +
 * startedAt + expiresAt), not a lifetime purchase — the old ₪50-for-life
 * model is retired. Renewal is a new purchase of the same or a different
 * plan; there is no automatic recurring/tokenized billing (see
 * payment.service.js — only one-time PaymentIntent-style charges exist,
 * no subscription/customer/SetupIntent objects), so renewal is explicit.
 */
const MEMBERSHIP_ITEM_TYPE = 'membership';

const MEMBERSHIP_PLANS = Object.freeze({
  monthly: Object.freeze({
    price:        20,
    calendarUnit: 'month', // real calendar month, not a fixed 30-day window — see addCalendarTerm
    name:         'TechVault Club — Monthly',
    sku:          'MEMBERSHIP-MONTHLY',
  }),
  annual: Object.freeze({
    price:        200,
    calendarUnit: 'year', // real calendar year — see addCalendarTerm
    name:         'TechVault Club — Annual',
    sku:          'MEMBERSHIP-ANNUAL',
  }),
});

const MEMBERSHIP_PLAN_KEYS = Object.freeze(Object.keys(MEMBERSHIP_PLANS));

// ─── Calendar-accurate term arithmetic ─────────────────────────────────────
// Same calendar day next month/year where that day genuinely exists;
// otherwise CLAMPED to the last valid day of the destination month — never
// left to native Date's raw month/year rollover, which instead overflows
// into the following month (e.g. Jan 31 + 1 month would silently become
// Mar 3). That overflow is unacceptable for billing: a member who joins on
// the 31st must renew within the destination month, not drift into a third
// calendar month.
//
// Verified behavior (see membership.test.js / membershipPurchase.test.js):
//   Aug 8, 2026  + 1 month → Sep 8, 2026   (same day — no clamp needed)
//   Jan 31, 2026 + 1 month → Feb 28, 2026  (Feb 2026 has 28 days — clamped)
//   Jan 31, 2028 + 1 month → Feb 29, 2028  (Feb 2028 is a leap year — clamped to 29)
//   Feb 29, 2028 + 1 year  → Feb 28, 2029  (2029 is not a leap year — clamped)
//   Dec 31, 2026 + 1 month → Jan 31, 2027  (December → January rolls the year forward
//                                            normally; January has 31 days, no clamp)
function addCalendarTerm(date, plan) {
  const d = new Date(date);
  const unit = MEMBERSHIP_PLANS[plan]?.calendarUnit;
  if (unit !== 'month' && unit !== 'year') {
    throw new Error(`addCalendarTerm: unknown plan "${plan}"`);
  }

  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day   = d.getUTCDate();

  const targetYear  = unit === 'year'  ? year + 1  : year;
  const targetMonth = unit === 'month' ? month + 1 : month; // Date.UTC normalizes a month of 12 into January of targetYear+1

  // Date.UTC(y, m+1, 0) is "day 0 of month m+1" = the last real day of month m,
  // including automatic year rollover when m+1 itself overflows past 11.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(Date.UTC(
    targetYear, targetMonth, clampedDay,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()
  ));
}

// ─── Points / cashback ──────────────────────────────────────────────────────
// 5% back in points on eligible products; 1 point = ₪1 of redemption value.
// A product may override its own rate (POINTS_RATE override, e.g. 0.01/0.02
// for low-margin items) or opt fully out (pointsEligible: false). A Campaign
// may additionally multiply the earning rate for its own products
// (pointsMultiplier, e.g. 2 → 10% effective during a "2x points" promo).
const POINTS_DEFAULT_RATE   = 0.05; // 5%
const POINTS_REDEMPTION_RATE = 1;   // 1 point = ₪1
const POINTS_EXPIRY_MONTHS   = 12;  // each EARN transaction expires 12 months after it's earned

module.exports = {
  MEMBERSHIP_ITEM_TYPE,
  MEMBERSHIP_PLANS,
  MEMBERSHIP_PLAN_KEYS,
  addCalendarTerm,
  POINTS_DEFAULT_RATE,
  POINTS_REDEMPTION_RATE,
  POINTS_EXPIRY_MONTHS,
};
