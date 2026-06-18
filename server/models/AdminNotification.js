'use strict';

const mongoose = require('mongoose');

const ADMIN_NOTIF_TYPES = ['order', 'payment', 'inventory', 'alert', 'analytics', 'system'];
const SEVERITIES        = ['info', 'warning', 'critical'];
const RECIPIENT_ROLES   = ['all', 'admin', 'superadmin', 'warehouse'];

const adminNotificationSchema = new mongoose.Schema(
  {
    type:          { type: String, enum: ADMIN_NOTIF_TYPES, required: true },
    severity:      { type: String, enum: SEVERITIES, default: 'info' },
    title:         { type: String, required: true, trim: true },
    message:       { type: String, required: true, trim: true },
    recipientRole: { type: String, enum: RECIPIENT_ROLES, default: 'all' },
    entityType:    { type: String, default: null },
    entityId:      { type: mongoose.Schema.Types.ObjectId, default: null },
    // Sparse array of user IDs who have read this notification.
    // $addToSet ensures no duplicate entries.
    readBy:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    metadata:      { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Primary access pattern: list by role, newest first
adminNotificationSchema.index({ recipientRole: 1, createdAt: -1 });
// Unread count queries: find docs where userId not in readBy
adminNotificationSchema.index({ readBy: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
module.exports.ADMIN_NOTIF_TYPES = ADMIN_NOTIF_TYPES;
module.exports.SEVERITIES        = SEVERITIES;
