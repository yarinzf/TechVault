'use strict';

const env    = require('../config/env');
const logger = require('../config/logger');

let _stripe = null;
const sdk = () => {
  if (!_stripe) {
    const Stripe = require('stripe');
    _stripe = Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return _stripe;
};

// ── Create a PaymentIntent for the given order ────────────────────────────────
// Stripe amounts are in the smallest currency unit (agorot for ILS, cents for USD).
const createIntent = async (order) => {
  const intent = await sdk().paymentIntents.create({
    amount:      Math.round(order.total * 100),
    currency:    'ils',
    description: `TechVault Order ${order.orderNumber}`,
    metadata: {
      orderId:     order._id.toString(),
      orderNumber: order.orderNumber,
    },
  });
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
};

// ── Retrieve a PaymentIntent to verify its status ─────────────────────────────
const retrieveIntent = async (paymentIntentId) => {
  return sdk().paymentIntents.retrieve(paymentIntentId);
};

// ── Issue a (partial) refund against a PaymentIntent ─────────────────────────
// Falls back to mock if the order has no paymentRef (e.g. cash orders).
const processRefund = async (order, amount, reason) => {
  if (!order.paymentRef) {
    logger.warn(`stripe.provider: order ${order.orderNumber} has no paymentRef — mock fallback`);
    return {
      success:       true,
      transactionId: `MOCK-REF-${Date.now().toString(36).toUpperCase()}`,
      message:       'Refund processed (mock fallback — no paymentRef)',
    };
  }
  const refund = await sdk().refunds.create({
    payment_intent: order.paymentRef,
    amount:         Math.round(amount * 100),
    reason:         reason || undefined,
  });
  return {
    success:       refund.status === 'succeeded',
    transactionId: refund.id,
    message:       refund.status === 'succeeded'
      ? 'Refund processed via Stripe'
      : `Refund pending — status: ${refund.status}`,
  };
};

// ── Verify a Stripe webhook signature and parse the event ─────────────────────
const constructWebhookEvent = (rawBody, signature, secret) =>
  sdk().webhooks.constructEvent(rawBody, signature, secret);

module.exports = { createIntent, retrieveIntent, processRefund, constructWebhookEvent };
