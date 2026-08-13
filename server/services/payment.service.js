'use strict';

// Provider-abstracted payment layer.
// Auto-selects Stripe when STRIPE_SECRET_KEY is a real test/live key;
// falls back to mock (approves everything) when the key is absent or stubbed.

const env = require('../config/env');

// ── Provider selection ────────────────────────────────────────────────────────
const isRealStripeKey = (key) =>
  !!key &&
  key !== 'sk_test_stub' &&
  (key.startsWith('sk_test_') || key.startsWith('sk_live_'));

const PROVIDER = isRealStripeKey(env.STRIPE_SECRET_KEY) ? 'stripe' : 'mock';

// ── Mock provider — simulates success/decline based on card number ────────────
const MOCK_DECLINE_CARDS = new Set(['4000000000000002']);

const mockProvider = {
  async createIntent(order, cardDetails = {}) {
    const num = (cardDetails.cardNumber || '').replace(/[\s-]/g, '');
    if (MOCK_DECLINE_CARDS.has(num)) {
      const err = new Error('Your card was declined.');
      err.code  = 'card_declined';
      throw err;
    }
    return {
      clientSecret:    `mock_cs_${order._id}_${Date.now().toString(36)}`,
      paymentIntentId: `mock_pi_${order._id}_${Date.now().toString(36)}`,
    };
  },
  async retrieveIntent(_paymentIntentId) {
    return { status: 'succeeded' };
  },
  async processRefund(_order, _amount, _reason) {
    return {
      success:       true,
      transactionId: `MOCK-REF-${Date.now().toString(36).toUpperCase()}`,
      message:       'Refund processed (mock)',
    };
  },
};

// ── Stripe provider (real SDK, lazy-loaded) ───────────────────────────────────
const stripeProvider = require('./stripe.provider');

const PROVIDERS = { mock: mockProvider, stripe: stripeProvider };
const provider  = () => PROVIDERS[PROVIDER];

// ── Safe display-metadata derivation ──────────────────────────────────────────
// Neither provider ever returns a confirmed Stripe PaymentMethod (the current
// Stripe integration creates a bare PaymentIntent with no attached payment
// method — see stripe.provider.js createIntent — so there is no real
// intent.payment_method.card to read brand/last4 from). The only place a real
// card number ever exists is in this request's own body, for this one call —
// brand/last4 are derived from it here and returned to the caller; the number
// itself is never part of this return value, never logged, never persisted.
const CARD_BRAND_PATTERNS = {
  visa: /^4/, mastercard: /^5[1-5]/, amex: /^3[47]/, discover: /^6(?:011|5)/,
};

const getCardDisplayMeta = (cardNumber) => {
  const raw = String(cardNumber || '').replace(/[\s-]/g, '');
  if (!raw) return { brand: null, last4: null };
  let brand = null;
  for (const [name, re] of Object.entries(CARD_BRAND_PATTERNS)) {
    if (re.test(raw)) { brand = name; break; }
  }
  const last4 = raw.length >= 4 ? raw.slice(-4) : null;
  return { brand, last4 };
};

module.exports = {
  PROVIDER,
  createIntent:          (order, cardDetails)        => provider().createIntent(order, cardDetails),
  retrieveIntent:        (paymentIntentId)           => provider().retrieveIntent(paymentIntentId),
  processRefund:         (order, amount, reason)     => provider().processRefund(order, amount, reason),
  // Webhook signature verification is always Stripe — mock never sends webhooks
  constructWebhookEvent: (raw, sig, secret)          => stripeProvider.constructWebhookEvent(raw, sig, secret),
  getCardDisplayMeta,
};
