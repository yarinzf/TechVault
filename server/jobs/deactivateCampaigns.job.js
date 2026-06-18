'use strict';

const Campaign = require('../models/Campaign');
const logger   = require('../config/logger');

/**
 * Deactivate campaigns whose endDate has passed.
 * Idempotent: only touches campaigns that are still isActive=true.
 */
module.exports = async function deactivateCampaigns() {
  const now = new Date();

  const expired = await Campaign.updateMany(
    { isActive: true, endDate: { $lt: now } },
    { $set: { isActive: false } }
  );

  if (expired.modifiedCount > 0) {
    logger.info(`[deactivateCampaigns] Deactivated ${expired.modifiedCount} expired campaign(s)`);
  }
};
