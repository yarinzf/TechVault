import { api } from '../../../services/api';

// Display-only — the server (server/config/membership.js) owns the real
// price for each plan. Never sent to the backend as an amount; checkout
// only ever submits a plan KEY. There is ONE membership level (an active
// Club member IS a VIP member) — these are billing TERMS, not tiers.
export const MEMBERSHIP_PLANS = {
  monthly: { price: 20, durationDays: 30 },
  annual:  { price: 200, durationDays: 365 },
};
// Regular monthly-equivalent annual cost vs the real annual price — used to
// display the real ₪40 saving (12 × ₪20 = ₪240 vs ₪200), never invented.
export const MEMBERSHIP_ANNUAL_REGULAR_COST = MEMBERSHIP_PLANS.monthly.price * 12;
export const MEMBERSHIP_ANNUAL_SAVINGS = MEMBERSHIP_ANNUAL_REGULAR_COST - MEMBERSHIP_PLANS.annual.price;

// Mirrors server/config/membership.js POINTS_DEFAULT_RATE — display only.
// A product's real pointsRateOverride (when set) always wins; this is only
// the fallback shown when the product uses the store default.
export const POINTS_DEFAULT_RATE = 0.05;

export const membershipService = {
  async checkout(plan) {
    const { data } = await api.post('/membership/checkout', { plan });
    return data?.order ?? data;
  },

  async updateNotificationPreference(notificationPreference) {
    const { data } = await api.patch('/membership/notification-preference', { notificationPreference });
    return data?.user ?? data;
  },

  // Opts out of the next renewal only — does not change expiresAt or
  // deactivate anything now. See server/services/membership.service.js#cancelAutoRenew.
  async cancel() {
    const { data } = await api.post('/membership/cancel', {});
    return data?.user ?? data;
  },
};
