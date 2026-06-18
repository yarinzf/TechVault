'use strict';

const AuditLog = require('../models/AuditLog');
const logger   = require('../config/logger');

const RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);

/**
 * Hard-delete audit log entries older than AUDIT_LOG_RETENTION_DAYS.
 * Audit logs are immutable write-once records — deletion is the only way to trim them.
 * Default: 90 days (meets most compliance requirements for this data class).
 */
module.exports = async function cleanupAuditLogs() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });

  if (result.deletedCount > 0) {
    logger.info(`[cleanupAuditLogs] Deleted ${result.deletedCount} audit log(s) older than ${RETENTION_DAYS}d`);
  }
};
