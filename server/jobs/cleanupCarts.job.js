'use strict';

const Cart = require('../models/Cart');
const logger = require('../config/logger');

const CLEANUP_DAYS = parseInt(process.env.CART_CLEANUP_DAYS || '30', 10);

/**
 * Clear items from carts inactive for CART_CLEANUP_DAYS days.
 * The Cart document is preserved; only the items array is emptied.
 */
module.exports = async function cleanupCarts() {
  const cutoff = new Date(Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1_000);
  const result = await Cart.updateMany(
    { updatedAt: { $lt: cutoff }, 'items.0': { $exists: true } },
    { $set: { items: [] } }
  );
  logger.info(`[cleanupCarts] Cleared ${result.modifiedCount} stale cart(s) (inactive >${CLEANUP_DAYS}d)`);
};
