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
//   `totalPrice` here is the line's NET eligible amount for points purposes
//   — the caller has already subtracted this item's proportional share of
//   any coupon discount (see order.service.js) before calling this. Never
//   the raw pre-coupon line total.
// isMember: whether the buyer is an active VIP member AT CHECKOUT TIME
// pointsRedeemedValue: ₪ value of points being redeemed on this same order
//
// Redemption reduces the EARNING BASE proportionally across all
// point-eligible lines (never favoring one line over another) — see the
// worked example in points.service.test.js:
//   ₪1,000 eligible (net of coupon), 200 points redeemed → net base ₪800 →
//   5% = 40 points (NOT 50 — the redeemed portion never earns points).
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

// ─── FIFO lot consumption — the real accounting engine ─────────────────────────
// Consumes `pointsToConsume` from the user's real earn LOTS, oldest-
// expiring first (which is also oldest-earned-first, since every lot's
// expiresAt = its own createdAt + 12 months — a fixed offset preserves
// earn order). Returns the exact { lot, amount } breakdown so a later
// reversal can restore precisely what was taken from precisely where.
//
// This function does NOT re-check the user's aggregate balance — the
// caller (reservePoints) already atomically reserved the right to spend
// this many points via the User.membership.points conditional decrement,
// which serializes concurrent spenders. This function's only job is
// bookkeeping: WHICH lots the already-approved spend came from.
//
// Edge case (documented, not silently papered over): if the sum of real
// lot remainingPoints is LESS than pointsToConsume (only possible if
// points were ever granted without a matching earn lot — e.g. a direct
// admin adjustment via AdminUsersPage, which predates this ledger and
// writes membership.points directly), the shortfall is consumed from no
// lot at all (absent from the returned breakdown). That shortfall can
// never be restored to a specific lot on reversal — it is simply credited
// back to the aggregate balance, same as before this fix. This is a
// narrow, pre-existing gap (admin-adjustment points were never lot-
// tracked), not a new one.
async function consumeLotsFIFO(userId, pointsToConsume, session = null) {
  let remaining = pointsToConsume;
  const consumedLots = [];

  const lots = await MembershipPointsTransaction.find(
    { user: userId, type: 'earn', remainingPoints: { $gt: 0 } },
    null,
    { session }
  ).sort({ expiresAt: 1 });

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingPoints, remaining);
    if (take <= 0) continue;

    // Atomic, conditional — never lets a lot go negative even under a
    // concurrent consumer (defense in depth on top of the balance-level
    // serialization already provided by reservePoints).
    const updatedLot = await MembershipPointsTransaction.findOneAndUpdate(
      { _id: lot._id, remainingPoints: { $gte: take } },
      { $inc: { remainingPoints: -take } },
      { new: true, session }
    );
    if (!updatedLot) continue; // lost a race on this specific lot — move on, try the next one

    consumedLots.push({ lot: lot._id, amount: take });
    remaining -= take;
  }

  return { consumedLots, shortfall: Math.max(0, remaining) };
}

// Restores previously-consumed amounts to their exact origin lots, capped
// at each lot's original `points` (never overshoots what was truly
// earned there — relevant if the lot was independently invalidated by a
// refund in between, see reverseEarnedPoints). Atomic per lot via an
// aggregation-pipeline update.
async function restoreLotsFIFO(consumedLots, session = null) {
  for (const { lot, amount } of consumedLots) {
    await MembershipPointsTransaction.updateOne(
      { _id: lot },
      [{ $set: { remainingPoints: { $min: ['$points', { $add: ['$remainingPoints', amount] }] } } }],
      { session }
    );
  }
}

// ─── Redemption reservation — atomic, concurrency-safe ────────────────────────
// Deducts `points` from the user's AVAILABLE balance immediately (this IS
// the reservation — see reverseRedemption for how it's given back on
// failure/cancellation) using a single atomic conditional update, so two
// simultaneous checkouts can never both spend the same points: only one
// findOneAndUpdate can match `points >= requested` and win the race: the
// loser gets null back and the order is rejected with INSUFFICIENT_POINTS.
// Then records exactly which earn lots the spend came from (FIFO).
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
    const { consumedLots } = await consumeLotsFIFO(userId, points, session);

    await MembershipPointsTransaction.create([{
      user: userId,
      order: orderId,
      type: 'redeem',
      points,
      balanceAfter: updated.membership.points,
      description: 'Points redeemed at checkout',
      consumedLots,
    }], { session });
  } catch (err) {
    // A genuine DB error here must not silently leave points deducted with
    // no ledger trail — refund the reservation and re-throw. (Any partial
    // lot consumption that happened before the error is intentionally left
    // as-is: those specific lots are simply short by their consumed amount
    // until reconciled — an exceedingly rare failure path, not worth a
    // second layer of compensating transactions for local/mock providers.)
    await User.updateOne({ _id: userId }, { $inc: { 'membership.points': points } });
    throw err;
  }

  return { pointsRedeemedValue: points * POINTS_REDEMPTION_RATE };
}

