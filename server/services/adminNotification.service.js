'use strict';

const AdminNotification = require('../models/AdminNotification');
const { paginate, paginateMeta } = require('../utils/paginate');
const emitter = require('../events/emitter');
const EVENTS  = require('../events/events');
const logger  = require('../config/logger');
const { ROLES } = require('../config/roles');

// Which recipientRole values each user role can see
const VISIBLE_ROLES = {
  [ROLES.SUPERADMIN]: ['all', 'admin', 'superadmin', 'warehouse'],
  [ROLES.ADMIN]:      ['all', 'admin'],
  [ROLES.WAREHOUSE]:  ['all', 'warehouse'],
};

const rolesFor = (role) => VISIBLE_ROLES[role] ?? ['all'];

// ── Create one notification (broadcast to a role) ─────────────────────────────
// Non-fatal: swallows errors so a notification failure never breaks the caller.
const createForAdmins = async (data) => {
  try {
    const notif = await AdminNotification.create(data);
    emitter.emit(EVENTS.ADMIN_NOTIFICATION_CREATED, { notification: notif.toObject() });
    return notif;
  } catch (err) {
    logger.warn('[adminNotification] create failed:', err.message);
  }
};

// ── List for a specific admin user (with pagination + optional unreadOnly) ────
const listForAdmin = async (userId, role, query = {}) => {
  const { page, limit, skip } = paginate(query);
  const visibleRoles = rolesFor(role);

  const baseFilter = { recipientRole: { $in: visibleRoles } };
  const listFilter = query.unreadOnly === 'true'
    ? { ...baseFilter, readBy: { $ne: userId } }
    : baseFilter;

  const [notifications, total, unreadCount] = await Promise.all([
    AdminNotification.find(listFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminNotification.countDocuments(listFilter),
    AdminNotification.countDocuments({ ...baseFilter, readBy: { $ne: userId } }),
  ]);

  // Compute per-document isRead for this user
  const enriched = notifications.map((n) => ({
    ...n,
    isRead: n.readBy.some((id) => id.toString() === userId.toString()),
  }));

  return { notifications: enriched, meta: paginateMeta(total, page, limit), unreadCount };
};

// ── Mark single notification as read by this user ─────────────────────────────
const markRead = async (notifId, userId) => {
  const notif = await AdminNotification.findByIdAndUpdate(
    notifId,
    { $addToSet: { readBy: userId } },
    { new: true },
  );
  return notif;
};

// ── Mark all visible notifications as read for this user ──────────────────────
const markAllRead = async (userId, role) => {
  const visibleRoles = rolesFor(role);
  await AdminNotification.updateMany(
    { recipientRole: { $in: visibleRoles }, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } },
  );
};

module.exports = { createForAdmins, listForAdmin, markRead, markAllRead };
