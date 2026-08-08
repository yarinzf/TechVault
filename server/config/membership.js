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
    durationDays: 30,
    name:         'TechVault Club — Monthly',
    sku:          'MEMBERSHIP-MONTHLY',
  }),
  annual: Object.freeze({
    price:        200,
    durationDays: 365,
    name:         'TechVault Club — Annual',
    sku:          'MEMBERSHIP-ANNUAL',
  }),
});

const MEMBERSHIP_PLAN_KEYS = Object.freeze(Object.keys(MEMBERSHIP_PLANS));

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
  POINTS_DEFAULT_RATE,
  POINTS_REDEMPTION_RATE,
  POINTS_EXPIRY_MONTHS,
};
