'use strict';

const User = require('../models/User');
const Order = require('../models/Order');
const MembershipPointsTransaction = require('../models/MembershipPointsTransaction');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const {
  POINTS_DEFAULT_RATE,
  POINTS_REDEMPTION_RATE,
  POINTS_EXPIRY_MONTHS,
} = require('../config/membership');

// ─── Pure earning calculation — no DB access ──────────────────────────────────
// Takes already-resolved per-item inputs (the CALLER — order.service.js —
// looks up each product's pointsEligible/pointsRateOverride and any active
// campaign pointsMultiplier, since that requires Product/Campaign access
// this module deliberately stays decoupled from) and returns the FINAL,
// checkout-time-locked earning breakdown. Never recomputed later from live
// Product/Campaign state — see Part M of the Club/VIP spec.
//
// items: [{ totalPrice, pointsEligible: bool, pointsRate: number, pointsMultiplier: number }]
// isMember: whether the buyer is an active VIP member AT CHECKOUT TIME
// pointsRedeemedValue: ₪ value of points being redeemed on this same order
//
// Redemption reduces the EARNING BASE proportionally across all
// point-eligible lines (never favoring one line over another) — see the
// worked example in points.service.test.js:
//   ₪1,000 eligible, 200 points redeemed → net eligible base ₪800 → 5% = 40
//   points (NOT 50 — the redeemed portion never earns points).
function computeOrderPointsPlan({ items, isMember, pointsRedeemedValue = 0 }) {
  if (!isMember) {
    return {
      items: items.map(() => ({ pointsEligible: false, pointsRate: 0, pointsMultiplier: 1, pointsEarned: 0 })),
      pointsEarned: 0,
    };
  }

  const eligibleSubtotal = items.reduce((sum, it) => it.pointsEligible ? sum + it.totalPrice : sum, 0);
  const redemptionAgainstEligible = Math.min(pointsRedeemedValue, eligibleSubtotal);
  const scaleFactor = eligibleSubtotal > 0 ? (eligibleSubtotal - redemptionAgainstEligible) / eligibleSubtotal : 0;

  let pointsEarned = 0;
  const itemResults = items.map((it) => {
    if (!it.pointsEligible) {
      return { pointsEligible: false, pointsRate: 0, pointsMultiplier: 1, pointsEarned: 0 };
    }
    const netBase = it.totalPrice * scaleFactor;
    const rate = it.pointsRate ?? POINTS_DEFAULT_RATE;
    const multiplier = it.pointsMultiplier ?? 1;
    const earned = Math.floor(netBase * rate * multiplier);
    pointsEarned += earned;
    return { pointsEligible: true, pointsRate: rate, pointsMultiplier: multiplier, pointsEarned: earned };
  });

  return { items: itemResults, pointsEarned };
}

// ─── Redemption reservation — atomic, concurrency-safe ────────────────────────
// Deducts `points` from the user's AVAILABLE balance immediately (this IS
// the reservation — see reverseRedemption for how it's given back on
// failure/cancellation) using a single atomic conditional update, so two
// simultaneous checkouts can never both spend the same points: only one
// findOneAndUpdate can match `points >= requested` and win the race: the
// loser gets null back and the order is rejected with INSUFFICIENT_POINTS.
//
// `orderId` is a CALLER-PREGENERATED ObjectId (order.service.js creates it
// with `new mongoose.Types.ObjectId()` before building the order, then
// passes the same id as the new Order document's `_id`) — this lets the
// ledger 'redeem' row reference its order atomically from the moment it's
// created, so the unique {order,type:'redeem'} index gives real idempotency
// immediately instead of via a fragile two-step "reserve, then attach later".
async function reservePoints(userId, points, orderId, session = null) {
  if (!points || points <= 0) return { pointsRedeemedValue: 0 };

  const updated = await User.findOneAndUpdate(
    { _id: userId, 'membership.points': { $gte: points } },
    { $inc: { 'membership.points': -points } },
    { new: true, session }
  );

  if (!updated) {
    throw new AppError(
      'Insufficient points balance for this redemption',
      StatusCodes.BAD_REQUEST,
      'INSUFFICIENT_POINTS'
    );
  }

  try {
    await MembershipPointsTransaction.create([{
      user: userId,
      order: orderId,
      type: 'redeem',
      points,
      balanceAfter: updated.membership.points,
      description: 'Points redeemed at checkout',
    }], { session });
  } catch (err) {
    // A genuine DB error here must not silently leave points deducted with
    // no ledger trail — refund the reservation and re-throw.
    await User.updateOne({ _id: userId }, { $inc: { 'membership.points': points } });
    throw err;
  }

  return { pointsRedeemedValue: points * POINTS_REDEMPTION_RATE };
}

