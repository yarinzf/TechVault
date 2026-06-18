'use strict';

const scheduler = require('./scheduler');

// ── Job implementations ───────────────────────────────────────────────────────
const cleanupCarts        = require('./cleanupCarts.job');
const processAlerts       = require('./processAlerts.job');
const cleanupSessions     = require('./cleanupSessions.job');
const deactivateCoupons   = require('./deactivateCoupons.job');
const deactivateCampaigns = require('./deactivateCampaigns.job');
const cleanupNotifications = require('./cleanupNotifications.job');
const cleanupAuditLogs      = require('./cleanupAuditLogs.job');
const dailySnapshot         = require('./dailySnapshot.job');
const cancelExpiredOrders   = require('./cancelExpiredOrders.job');

// ── Cron expressions — override via env if needed ─────────────────────────────
// Interval env vars accept any valid cron expression string.
const c = (envKey, fallback) => process.env[envKey] || fallback;

// ── Register all jobs ─────────────────────────────────────────────────────────
scheduler.define('cleanup-carts', {
  fn:          cleanupCarts,
  cronExpr:    c('JOB_CRON_CLEANUP_CARTS', '0 2 * * *'),       // daily 02:00
  description: 'Clear items from stale carts',
});

scheduler.define('process-alerts', {
  fn:          processAlerts,
  cronExpr:    c('JOB_CRON_PROCESS_ALERTS', '0 * * * *'),      // hourly
  description: 'Low-stock / refund-spike / ranking-drop detection',
});

scheduler.define('cleanup-sessions', {
  fn:          cleanupSessions,
  cronExpr:    c('JOB_CRON_CLEANUP_SESSIONS', '0 4 * * *'),    // daily 04:00
  description: 'Expire and purge old session records',
});

scheduler.define('deactivate-coupons', {
  fn:          deactivateCoupons,
  cronExpr:    c('JOB_CRON_DEACTIVATE_COUPONS', '*/15 * * * *'), // every 15 min
  description: 'Deactivate expired and exhausted coupons',
});

scheduler.define('deactivate-campaigns', {
  fn:          deactivateCampaigns,
  cronExpr:    c('JOB_CRON_DEACTIVATE_CAMPAIGNS', '*/15 * * * *'), // every 15 min
  description: 'Deactivate expired campaigns',
});

scheduler.define('cleanup-notifications', {
  fn:          cleanupNotifications,
  cronExpr:    c('JOB_CRON_CLEANUP_NOTIFICATIONS', '0 3 * * *'), // daily 03:00
  description: 'Remove old user and admin notifications',
});

scheduler.define('cleanup-audit-logs', {
  fn:          cleanupAuditLogs,
  cronExpr:    c('JOB_CRON_CLEANUP_AUDIT_LOGS', '0 5 * * 0'), // weekly Sunday 05:00
  description: 'Purge audit log entries past retention window',
});

scheduler.define('daily-snapshot', {
  fn:          dailySnapshot,
  cronExpr:    c('JOB_CRON_DAILY_SNAPSHOT', '0 1 * * *'),     // daily 01:00
  description: 'Log previous-day analytics summary',
});

scheduler.define('cancel-expired-orders', {
  fn:          cancelExpiredOrders,
  cronExpr:    c('JOB_CRON_CANCEL_EXPIRED_ORDERS', '*/2 * * * *'), // every 2 min
  description: 'Cancel pending_payment orders past their expiresAt deadline',
});

// ── Public API ────────────────────────────────────────────────────────────────
const startJobs = () => scheduler.start();

module.exports = { startJobs, scheduler };
