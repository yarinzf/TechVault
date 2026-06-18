'use strict';

/**
 * Canonical event name constants.
 * Used by both the internal EventEmitter and the Socket.IO bridge — keep in sync.
 * Import this everywhere instead of writing string literals.
 */
const EVENTS = Object.freeze({
  // ── Order lifecycle ─────────────────────────────────────────────────────────
  ORDER_CREATED:        'order.created',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_CANCELLED:      'order.cancelled',

  // ── Payment / refund ────────────────────────────────────────────────────────
  PAYMENT_PAID:         'payment.paid',
  PAYMENT_REFUNDED:     'payment.refunded',

  // ── Inventory ───────────────────────────────────────────────────────────────
  INVENTORY_LOW_STOCK:     'inventory.low_stock',
  INVENTORY_SCAN_COMPLETE: 'inventory.scan_complete',
  INVENTORY_STOCK_UPDATED: 'inventory.stock_updated',

  // ── Alerts ──────────────────────────────────────────────────────────────────
  ALERT_CREATED:  'alert.created',
  ALERT_RESOLVED: 'alert.resolved',

  // ── Analytics anomalies ─────────────────────────────────────────────────────
  ANOMALY_DETECTED: 'analytics.anomaly_detected',

  // ── Reviews ─────────────────────────────────────────────────────────────────
  REVIEW_CREATED: 'review.created',

  // ── Returns ─────────────────────────────────────────────────────────────────
  RETURN_REQUESTED:     'return.requested',
  RETURN_STATUS_CHANGED: 'return.status_changed',

  // ── Admin notification center ────────────────────────────────────────────────
  // Emitted when a new AdminNotification is persisted.
  // The socket bridge forwards this as 'notification.created' to admin clients.
  ADMIN_NOTIFICATION_CREATED: 'notification.created',
});

module.exports = EVENTS;
