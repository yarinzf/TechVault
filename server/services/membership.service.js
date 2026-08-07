'use strict';

const Order  = require('../models/Order');
const User   = require('../models/User');
const { AppError }  = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { generateOrderNumber } = require('./order.service');
const {
  MEMBERSHIP_PRICE,
  MEMBERSHIP_ITEM_TYPE,
  MEMBERSHIP_SKU,
  MEMBERSHIP_NAME,
  MEMBERSHIP_TYPE,
} = require('../config/membership');

const PAYMENT_TIMEOUT_MS = parseInt(process.env.PAYMENT_TIMEOUT_MS || '360000', 10); // 6 min

// ─── Shared predicate — used by payment.controller.js too ─────────────────────
const orderContainsMembership = (order) =>
  (order.items || []).some(item => item.itemType === MEMBERSHIP_ITEM_TYPE);

// ─── Create (or recover) a pending membership purchase order ──────────────────
// Bypasses Cart entirely — membership is not physical inventory and must
// never enter the product stock-decrement path. Price is always the server's
// canonical MEMBERSHIP_PRICE; any client-submitted price is ignored because
// the endpoint accepts no pricing input at all.
//
// Concurrency: a sequential find-then-create is NOT safe — two simultaneous
// requests can both observe "no pending order" and each create a separate
// payable ₪50 order, which would let a user (or attacker script) pay twice
// for a single lifetime membership. `membershipPendingLock` + the partial
// unique index on {user, membershipPendingLock:'pending'} (see Order model)
// makes "at most one live pending membership order per user" a database-level
// guarantee, not an application-level assumption.
const createMembershipOrder = async (userId) => {
  const user = await User.findById(userId).select('membership');
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');

  if (user.membership?.status === 'active') {
    throw new AppError(
      'You are already a TechVault Club member',
      StatusCodes.CONFLICT,
      'ALREADY_MEMBER'
    );
  }

  // Self-heal: release any lock left behind by an order whose payment window
  // has already expired. The cleanup job (cancelExpiredOrders.job.js) also
  // releases this on its own schedule, but a purchase attempt shouldn't have
  // to wait on that cadence — expired locks are reclaimed lazily, right here.
  await Order.updateOne(
    { user: userId, membershipPendingLock: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { membershipPendingLock: null } }
  );

  // Fast path: reuse a live pending order (mirrors the product-checkout UX,
  // which recovers a pending order the same way). This is an optimization
  // only — the unique index below is what actually prevents duplicates.
  const existing = await Order.findOne({
    user: userId,
    membershipPendingLock: 'pending',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (existing) return existing;

  const orderNumber = await generateOrderNumber();

  try {
    return await Order.create({
      orderNumber,
      user: userId,
      membershipPendingLock: 'pending',
      items: [{
        itemType:    MEMBERSHIP_ITEM_TYPE,
        name:        MEMBERSHIP_NAME,
        sku:         MEMBERSHIP_SKU,
        unitPrice:   MEMBERSHIP_PRICE,
        quantity:    1,
        totalPrice:  MEMBERSHIP_PRICE,
        metadata:    { membershipType: MEMBERSHIP_TYPE },
      }],
      // No shippingAddress — membership has nothing to ship.
      subtotal:     MEMBERSHIP_PRICE,
      taxAmount:    0,
      shippingCost: 0,
      total:        MEMBERSHIP_PRICE,
      expiresAt:    new Date(Date.now() + PAYMENT_TIMEOUT_MS),
    });
  } catch (err) {
    // Duplicate key on {user, membershipPendingLock} — a concurrent request
    // won the race and already holds this user's pending slot. That order is
    // the authoritative result, not an error: return it.
    if (err.code === 11000) {
      const winner = await Order.findOne({ user: userId, membershipPendingLock: 'pending' })
        .sort({ createdAt: -1 });
      if (winner) return winner;
    }
    throw err;
  }
};

// ─── Activate membership after a successful, paid membership order ────────────
// Called only from the backend payment-confirmation path (never reachable
// directly from the client). Idempotent: safe to call more than once for the
// same order — subsequent calls are no-ops.
const activateMembershipForOrder = async ({ userId, orderId }) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');

  if (order.user.toString() !== userId.toString()) {
    throw new AppError(
      'Order does not belong to this user',
      StatusCodes.FORBIDDEN,
      'ORDER_USER_MISMATCH'
    );
  }

  if (!orderContainsMembership(order)) {
    throw new AppError(
      'Order does not contain a membership purchase',
      StatusCodes.BAD_REQUEST,
      'NOT_A_MEMBERSHIP_ORDER'
    );
  }

  if (order.paymentStatus !== 'paid') {
    throw new AppError(
      'Order has not been paid — cannot activate membership',
      StatusCodes.BAD_REQUEST,
      'ORDER_NOT_PAID'
    );
  }

  // Atomic, conditional activation: only flips status/sets joinedAt the
  // first time. A concurrent or repeated call for the same (already-active)
  // user simply matches nothing and is a safe no-op — this is what makes
  // activation idempotent and race-safe without a distributed lock.
  const activated = await User.findOneAndUpdate(
    { _id: userId, 'membership.status': { $ne: 'active' } },
    { $set: { 'membership.status': 'active', 'membership.joinedAt': new Date() } },
    { new: true }
  );

  if (activated) return activated;

  // Already active (idempotent replay) — return current state, untouched.
  const current = await User.findById(userId);
  if (!current) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');
  return current;
};

// ─── Update only the notification preference ───────────────────────────────────
// Deliberately narrow: this is the ONLY membership field a user may change
// themselves. status/joinedAt/points/lifetimePoints are never accepted here —
// the validator upstream (membership.validator.js) doesn't even parse them.
const updateNotificationPreference = async (userId, notificationPreference) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { 'membership.notificationPreference': notificationPreference } },
    { new: true, runValidators: true }
  );
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');
  return user;
};

module.exports = {
  createMembershipOrder,
  activateMembershipForOrder,
  orderContainsMembership,
  updateNotificationPreference,
};
