import { describe, it, expect } from 'vitest';
import { formatDiscountAmount } from './formatDiscount';

// Minimal fake formatPrice — mirrors useCurrency's real he-IL Intl output
// shape closely enough (ends in the currency symbol) without depending on
// Intl locale data in the test environment.
const fakeFormatPrice = (amount) => `₪${amount.toFixed(2)}`;

describe('formatDiscountAmount — RTL-aware negative amount sign position', () => {
  it('Hebrew: the minus sign trails the formatted amount', () => {
    expect(formatDiscountAmount(65, fakeFormatPrice, 'he')).toBe('₪65.00-');
  });

  it('English: the minus sign leads the formatted amount (unchanged Western convention)', () => {
    expect(formatDiscountAmount(65, fakeFormatPrice, 'en')).toBe('-₪65.00');
  });

  it('never mutates the underlying numeric amount — only the display string gets a sign', () => {
    const amount = 65;
    formatDiscountAmount(amount, fakeFormatPrice, 'he');
    expect(amount).toBe(65); // still positive, untouched
  });

  it('works for both coupon-shaped and points-shaped discount values (any positive number)', () => {
    expect(formatDiscountAmount(0.5, fakeFormatPrice, 'he')).toBe('₪0.50-');
    expect(formatDiscountAmount(1234.9, fakeFormatPrice, 'he')).toBe('₪1234.90-');
  });
});
