'use strict';

const { StatusCodes }  = require('http-status-codes');
const Order            = require('../models/Order');
const Cart             = require('../models/Cart');
const { AppError }     = require('../middleware/errorHandler');
const paymentService   = require('../services/payment.service');
const couponService    = require('../services/coupon.service');
const audit            = require('../services/audit.service');
const emitter          = require('../events/emitter');
const EVENTS           = require('../events/events');
const { sendSuccess }  = require('../utils/response');
const env              = require('../config/env');
const logger           = require('../config/logger');

// ── POST /api/v1/payments/create-intent ───────────────────────────────────────
// Creates a Stripe PaymentIntent (or mock equivalent) for the given order.
// Stores the paymentIntentId on the order as paymentRef.
// Returns { clientSecret, paymentIntentId, provider } to the client.
const createIntent = async (req, res, next) => {
  try {
    const { orderId, cardNumber, cardHolder, expiry, cvv } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');
    }
    if (order.user.toString() !== req.user._id.toString()) {
      throw new AppError('Forbidden', StatusCodes.FORBIDDEN, 'FORBIDDEN');
    }
    // Guard: order must still be in the payment window.
    // The expiry job sets status='cancelled' atomically; checking both fields
    // prevents a race where the job cancels the order between the route reaching
    // here and the PaymentIntent being created.
    if (order.status !== 'pending_payment') {
      throw new AppError(
        `Order cannot accept payment in current status "${order.status}"`,
        StatusCodes.CONFLICT,
        'ORDER_NOT_PAYABLE',
      );
    }
    if (order.paymentStatus !== 'unpaid') {
      throw new AppError(
        `Order payment status is already "${order.paymentStatus}"`,
        StatusCodes.CONFLICT,
        'INVALID_PAYMENT_STATE',
      );
    }

    const { clientSecret, paymentIntentId } = await paymentService.createIntent(order, { cardNumber, cardHolder, expiry, cvv });
    logger.info('payment_intent_created', { provider: paymentService.PROVIDER, orderId: order._id, paymentIntentId });

    // Persist the intent ID so the webhook / confirm endpoint can look it up
    order.paymentRef = paymentIntentId;
    await order.save();

    sendSuccess(res, { clientSecret, paymentIntentId, provider: paymentService.PROVIDER });
  } catch (err) { next(err); }
};

// ── POST /api/v1/payments/confirm ─────────────────────────────────────────────
// Called by the client after stripe.confirmCardPayment() succeeds (or immediately
// after /create-intent when using the mock provider).
// Re-fetches the PaymentIntent from Stripe to verify server-side before updating.
const confirmPayment = async (req, res, next) => {
  try {
    const { paymentIntentId, orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');
    }
    if (order.user.toString() !== req.user._id.toString()) {
      throw new AppError('Forbidden', StatusCodes.FORBIDDEN, 'FORBIDDEN');
    }
    // Idempotency: already paid — return early without error.
    if (order.paymentStatus === 'paid') {
      return sendSuccess(res, { order }, 'Payment already confirmed');
    }

    // Guard: reject if the expiry job cancelled the order between intent creation
    // and this confirm call. After the idempotency check above we know
    // paymentStatus !== 'paid', so a non-pending_payment status means cancellation.
    if (order.status !== 'pending_payment' && order.status !== 'pending') {
      throw new AppError(
        `Order can no longer be confirmed — status is "${order.status}"`,
        StatusCodes.CONFLICT,
        'ORDER_NOT_CONFIRMABLE',
      );
    }

    logger.info('payment_confirm_start', { orderId: order._id, paymentIntentId, provider: paymentService.PROVIDER });
    // Server-side verification — never trust the client's claim alone
    const intent = await paymentService.retrieveIntent(paymentIntentId);
    logger.info('payment_intent_retrieved', { paymentIntentId, intentStatus: intent.status });
    if (intent.status !== 'succeeded') {
      throw new AppError(
        `Payment not yet confirmed — intent status: "${intent.status}"`,
        StatusCodes.BAD_REQUEST,
        'PAYMENT_NOT_CONFIRMED',
      );
    }

    const prevPayStatus = order.paymentStatus;
    order.paymentStatus = 'paid';
    order.paymentHistory.push({
      fromStatus:    prevPayStatus,
      toStatus:      'paid',
      changedAt:     new Date(),
      changedBy:     req.user._id,
      transactionId: paymentIntentId,
      amount:        order.total,
      note:          `Confirmed via ${paymentService.PROVIDER === 'stripe' ? 'Stripe sandbox' : 'mock provider'}`,
    });

    // Auto-advance order status when payment is confirmed
    if (order.status === 'pending_payment' || order.status === 'pending') {
      const prevOrderStatus = order.status;
      order.status = 'confirmed';
      order.statusHistory.push({
        fromStatus: prevOrderStatus,
        toStatus:   'confirmed',
        changedBy:  req.user._id,
        note:       'Auto-confirmed on payment success',
      });
    }

    await order.save();

    // Increment coupon usage — runs only when transitioning TO 'paid'.
    // The early-return guard above (paymentStatus === 'paid') ensures this
    // never fires twice for the same order.
    if (order.couponCode) {
      couponService.incrementCouponUsage(order.couponCode, order.user)
        .catch((err) => logger.warn('coupon_increment_failed', { message: err.message, orderId: order._id }));
    }

    // Clear the backend cart now that payment is confirmed.
    // Cart clearing was removed from order creation so a declined card does not
    // wipe the customer's cart before they get a chance to retry.
    await Cart.findOneAndUpdate({ user: order.user }, { items: [] });
    logger.info('cart_cleared_after_payment', { userId: order.user, orderId: order._id });

    audit.log({
      action:   'payment.status_changed',
      entity:   'Order',
      entityId: order._id,
      actor:    req.user,
      before:   { paymentStatus: prevPayStatus },
      after:    { paymentStatus: 'paid', transactionId: paymentIntentId },
      req,
    });

    emitter.emit(EVENTS.PAYMENT_PAID, {
      orderId:         order._id,
      orderNumber:     order.orderNumber,
      total:           order.total,
      userId:          order.user,
      transactionId:   paymentIntentId,
      provider:        paymentService.PROVIDER,
    });

    sendSuccess(res, { order }, 'Payment confirmed');
  } catch (err) { next(err); }
};

