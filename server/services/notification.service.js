'use strict';

const Notification = require('../models/Notification');
const { AppError }  = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const logger        = require('../config/logger');
const { paginate, paginateMeta } = require('../utils/paginate');

/**
 * Create a notification for a user.
 * Called internally by other services (order, admin, etc.) — not directly by controllers.
 */
const notify = async (userId, type, title, message, metadata = {}) => {
  try {
    await Notification.create({ user: userId, type, title, message, metadata });
  } catch (err) {
    // Notification failure is non-fatal — warn so it shows in ops logs without breaking the request
    logger.warn('notification_create_failed', { userId, type, message: err.message });
  }
};

const listNotifications = async (userId, query) => {
  const { page, limit, skip } = paginate(query);
  const filter = { user: userId };
  if (query.unreadOnly === 'true') filter.isRead = false;

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);

  return { notifications, meta: paginateMeta(total, page, limit) };
};

const markRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true },
    { new: true }
  );
  if (!notification) throw new AppError('Notification not found', StatusCodes.NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
  return notification;
};

const markAllRead = async (userId) => {
  await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
};

const deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findOneAndDelete({ _id: notificationId, user: userId });
  if (!notification) throw new AppError('Notification not found', StatusCodes.NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
};

module.exports = { notify, listNotifications, markRead, markAllRead, deleteNotification };
