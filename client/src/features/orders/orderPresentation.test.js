import { describe, it, expect } from 'vitest';
import {
  getShippingMethodLabel, SHIPPING_METHOD_LABEL_KEY, getPaymentLabel, parsePaymentFromNotes,
  formatShippingAddress,
} from './orderPresentation';

// Minimal fake translator — mirrors the real t() contract closely enough
// for this pure-mapping test (key in -> string out).
const fakeT = (key) => {
  const DICT = {
    'order.shipping_method.store_pickup': 'איסוף עצמי',
    'order.shipping_method.standard':     'משלוח רגיל',
    'order.shipping_method.express':      'משלוח מהיר',
    'order.shipping_method.unknown':      'לא צוין',
    'checkout.payment_credit':            'כרטיס אשראי',
    'order.payment_card':                 'כרטיס',
    'order.payment_cash':                 'תשלום במזומן',
    'order.success.payment_zero_cash':    'כיסוי מלא בנקודות מועדון',
    'checkout.zip':                       'מיקוד',
  };
  return DICT[key] ?? key;
};

describe('getShippingMethodLabel — Shipping V1 presentation mapping', () => {
  it('maps store_pickup to the correct localized label', () => {
    expect(getShippingMethodLabel('store_pickup', fakeT)).toBe('איסוף עצמי');
  });

  it('maps standard to the correct localized label', () => {
    expect(getShippingMethodLabel('standard', fakeT)).toBe('משלוח רגיל');
  });

  it('maps express to the correct localized label', () => {
    expect(getShippingMethodLabel('express', fakeT)).toBe('משלוח מהיר');
  });

  it('falls back gracefully for an unknown/legacy value, never throwing or showing a raw identifier', () => {
    expect(getShippingMethodLabel(undefined, fakeT)).toBe('לא צוין');
    expect(getShippingMethodLabel(null, fakeT)).toBe('לא צוין');
    expect(getShippingMethodLabel('home_delivery', fakeT)).toBe('לא צוין'); // retired identifier
  });

  it('every canonical method has a mapped translation key', () => {
    expect(Object.keys(SHIPPING_METHOD_LABEL_KEY).sort()).toEqual(['express', 'standard', 'store_pickup']);
  });
});

describe('getPaymentLabel / parsePaymentFromNotes — safe payment display, never a fabricated card number', () => {
  it('shows the masked real last4 for a credit-card order that has one', () => {
    const order = { paymentMethod: 'credit_card', paymentCardBrand: 'visa', paymentCardLast4: '4242' };
    expect(getPaymentLabel(order, fakeT)).toBe('כרטיס אשראי •••• 4242');
  });

  it('never shows the card brand name — Sapir\'s reference has no brand text', () => {
    const order = { paymentMethod: 'credit_card', paymentCardBrand: 'visa', paymentCardLast4: '4242' };
    expect(getPaymentLabel(order, fakeT)).not.toMatch(/visa/i);
  });

  it('shows the zero-cash label for a fully points-covered order', () => {
    const order = { paymentMethod: 'zero_cash', total: 0 };
    expect(getPaymentLabel(order, fakeT)).toBe('כיסוי מלא בנקודות מועדון');
  });

  it('a credit-card order with no last4 (edge case) shows the plain label, never a fabricated digit sequence', () => {
    const order = { paymentMethod: 'credit_card', paymentCardBrand: null, paymentCardLast4: null };
    expect(getPaymentLabel(order, fakeT)).toBe('כרטיס אשראי');
    expect(getPaymentLabel(order, fakeT)).not.toMatch(/\d{4}/);
  });

  it('legacy order (paymentMethod never set) with real notes falls back to the historical notes-parsing behavior, unchanged', () => {
    const order = { paymentMethod: null, notes: 'Name: A B | Payment: כרטיס אשראי' };
    expect(getPaymentLabel(order, fakeT)).toBe('כרטיס אשראי');
  });

  it('legacy order with no notes at all renders safely with the generic card fallback, never throwing', () => {
    const order = { paymentMethod: null, notes: '' };
    expect(() => getPaymentLabel(order, fakeT)).not.toThrow();
    expect(getPaymentLabel(order, fakeT)).toBe('כרטיס');
  });

  it('parsePaymentFromNotes recognizes a cash-on-delivery note', () => {
    expect(parsePaymentFromNotes('Payment: תשלום במזומן', fakeT)).toBe('תשלום במזומן');
  });
});

describe('formatShippingAddress — real localized display, never dir="ltr", never a fabricated translation', () => {
  it('a new-format order (countryLabel/cityLabel captured at Checkout) displays fully in Hebrew, RTL order', () => {
    const addr = {
      street: 'הרצל 25', city: 'Rehovot', cityLabel: 'רחובות', country: 'Israel', countryLabel: 'ישראל', zip: '',
    };
    const result = formatShippingAddress(addr, 'he', fakeT);
    expect(result.mainLine).toBe('ישראל, רחובות, הרצל 25');
  });

  it('a legacy order (no countryLabel/cityLabel at all) still shows Israel in Hebrew — the one guaranteed real mapping (Shipping V1 is Israel-only)', () => {
    const addr = { street: 'הרצל 25', city: 'Rehovot', country: 'Israel', zip: '' };
    const result = formatShippingAddress(addr, 'he', fakeT);
    expect(result.mainLine).toBe('ישראל, Rehovot, הרצל 25');
    // City is honestly left as the raw stored value — never a guessed translation.
  });

  it('formats the postal code on its own line only when a real zip is present', () => {
    const withZip = formatShippingAddress({ street: 'הרצל 25', city: 'Rehovot', cityLabel: 'רחובות', country: 'Israel', countryLabel: 'ישראל', zip: '7650683' }, 'he', fakeT);
    expect(withZip.postalLine).toBe('מיקוד - 7650683');

    const withoutZip = formatShippingAddress({ street: 'הרצל 25', city: 'Rehovot', cityLabel: 'רחובות', country: 'Israel', countryLabel: 'ישראל', zip: '' }, 'he', fakeT);
    expect(withoutZip.postalLine).toBeNull();
  });

  it('never produces a doubled/dangling comma when an optional field is empty', () => {
    const result = formatShippingAddress({ street: 'הרצל 25', city: '', country: 'Israel', countryLabel: 'ישראל', zip: '' }, 'he', fakeT);
    expect(result.mainLine).toBe('ישראל, הרצל 25');
    expect(result.mainLine).not.toMatch(/,\s*,/);
  });

  it('English mode does not force the Israel Hebrew mapping — shows the raw canonical country', () => {
    const result = formatShippingAddress({ street: 'Herzl 25', city: 'Rehovot', country: 'Israel', zip: '' }, 'en', fakeT);
    expect(result.mainLine).toBe('Israel, Rehovot, Herzl 25');
  });

  it('a captured countryLabel always wins over the guaranteed-Israel fallback, even in edge cases', () => {
    const result = formatShippingAddress({ street: 'S', city: 'C', country: 'Israel', countryLabel: 'ISR-LABEL', zip: '' }, 'he', fakeT);
    expect(result.mainLine).toBe('ISR-LABEL, C, S');
  });

  it('returns null for a missing shippingAddress rather than throwing (e.g. a membership-only order)', () => {
    expect(formatShippingAddress(null, 'he', fakeT)).toBeNull();
    expect(formatShippingAddress(undefined, 'he', fakeT)).toBeNull();
  });
});