// ─── Reverse a reservation — cancelled/expired/failed order ───────────────────
// Idempotent: safe to call more than once for the same order (checks
// pointsRedeemedReversed on the order first). Returns the reserved points to
// the user's available balance without touching lifetimePoints, since the
// original 'redeem' never touched lifetimePoints either.
async function reverseRedemption(order, session = null) {
  if (!order.pointsRedeemed || order.pointsRedeemed <= 0) return;
  if (order.pointsRedeemedReversed) return; // already reversed — no-op

  const original = await MembershipPointsTransaction.findOne({ order: order._id, type: 'redeem' }, null, { session });

  const updated = await User.findOneAndUpdate(
    { _id: order.user },
    { $inc: { 'membership.points': order.pointsRedeemed } },
    { new: true, session }
  );

  await MembershipPointsTransaction.create([{
    user: order.user,
    order: order._id,
    type: 'reversal',
    points: order.pointsRedeemed,
    balanceAfter: updated?.membership?.points ?? null,
    description: 'Redeemed points returned — order cancelled/expired/refunded',
    relatedTransaction: original?._id ?? null,
  }], { session });

  // Persisted directly (not left to the caller's own order.save(), whose
  // timing relative to this call varies by caller) — plus kept in sync on
  // the in-memory object so a caller that reads it back afterward sees the
  // correct value either way.
  await Order.updateOne({ _id: order._id }, { $set: { pointsRedeemedReversed: true } }, { session });
  order.pointsRedeemedReversed = true;
}

// ─── Realize earned points — order reached 'delivered' ────────────────────────
// Idempotent via the order's own pointsEarnedRealized flag AND the ledger's
// unique {order,type:'earn'} index (belt-and-suspenders — a race between two
// concurrent calls for the same order can only ever insert one 'earn' row).
async function realizeEarnedPoints(order) {
  if (!order.pointsEarned || order.pointsEarned <= 0) return;
  if (order.pointsEarnedRealized) return; // already realized — no-op

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + POINTS_EXPIRY_MONTHS);

  try {
    const updated = await User.findOneAndUpdate(
      { _id: order.user },
      { $inc: { 'membership.points': order.pointsEarned, 'membership.lifetimePoints': order.pointsEarned } },
      { new: true }
    );

    await MembershipPointsTransaction.create({
      user: order.user,
      order: order._id,
      type: 'earn',
      points: order.pointsEarned,
      balanceAfter: updated?.membership?.points ?? null,
      description: '5% Club points earned on eligible purchase',
      expiresAt,
    });
  } catch (err) {
    if (err.code === 11000) return; // lost the idempotency race — another call already realized this order
    throw err;
  }

  await Order.updateOne({ _id: order._id }, { $set: { pointsEarnedRealized: true } });
  order.pointsEarnedRealized = true;
}

