'use strict';

const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['low_stock', 'refund_spike', 'ranking_drop', 'system'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'warning',
    },
    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // Optional reference to the affected entity (product, order, etc.)
    entityType: { type: String, enum: ['product', 'order', null], default: null },
    entityId:   { type: mongoose.Schema.Types.ObjectId, default: null },

    // Dedup key — prevents creating a duplicate active alert for the same condition.
    // e.g. "low_stock:<productId>" or "refund_spike:2024-01-15"
    dedupKey: { type: String, required: true },

    isResolved:  { type: Boolean, default: false },
    resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

alertSchema.index({ isResolved: 1, createdAt: -1 });
alertSchema.index({ dedupKey: 1, isResolved: 1 });
alertSchema.index({ type: 1, isResolved: 1 });

module.exports = mongoose.model('Alert', alertSchema);
