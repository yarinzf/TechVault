'use strict';

const notificationService = require('../services/notification.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const listNotifications = async (req, res, next) => {
  try {
    const { notifications, meta } = await notificationService.listNotifications(req.user._id, req.query);
    sendSuccess(res, { notifications }, 'Notifications retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markRead(req.params.id, req.user._id);
    sendSuccess(res, { notification }, 'Marked as read');
  } catch (err) { next(err); }
};

const markAllRead = async (req, res, next) => {
  try {
    await notificationService.markAllRead(req.user._id);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (err) { next(err); }
};

const deleteNotification = async (req, res, next) => {
  try {
    await notificationService.deleteNotification(req.params.id, req.user._id);
    sendSuccess(res, null, 'Notification deleted');
  } catch (err) { next(err); }
};

module.exports = { listNotifications, markRead, markAllRead, deleteNotification };
