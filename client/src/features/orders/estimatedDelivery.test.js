import { describe, it, expect } from 'vitest';
import { getEstimatedDelivery } from './estimatedDelivery';

const fakeT = (key) => {
  const DICT = {
    'order.success.delivery_pickup_ready': 'מוכן לאיסוף היום',
    'order.success.delivery_until':        'עד',
  };
  return DICT[key] ?? key;
};

// 2026-01-01 is a Thursday — the following two calendar days (Fri 1/2,
// Sat 1/3) are TechVault's real weekend (Israeli work week: Sun–Thu).
// Anchoring here specifically exercises the Fri/Sat skip: a naive
// Sat/Sun-skip implementation (the previous bug in this codebase) would
// wrongly count Friday 1/2 as a business day.
const THURSDAY = '2026-01-01T10:00:00.000Z';

describe('getEstimatedDelivery — Shipping V1 informational delivery estimate', () => {
  it('store_pickup returns the pickup-ready label, not a courier date', () => {
    const order = { shippingMethod: 'store_pickup', createdAt: THURSDAY };
    expect(getEstimatedDelivery(order, fakeT, 'he')).toBe('מוכן לאיסוף היום');
  });

  it('express computes order date + 2 real business days, correctly skipping Fri/Sat (not Sat/Sun)', () => {
    const order = { shippingMethod: 'express', createdAt: THURSDAY };
    const result = getEstimatedDelivery(order, fakeT, 'he');
    // Thu 1/1 -> skip Fri 1/2, skip Sat 1/3 -> Sun 1/4 (day 1) -> Mon 1/5 (day 2)
    expect(result).toBe('עד ' + new Date(2026, 0, 5).toLocaleDateString('he-IL', { month: 'long', day: 'numeric' }));
  });

  it('standard computes a 3–5 real-business-day range from the order date', () => {
    const order = { shippingMethod: 'standard', createdAt: THURSDAY };
    const result = getEstimatedDelivery(order, fakeT, 'he');
    const from = new Date(2026, 0, 6).toLocaleDateString('he-IL', { month: 'long', day: 'numeric' }); // Tue 1/6
    const to   = new Date(2026, 0, 8).toLocaleDateString('he-IL', { month: 'long', day: 'numeric' }); // Thu 1/8
    expect(result).toBe(`${from} – ${to}`);
  });

  it('returns null for an order with no shipping method (legacy/membership) rather than inventing a date', () => {
    expect(getEstimatedDelivery({ shippingMethod: null, createdAt: THURSDAY }, fakeT, 'he')).toBeNull();
    expect(getEstimatedDelivery({ createdAt: THURSDAY }, fakeT, 'he')).toBeNull();
  });

  it('returns null for an unrecognized/retired shipping method rather than guessing', () => {
    expect(getEstimatedDelivery({ shippingMethod: 'home_delivery', createdAt: THURSDAY }, fakeT, 'he')).toBeNull();
  });
});
