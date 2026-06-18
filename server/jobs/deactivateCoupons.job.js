'use strict';

const Coupon = require('../models/Coupon');
const logger = require('../config/logger');

/**
 * Deactivate coupons that are no longer valid:
 *   - Past their validUntil date
 *   - Hit their usageLimit
 *
 * Idempotent: only touches coupons that are still isActive=true.
 */
module.exports = async function deactivateCoupons() {
  const now = new Date();

  // Expired by date
  const expiredByDate = await Coupon.updateMany(
    { isActive: true, validUntil: { $ne: null, $lt: now } },
    { $set: { isActive: false } }
  );

  // Exhausted usage limit — use $expr for cross-field comparison
  const exhausted = await Coupon.updateMany(
    {
      isActive:   true,
      usageLimit: { $ne: null },
      $expr:      { $gte: ['$usedCount', '$usageLimit'] },
    },
    { $set: { isActive: false } }
  );

  const total = expiredByDate.modifiedCount + exhausted.modifiedCount;
  if (total > 0) {
    logger.info(
      `[deactivateCoupons] Deactivated ${total} coupon(s) ` +
      `(expired: ${expiredByDate.modifiedCount}, exhausted: ${exhausted.modifiedCount})`
    );
  }
};
