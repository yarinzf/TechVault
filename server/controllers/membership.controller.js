'use strict';

const membershipService = require('../services/membership.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

// ── POST /api/v1/membership/checkout ──────────────────────────────────────────
// Creates (or recovers) a pending membership purchase order. Price is always
// the server's canonical constant — the request body is never read for it.
const checkout = async (req, res, next) => {
  try {
    const order = await membershipService.createMembershipOrder(req.user._id);
    sendSuccess(res, { order }, 'Membership order created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/membership/notification-preference ─────────────────────────
const updateNotificationPreference = async (req, res, next) => {
  try {
    const user = await membershipService.updateNotificationPreference(
      req.user._id,
      req.body.notificationPreference
    );
    sendSuccess(res, { user }, 'Notification preference updated');
  } catch (err) { next(err); }
};

module.exports = { checkout, updateNotificationPreference };
