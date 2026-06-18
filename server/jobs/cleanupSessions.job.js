'use strict';

const Session = require('../models/Session');
const logger  = require('../config/logger');

// Days to keep revoked/expired session records before hard-deleting them.
// Keeping them briefly is useful for audit traces (token reuse detection).
const RETENTION_DAYS = parseInt(process.env.SESSION_CLEANUP_RETENTION_DAYS || '7', 10);

/**
 * Two-phase session cleanup:
 *   1. Soft-expire: mark still-active sessions that have passed expiresAt as revoked.
 *   2. Hard-delete: remove sessions that have been inactive for > RETENTION_DAYS.
 */
module.exports = async function cleanupSessions() {
  const now    = new Date();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);

  // Phase 1: sessions that should have expired but were never explicitly revoked
  const softExpired = await Session.updateMany(
    { isActive: true, expiresAt: { $lt: now } },
    { $set: { isActive: false, revokedAt: now, revokedReason: 'expired' } }
  );

  // Phase 2: hard-delete sessions that have been inactive long enough
  const hardDeleted = await Session.deleteMany({
    isActive: false,
    $or: [
      { revokedAt:  { $lt: cutoff } },
      { expiresAt:  { $lt: cutoff } },
    ],
  });

  logger.info(
    `[cleanupSessions] Soft-expired: ${softExpired.modifiedCount}, ` +
    `hard-deleted: ${hardDeleted.deletedCount} (retention: ${RETENTION_DAYS}d)`
  );
};
