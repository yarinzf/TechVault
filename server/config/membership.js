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
// Deliberately native Date.setUTCMonth/setUTCFullYear — NOT `+30*86400000` /
// `+365*86400000`. A term now genuinely means "the same calendar day next
// month/year", so a monthly member who joins on the 8th always renews on
// the 8th, and Aug 8 2026 (annual) → Aug 8 2027, including through a leap
// year, rather than drifting by however many days a fixed-ms window would
// accumulate.
//
// Documented native JS rollover behavior for the day-doesn't-exist-in-
// target-month case (verified, not assumed):
//   Jan 31 + 1 month  → Mar 3  (2026, non-leap: Feb has 28 days, JS rolls
//                                forward by the 3-day overflow)
//   Jan 31 + 1 month  → Mar 2  (a leap year: Feb has 29 days, 2-day overflow)
//   Mar 31 + 1 month  → May 1  (April has 30 days, 1-day overflow)
//   Feb 29 (leap) + 1 year → Mar 1  (target year's Feb has no 29th, 1-day overflow)
// This is standard, predictable JS Date semantics — accepted as-is per the
// spec's explicit instruction, not reimplemented with custom clamping.
function addCalendarTerm(date, plan) {
  const d = new Date(date);
  const unit = MEMBERSHIP_PLANS[plan]?.calendarUnit;
  if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else throw new Error(`addCalendarTerm: unknown plan "${plan}"`);
  return d;
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
