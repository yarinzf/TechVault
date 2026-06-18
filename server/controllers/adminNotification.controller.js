'use strict';

const { sendSuccess } = require('../utils/response');
const svc = require('../services/adminNotification.service');

const list = async (req, res, next) => {
  try {
    const result = await svc.listForAdmin(req.user._id, req.user.role, req.query);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    const notif = await svc.markRead(req.params.id, req.user._id);
    sendSuccess(res, { notification: notif });
  } catch (err) { next(err); }
};

const markAllRead = async (req, res, next) => {
  try {
    await svc.markAllRead(req.user._id, req.user.role);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (err) { next(err); }
};

module.exports = { list, markRead, markAllRead };