// ─── Reverse earned points — full refund only ──────────────────────────────────
// Partial refunds do NOT reverse points in this phase — the OrderItem
// schema has no per-item refunded-quantity field (a pre-existing modeling
// gap, documented elsewhere in the codebase), so precise partial-refund
// point reconciliation isn't safely derivable yet. This is a known,
// reported limitation — see the Club/VIP final report.
async function reverseEarnedPoints(order) {
  if (!order.pointsEarnedRealized) return; // nothing was ever realized
  if (order.pointsEarnedReversed) return;  // already reversed — no-op

  const original = await MembershipPointsTransaction.findOne({ order: order._id, type: 'earn' });
  const toReverse = original?.points ?? order.pointsEarned;

  const user = await User.findById(order.user).select('membership');
  if (!user) return;

  // Floor at 0 — the member may have already redeemed/spent some of these
  // points; the balance itself can never go negative, though lifetimePoints
  // is reduced by the full original amount (it's a correction: these points
  // should never have counted as historically earned once the sale is
  // undone).
  const pointsDelta = -Math.min(toReverse, user.membership.points);
  const lifetimeDelta = -toReverse;

  const updated = await User.findByIdAndUpdate(
    order.user,
    {
      $inc: {
        'membership.points': pointsDelta,
        'membership.lifetimePoints': lifetimeDelta,
      },
    },
    { new: true }
  );
  // Guard against a negative lifetimePoints floor from an unusual sequence
  // of reversals — clamp defensively.
  if (updated.membership.lifetimePoints < 0) {
    await User.updateOne({ _id: order.user }, { $set: { 'membership.lifetimePoints': 0 } });
  }

  await MembershipPointsTransaction.create({
    user: order.user,
    order: order._id,
    type: 'reversal',
    points: toReverse,
    balanceAfter: Math.max(0, (updated?.membership?.points ?? 0)),
    description: 'Earned points reversed — order fully refunded',
    relatedTransaction: original?._id ?? null,
  });

  await Order.updateOne({ _id: order._id }, { $set: { pointsEarnedReversed: true } });
  order.pointsEarnedReversed = true;
}

// ─── Points expiry reconciliation ──────────────────────────────────────────────
// No cron is added in this phase (see final report) — this is called
// lazily/on-demand (e.g. from a future points-summary read path or a manual
// script) and is fully idempotent: each 'earn' row is marked
// expiredProcessed once handled and never reprocessed.
//
// Simplification (documented, not silently invented): this does NOT do
// exact FIFO lot-by-lot tracking of which specific earned points survived
// redemption — it expires min(that batch's amount, the user's CURRENT
// available balance) per due batch, oldest first, so a user can never be
// pushed into a negative balance by expiry even if they've already spent
// points from a newer batch. See the final report for the precision
// tradeoff this implies.
async function expireDuePoints(userId) {
  const now = new Date();
  const due = await MembershipPointsTransaction.find({
    user: userId,
    type: 'earn',
    expiresAt: { $lte: now },
    expiredProcessed: { $ne: true },
  }).sort({ expiresAt: 1 });

  if (due.length === 0) return { expired: 0 };

  let totalExpired = 0;
  for (const batch of due) {
    const user = await User.findById(userId).select('membership.points');
    const available = user?.membership?.points ?? 0;
    if (available <= 0) {
      await MembershipPointsTransaction.updateOne({ _id: batch._id }, { $set: { expiredProcessed: true } });
      continue;
    }
    const expireAmount = Math.min(batch.points, available);
    if (expireAmount > 0) {
      const updated = await User.findOneAndUpdate(
        { _id: userId, 'membership.points': { $gte: expireAmount } },
        { $inc: { 'membership.points': -expireAmount } },
        { new: true }
      );
      await MembershipPointsTransaction.create({
        user: userId,
        type: 'expiry',
        points: expireAmount,
        balanceAfter: updated?.membership?.points ?? null,
        description: `${POINTS_EXPIRY_MONTHS}-month points expiry`,
        relatedTransaction: batch._id,
      });
      totalExpired += expireAmount;
    }
    await MembershipPointsTransaction.updateOne({ _id: batch._id }, { $set: { expiredProcessed: true } });
  }

  return { expired: totalExpired, batchesProcessed: due.length };
}

module.exports = {
  computeOrderPointsPlan,
  reservePoints,
  reverseRedemption,
  realizeEarnedPoints,
  reverseEarnedPoints,
  expireDuePoints,
};
