'use strict';

const Order  = require('../models/Order');
const User   = require('../models/User');
const { isMembershipActive } = require('../models/User');
const { AppError }  = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { generateOrderNumber } = require('./order.service');
const {
  MEMBERSHIP_ITEM_TYPE,
  MEMBERSHIP_PLANS,
  MEMBERSHIP_PLAN_KEYS,
  addCalendarTerm,
} = require('../config/membership');

const PAYMENT_TIMEOUT_MS = parseInt(process.env.PAYMENT_TIMEOUT_MS || '360000', 10); // 6 min

// ─── Shared predicate — used by payment.controller.js too ─────────────────────
const orderContainsMembership = (order) =>
  (order.items || []).some(item => item.itemType === MEMBERSHIP_ITEM_TYPE);

// ─── Create (or recover) a pending membership purchase order ──────────────────
// Bypasses Cart entirely — membership is not physical inventory and must
// never enter the product stock-decrement path. Price is always the
// server's canonical MEMBERSHIP_PLANS[plan].price for the requested plan;
// any client-submitted price is ignored because the endpoint accepts no
// pricing input at all — only a plan key.
//
// Concurrency: a sequential find-then-create is NOT safe — two simultaneous
// requests can both observe "no pending order" and each create a separate
// payable order, which would let a user (or attacker script) pay twice for
// one membership term. `membershipPendingLock` + the partial unique index
// on {user, membershipPendingLock:'pending'} (see Order model) makes "at
// most one live pending membership order per user" a database-level
// guarantee, not an application-level assumption.
const createMembershipOrder = async (userId, plan) => {
  if (!MEMBERSHIP_PLAN_KEYS.includes(plan)) {
    throw new AppError(`Invalid membership plan — expected one of: ${MEMBERSHIP_PLAN_KEYS.join(', ')}`, StatusCodes.BAD_REQUEST, 'INVALID_MEMBERSHIP_PLAN');
  }

  const user = await User.findById(userId).select('membership');
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');

  // Unlike the old lifetime model, an already-active member is NOT blocked
  // from purchasing again — a term membership is meant to be renewable, and
  // activateMembershipForOrder extends the term from the CURRENT expiresAt
  // when the member is still active (see there), so renewing early never
  // loses already-paid time. Only the membershipPendingLock mechanism below
  // guards against genuine duplicate PAYABLE orders.

  // Self-heal: release any lock left behind by an order whose payment window
  // has already expired. The cleanup job (cancelExpiredOrders.job.js) also
  // releases this on its own schedule, but a purchase attempt shouldn't have
  // to wait on that cadence — expired locks are reclaimed lazily, right here.
  await Order.updateOne(
    { user: userId, membershipPendingLock: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { membershipPendingLock: null } }
  );

  // Fast path: reuse a live pending order FOR THE SAME PLAN (mirrors the
  // product-checkout UX, which recovers a pending order the same way). A
  // pending order for a DIFFERENT plan than the one now requested is left
  // alone here — the unique index still guarantees only one can ever become
  // payable, and letting the old one expire naturally is simpler and safer
  // than mutating an in-flight order's price. This is an optimization only —
  // the unique index below is what actually prevents duplicate purchases.
  const existing = await Order.findOne({
    user: userId,
    membershipPendingLock: 'pending',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (existing && orderContainsMembership(existing) && existing.items[0]?.metadata?.membershipPlan === plan) {
    return existing;
  }

  const planConfig = MEMBERSHIP_PLANS[plan];
  const orderNumber = await generateOrderNumber();

  try {
    return await Order.create({
      orderNumber,
      user: userId,
      membershipPendingLock: 'pending',
      items: [{
        itemType:    MEMBERSHIP_ITEM_TYPE,
        name:        planConfig.name,
        sku:         planConfig.sku,
        unitPrice:   planConfig.price,
        quantity:    1,
        totalPrice:  planConfig.price,
        metadata:    { membershipPlan: plan },
      }],
      // No shippingAddress — membership has nothing to ship.
      subtotal:     planConfig.price,
      taxAmount:    0,
      shippingCost: 0,
      total:        planConfig.price,
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

// ─── Activate (or renew) membership after a successful, paid order ────────────
// Called only from the backend payment-confirmation path (never reachable
// directly from the client). Idempotent: safe to call more than once for the
// same order — subsequent calls are no-ops (the order is only ever consumed
// once, guarded by a marker on the order itself since, unlike the old
// lifetime model, 'status: active' is no longer sufficient to detect replay —
// a member can legitimately purchase again to renew).
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

  // Idempotency marker lives on the ORDER (not on User.membership.status,
  // which legitimately changes across renewals) — a membershipActivatedAt
  // stamp on the order itself means "this specific order already extended
  // the term once", making a replayed webhook/confirm call a safe no-op.
  if (order.membershipActivatedAt) {
    return User.findById(userId);
  }

  const plan = order.items.find(i => i.itemType === MEMBERSHIP_ITEM_TYPE)?.metadata?.membershipPlan;
  const planConfig = MEMBERSHIP_PLANS[plan];
  if (!planConfig) {
    throw new AppError('Order has an invalid/unrecognized membership plan', StatusCodes.BAD_REQUEST, 'INVALID_MEMBERSHIP_PLAN');
  }

  const now = new Date();
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');

  // Renewal extends from the CURRENT expiresAt if the member is still
  // active (so renewing early never loses already-paid time); otherwise
  // (first join, or renewing after expiry) the new term starts now.
  // Real calendar-month/year arithmetic — see addCalendarTerm.
  const currentlyActive = isMembershipActive(user.membership);
  const base = currentlyActive && user.membership.expiresAt ? new Date(user.membership.expiresAt) : now;
  const expiresAt = addCalendarTerm(base, plan);

  user.membership.status = 'active';
  user.membership.plan = plan;
  user.membership.startedAt = now;
  user.membership.expiresAt = expiresAt;
  if (!user.membership.joinedAt) user.membership.joinedAt = now; // first-ever join date — never overwritten again
  // A real purchase is a fresh opt-in under the target auto-renew model —
  // reset any prior cancellation so the new term starts with the default
  // "will renew unless cancelled again" intent. See cancelAutoRenew below;
  // note neither flag currently drives any real charge (see the schema
  // comment on User.js#membershipSchema) — this is state bookkeeping only.
  user.membership.autoRenew = true;
  user.membership.cancelAtPeriodEnd = false;
  user.membership.cancelledAt = null;
  await user.save();

  // Atomic, race-safe idempotency stamp — a concurrent replay of this same
  // call will simply find membershipActivatedAt already set above and no-op.
  await Order.updateOne({ _id: orderId, membershipActivatedAt: null }, { $set: { membershipActivatedAt: now } });

  return user;
};

// ─── Update only the notification preference ───────────────────────────────────
// Deliberately narrow: this is the ONLY membership field a user may change
// themselves. status/plan/points/lifetimePoints/expiresAt are never accepted
// here — the validator upstream (membership.validator.js) doesn't even
// parse them.
// ─── Cancel auto-renewal — "Cancel Membership" ─────────────────────────────────
// Deliberately NOT a refund and NOT an immediate deactivation. This only
// records that the customer opted out of the NEXT renewal — expiresAt is
// untouched, VIP access continues exactly through the current paid term,
// same as e.g. Netflix/Disney+ cancellation. Idempotent: calling this again
// while already cancelled is a safe no-op (cancelledAt keeps its original
// timestamp).
//
// No payment-provider call happens here — there is nothing to cancel
// provider-side yet (see the Club/VIP recurring-billing audit: no Stripe
// Subscription object exists for this membership to begin with). Once real
// recurring billing exists, this is also where the corresponding
// stripe.subscriptions.update(..., { cancel_at_period_end: true }) call
// would be made.
const cancelAutoRenew = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');

  if (!isMembershipActive(user.membership)) {
    throw new AppError(
      'No active membership to cancel',
      StatusCodes.BAD_REQUEST,
      'NOT_A_MEMBER'
    );
  }

  if (!user.membership.cancelAtPeriodEnd) {
    user.membership.autoRenew = false;
    user.membership.cancelAtPeriodEnd = true;
    user.membership.cancelledAt = new Date();
    await user.save();
  }

  return user;
};

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
  cancelAutoRenew,
};