// ─── Reverse a reservation by order id — the shared core ──────────────────────
// Looks up the 'redeem' ledger row for this order directly (works whether
// or not an Order document itself ever successfully saved — see
// releaseReservation), restores the exact consumed lot amounts, credits
// the aggregate balance back, and marks the ledger row itself as reversed
// (the ledger, not the Order, is the true idempotency source — Order.
// pointsRedeemedReversed is kept in sync for callers that already read it).
async function _reverseRedeemByOrderId(userId, orderId, session = null) {
  const redeemTx = await MembershipPointsTransaction.findOne(
    { order: orderId, type: 'redeem', reversedAt: null },
    null,
    { session }
  );
  if (!redeemTx) return null; // nothing redeemed, or already reversed

  await restoreLotsFIFO(redeemTx.consumedLots || [], session);

  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { 'membership.points': redeemTx.points } },
    { new: true, session }
  );

  await MembershipPointsTransaction.create([{
    user: userId,
    order: orderId,
    type: 'reversal',
    points: redeemTx.points,
    balanceAfter: updated?.membership?.points ?? null,
    description: 'Redeemed points returned',
    relatedTransaction: redeemTx._id,
  }], { session });

  await MembershipPointsTransaction.updateOne(
    { _id: redeemTx._id },
    { $set: { reversedAt: new Date() } },
    { session }
  );

  return redeemTx;
}

// ─── Reverse a reservation — cancelled/expired/refunded order ─────────────────
// Idempotent: safe to call more than once for the same order (checks
// pointsRedeemedReversed on the order first — a fast path that avoids the
// ledger lookup; _reverseRedeemByOrderId's own reversedAt check is the
// true source of idempotency either way).
async function reverseRedemption(order, session = null) {
  if (!order.pointsRedeemed || order.pointsRedeemed <= 0) return;
  if (order.pointsRedeemedReversed) return; // already reversed — no-op

  const reversedTx = await _reverseRedeemByOrderId(order.user, order._id, session);
  if (!reversedTx) return;

  // Persisted directly (not left to the caller's own order.save(), whose
  // timing relative to this call varies by caller) — plus kept in sync on
  // the in-memory object so a caller that reads it back afterward sees the
  // correct value either way.
  await Order.updateOne({ _id: order._id }, { $set: { pointsRedeemedReversed: true } }, { session });
  order.pointsRedeemedReversed = true;
}

// ─── Release a reservation when order creation itself failed ──────────────────
// A points reservation happens BEFORE the Order document is built (see
// order.service.js#_buildAndSaveOrder) so an insufficient-balance error can
// abort order creation entirely. If Order.create() subsequently throws for
// an unrelated reason (validation error, etc.) — most relevant on the
// standalone-MongoDB fallback path, which has no surrounding transaction to
// roll the reservation back automatically — this releases it explicitly.
// Safe to call even if no reservation was ever made (no-op).
async function releaseReservation(userId, orderId, session = null) {
  await _reverseRedeemByOrderId(userId, orderId, session);
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

    // This transaction IS the new lot — remainingPoints starts full.
    await MembershipPointsTransaction.create({
      user: order.user,
      order: order._id,
      type: 'earn',
      points: order.pointsEarned,
      remainingPoints: order.pointsEarned,
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

  // The lot itself is fully invalidated — the sale it represents no longer
  // exists, so nothing may be redeemed from it going forward, regardless of
  // how much was already spent vs still sitting unspent in the lot.
  if (original) {
    await MembershipPointsTransaction.updateOne({ _id: original._id }, { $set: { remainingPoints: 0 } });
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

// ─── Points expiry reconciliation — real FIFO, lot-precise ─────────────────────
// No cron is added in this phase (see final report) — this is called
// lazily/on-demand (e.g. from a future points-summary read path or a manual
// script) and is fully idempotent: each 'earn' row is marked
// expiredProcessed once handled and never reprocessed.
//
// Each due lot expires EXACTLY its own remainingPoints — not an aggregate-
// balance-capped approximation. remainingPoints already correctly reflects
// everything that's happened to that specific lot (redemptions that
// consumed from it, refund-driven invalidation), so this is precise real
// FIFO accounting, not an estimate.
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
  for (const lot of due) {
    const expireAmount = lot.remainingPoints || 0;
    if (expireAmount > 0) {
      // Defensive clamp — the aggregate balance should always be >= this
      // lot's remainingPoints, but never let it go negative regardless.
      const updated = await User.findOneAndUpdate(
        { _id: userId },
        [{ $set: { 'membership.points': { $max: [0, { $subtract: ['$membership.points', expireAmount] }] } } }],
      );
      await MembershipPointsTransaction.create({
        user: userId,
        type: 'expiry',
        points: expireAmount,
        balanceAfter: updated ? Math.max(0, updated.membership.points - expireAmount) : null,
        description: `${POINTS_EXPIRY_MONTHS}-month points expiry`,
        relatedTransaction: lot._id,
      });
      totalExpired += expireAmount;
    }
    await MembershipPointsTransaction.updateOne(
      { _id: lot._id },
      { $set: { remainingPoints: 0, expiredProcessed: true } }
    );
  }

  return { expired: totalExpired, batchesProcessed: due.length };
}

module.exports = {
  computeOrderPointsPlan,
  consumeLotsFIFO,
  restoreLotsFIFO,
  reservePoints,
  reverseRedemption,
  releaseReservation,
  realizeEarnedPoints,
  reverseEarnedPoints,
  expireDuePoints,
};
