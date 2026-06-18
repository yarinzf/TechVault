'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        'order.status_changed',
        'order.cancelled',
        'user.role_changed',
        'user.deactivated',
        'user.activated',
        'product.created',
        'product.updated',
        'product.deleted',
        'coupon.created',
        'coupon.updated',
        'coupon.deactivated',
        'campaign.created',
        'campaign.updated',
        'campaign.deleted',
        'alert.resolved',
        'inventory.scan',
        'payment.refunded',
        'payment.status_changed',
        'review.deleted',
        'review.moderated',
        'admin.login',
        'inventory.restock',
        'inventory.adjusted',
        'inventory.damaged',
        'return.requested',
        'return.approved',
        'return.rejected',
        'return.received',
        'return.refunded',
        'supplier.created',
        'supplier.updated',
        'supplier.deleted',
        'purchase_order.created',
        'purchase_order.updated',
        'purchase_order.received',
        'purchase_order.cancelled',
        // ── Auth / session events ─────────────────────────────────────────
        'auth.login',           // successful login (all roles)
        'auth.login_failed',    // failed attempt (with user context)
        'auth.logout',          // explicit logout
        'auth.logout_all',      // logout from all devices (self or admin-forced)
        'auth.session_revoked', // single session revoked
        'auth.password_changed',// password change
      ],
      required: true,
    },

    // What entity was affected
    entity:   { type: String, required: true },  // 'Order', 'User', 'Product', …
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Who performed the action
    actorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },

    // Before / after snapshots (plain objects — not subdocuments)
    before:   { type: mongoose.Schema.Types.Mixed, default: null },
    after:    { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },

    // Request context
    ip:        { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // logs are immutable
  }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