// ── POST /api/v1/payments/webhook ─────────────────────────────────────────────
// Stripe sends signed webhook events here.
// Raw body is required for signature verification — see app.js for mount order.
// This is a redundant confirmation path: if the client successfully called /confirm,
// this handler finds the order already paid and skips the update (idempotent).
const handleWebhook = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Missing stripe-signature header' });
    }

    let event;
    try {
      event = paymentService.constructWebhookEvent(
        req.body,
        sig,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: `Webhook signature invalid: ${err.message}` });
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent  = event.data.object;
      const orderId = intent.metadata?.orderId;

      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.paymentStatus !== 'paid') {
          const prevPayStatus = order.paymentStatus;
          order.paymentStatus = 'paid';
          order.paymentHistory.push({
            fromStatus:    prevPayStatus,
            toStatus:      'paid',
            changedAt:     new Date(),
            changedBy:     order.user,
            transactionId: intent.id,
            amount:        order.total,
            note:          'Stripe webhook: payment_intent.succeeded',
          });
          if (order.status === 'pending_payment' || order.status === 'pending') {
            const prevOrderStatus = order.status;
            order.status = 'confirmed';
            order.statusHistory.push({
              fromStatus: prevOrderStatus,
              toStatus:   'confirmed',
              changedBy:  order.user,
              note:       'Auto-confirmed via Stripe webhook',
            });
          }
          await order.save();

          if (order.couponCode) {
            couponService.incrementCouponUsage(order.couponCode, order.user)
              .catch((err) => logger.warn('coupon_increment_failed', { message: err.message, orderId: order._id, source: 'webhook' }));
          }

          await Cart.findOneAndUpdate({ user: order.user }, { items: [] });

          audit.log({
            action:   'payment.paid',
            entity:   'Order',
            entityId: order._id,
            actor:    { _id: order.user, role: 'user' },
            before:   { paymentStatus: prevPayStatus },
            after:    { paymentStatus: 'paid', transactionId: intent.id },
          });

          emitter.emit(EVENTS.PAYMENT_PAID, {
            orderId:       order._id,
            orderNumber:   order.orderNumber,
            total:         order.total,
            userId:        order.user,
            transactionId: intent.id,
            provider:      'stripe',
          });
        }
      }
    }

    res.json({ received: true });
  } catch (err) { next(err); }
};

module.exports = { createIntent, confirmPayment, handleWebhook };
