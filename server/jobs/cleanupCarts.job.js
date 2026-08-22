'use strict';

const Cart = require('../models/Cart');
const logger = require('../config/logger');
const { incrementDailyCounters } = require('../services/analyticsDaily.service');

const CLEANUP_DAYS = parseInt(process.env.CART_CLEANUP_DAYS || '30', 10);

// How long a cart must sit untouched, still holding items, before it counts
// as a real abandoned-cart event for AnalyticsDaily.abandonedCarts — see
// server/config/analytics.js and requirement #12 in the analytics redesign
// ("define precisely when a cart is considered abandoned").
const ABANDONMENT_HOURS = parseInt(process.env.CART_ABANDONMENT_HOURS || '24', 10);

/**
 * Runs daily. Two independent responsibilities:
 *  1. Detect carts that have just crossed the abandonment threshold and
 *     record them into AnalyticsDaily exactly once per abandonment episode
 *     (guarded by Cart.lastAbandonedCheckAt) — the real, event-driven source
 *     behind the abandoned-cart-rate KPI (replaces the old hardcoded "72%").
 *  2. Clear items from carts inactive for CART_CLEANUP_DAYS days, same as
 *     before this redesign — the Cart document itself is always preserved,
 *     only its items array is emptied.
 */
module.exports = async function cleanupCarts() {
  const abandonmentCutoff = new Date(Date.now() - ABANDONMENT_HOURS * 60 * 60 * 1_000);

  const newlyAbandoned = await Cart.find({
    updatedAt: { $lt: abandonmentCutoff },
    lastAbandonedCheckAt: null,
    'items.0': { $exists: true },
  }).select('items').lean();

  if (newlyAbandoned.length > 0) {
    const totalValue = newlyAbandoned.reduce(
      (sum, cart) => sum + cart.items.reduce((s, it) => s + it.priceAtAdd * it.quantity, 0),
      0
    );
    await Cart.updateMany(
      { _id: { $in: newlyAbandoned.map((c) => c._id) } },
      { $set: { lastAbandonedCheckAt: new Date() } }
    );
    await incrementDailyCounters({
      abandonedCarts: newlyAbandoned.length,
      abandonedCartValue: Math.round(totalValue * 100) / 100,
    });
    logger.info(`[cleanupCarts] Recorded ${newlyAbandoned.length} newly-abandoned cart(s) (inactive >${ABANDONMENT_HOURS}h)`);
  }

  const cutoff = new Date(Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1_000);
  const result = await Cart.updateMany(
    { updatedAt: { $lt: cutoff }, 'items.0': { $exists: true } },
    { $set: { items: [], lastAbandonedCheckAt: null } }
  );
  logger.info(`[cleanupCarts] Cleared ${result.modifiedCount} stale cart(s) (inactive >${CLEANUP_DAYS}d)`);
};
