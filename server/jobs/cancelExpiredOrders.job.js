'use strict';

const mongoose = require('mongoose');
const Order    = require('../models/Order');
const Product  = require('../models/Product');
const logger   = require('../config/logger');

// ── CAS filter — applied identically at read time and at atomic update time ───
// Using the same filter in both places ensures we never process an order that
// was paid or cancelled between our initial find() and the update.
const pendingFilter = (id, now) => ({
  _id:           id,
  status:        'pending_payment', // guard: must still be awaiting payment
  paymentStatus: 'unpaid',          // guard: must not have been paid concurrently
  expiresAt:     { $lt: now, $ne: null },
});

// ── Attempt cancel + stock restore inside a Mongo transaction ─────────────────
// Returns true if this runner won the CAS (order was actually cancelled).
// Returns false if another runner (payment confirm or prior job run) got there first.
const cancelWithSession = async (candidate, now) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Atomic compare-and-swap: only succeeds if the order is still in the
    // exact state we expect. Returns null when another caller already won.
    const won = await Order.findOneAndUpdate(
      pendingFilter(candidate._id, now),
      { $set: { status: 'cancelled' } },
      { new: false, session }, // new:false → get original doc; null = CAS lost
    );

    if (!won) {
      await session.abortTransaction();
      return false; // skipped — payment confirmed or already cancelled
    }

    // Stock restore within the same transaction: atomically undo the
    // decrement that happened at order creation. salesCount also rolls back.
    for (const item of candidate.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity, salesCount: -item.quantity } },
        { session },
      );
    }

    await session.commitTransaction();
    return true;
  } catch (err) {
    try { await session.abortTransaction(); } catch (_) { /* ignore abort error */ }
    throw err;
  } finally {
    session.endSession();
  }
};

// ── Fallback for standalone MongoDB (no replica set) — used in local dev ──────
// Uses the same CAS guard but without a session. Stock restore is best-effort
// (each update is atomic individually; the sequence is not). Acceptable in dev.
const cancelWithoutSession = async (candidate, now) => {
  const won = await Order.findOneAndUpdate(
    pendingFilter(candidate._id, now),
    { $set: { status: 'cancelled' } },
    { new: false },
  );

  if (!won) return false;

  for (const item of candidate.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity, salesCount: -item.quantity },
    }).catch(err =>
      logger.warn('expiry_stock_restore_partial_failure', {
        orderId:   candidate._id,
        productId: item.product,
        error:     err.message,
      }),
    );
  }

  return true;
};

// ── Job entry point ───────────────────────────────────────────────────────────
module.exports = async () => {
  const now   = new Date();
  const stats = { found: 0, cancelled: 0, skipped: 0, errors: 0 };

  // Read candidates (projection only — no mutation at this stage).
  const candidates = await Order.find({
    status:        'pending_payment',
    paymentStatus: 'unpaid',
    expiresAt:     { $lt: now, $ne: null },
  }).select('_id items orderNumber');

  stats.found = candidates.length;
  if (stats.found === 0) return stats;

  logger.info('cancel_expired_orders_start', { count: stats.found });

  for (const candidate of candidates) {
    try {
      const won = await cancelWithSession(candidate, now);
      if (won) {
        stats.cancelled++;
        logger.info('order_expired_cancelled', {
          orderId:     candidate._id,
          orderNumber: candidate.orderNumber,
        });
      } else {
        stats.skipped++;
      }
    } catch (err) {
      const isNoReplicaSet =
        err.code === 20 ||
        (typeof err.message === 'string' && err.message.includes('Transaction numbers'));

      if (isNoReplicaSet) {
        // Local dev: retry without transaction
        try {
          const won = await cancelWithoutSession(candidate, now);
          won ? stats.cancelled++ : stats.skipped++;
        } catch (fallbackErr) {
          stats.errors++;
          logger.error('order_expiry_fallback_failed', {
            orderId: candidate._id,
            error:   fallbackErr.message,
          });
        }
      } else {
        // Genuine error (network, constraint, etc.) — log and move on.
        // The order stays in pending_payment and will be retried next run.
        stats.errors++;
        logger.error('order_expiry_cancel_failed', {
          orderId: candidate._id,
          error:   err.message,
        });
      }
    }
  }

  logger.info('cancel_expired_orders_done', stats);
  return stats;
};
