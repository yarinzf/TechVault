'use strict';

const mongoose = require('mongoose');

const NOTIFICATION_TYPES = ['order_confirmed', 'order_shipped', 'order_delivered', 'promotion', 'system', 'return'];

const notificationSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type:    { type: String, enum: NOTIFICATION_TYPES, required: true },
    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead:  { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // notifications are immutable once created
  }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
