'use strict';

const Notification      = require('../models/Notification');
const AdminNotification = require('../models/AdminNotification');
const logger            = require('../config/logger');

// Read notifications older than this are deleted
const READ_RETENTION_DAYS = parseInt(process.env.NOTIFICATION_READ_RETENTION_DAYS || '60', 10);
// All notifications (read or not) older than this are deleted
const MAX_RETENTION_DAYS  = parseInt(process.env.NOTIFICATION_MAX_RETENTION_DAYS  || '120', 10);
// Admin notifications retention (they accumulate fast from system events)
const ADMIN_RETENTION_DAYS = parseInt(process.env.ADMIN_NOTIFICATION_RETENTION_DAYS || '30', 10);

/**
 * Delete old user notifications and admin notifications.
 * User notifications: read ones after READ_RETENTION, all after MAX_RETENTION.
 * Admin notifications: all after ADMIN_RETENTION.
 */
module.exports = async function cleanupNotifications() {
  const readCutoff  = new Date(Date.now() - READ_RETENTION_DAYS  * 24 * 60 * 60 * 1_000);
  const maxCutoff   = new Date(Date.now() - MAX_RETENTION_DAYS   * 24 * 60 * 60 * 1_000);
  const adminCutoff = new Date(Date.now() - ADMIN_RETENTION_DAYS * 24 * 60 * 60 * 1_000);

  const [readDel, maxDel, adminDel] = await Promise.all([
    Notification.deleteMany({ isRead: true,  createdAt: { $lt: readCutoff } }),
    Notification.deleteMany({ isRead: false, createdAt: { $lt: maxCutoff  } }),
    AdminNotification.deleteMany({ createdAt: { $lt: adminCutoff } }),
  ]);

  const total = readDel.deletedCount + maxDel.deletedCount;
  logger.info(
    `[cleanupNotifications] User: deleted ${total} notification(s) ` +
    `(read >${READ_RETENTION_DAYS}d: ${readDel.deletedCount}, ` +
    `unread >${MAX_RETENTION_DAYS}d: ${maxDel.deletedCount}), ` +
    `Admin: deleted ${adminDel.deletedCount} (>${ADMIN_RETENTION_DAYS}d)`
  );
};
