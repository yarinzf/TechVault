'use strict';

/**
 * Domain-event → AdminNotification bridge.
 * Each domain event emitted by services is caught here and persisted as an
 * AdminNotification so admins can review them in the notification center.
 *
 * Call registerNotificationHandlers() ONCE from server.js after registerBridge().
 */

const emitter = require('./emitter');
const EVENTS  = require('./events');
const { createForAdmins } = require('../services/adminNotification.service');
const logger  = require('../config/logger');

const usd = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let _registered = false;

const registerNotificationHandlers = () => {
  if (_registered) return;
  _registered = true;

  // ── Order lifecycle ─────────────────────────────────────────────────────────
  emitter.on(EVENTS.ORDER_CREATED, (data) => {
    createForAdmins({
      type:       'order',
      severity:   'info',
      title:      'הזמנה חדשה התקבלה',
      message:    `הזמנה ${data.orderNumber} על סך $${usd(data.total)} התקבלה`,
      entityType: 'Order',
      entityId:   data.orderId,
      metadata:   { orderNumber: data.orderNumber, total: data.total, itemCount: data.itemCount },
    });
  });

  emitter.on(EVENTS.ORDER_STATUS_CHANGED, (data) => {
    createForAdmins({
      type:       'order',
      severity:   'info',
      title:      'סטטוס הזמנה עודכן',
      message:    `הזמנה ${data.orderNumber}: ${data.fromStatus} → ${data.toStatus}`,
      entityType: 'Order',
      entityId:   data.orderId,
      metadata:   { orderNumber: data.orderNumber, fromStatus: data.fromStatus, toStatus: data.toStatus },
    });
  });

  emitter.on(EVENTS.ORDER_CANCELLED, (data) => {
    createForAdmins({
      type:       'order',
      severity:   'warning',
      title:      'הזמנה בוטלה',
      message:    `הזמנה ${data.orderNumber} בוטלה (הייתה: ${data.prevStatus})`,
      entityType: 'Order',
      entityId:   data.orderId,
      metadata:   { orderNumber: data.orderNumber, prevStatus: data.prevStatus },
    });
  });

  // ── Payment / refund ────────────────────────────────────────────────────────
  emitter.on(EVENTS.PAYMENT_PAID, (data) => {
    createForAdmins({
      type:       'payment',
      severity:   'info',
      title:      'תשלום התקבל',
      message:    `תשלום $${usd(data.total)} עבור הזמנה ${data.orderNumber}`,
      entityType: 'Order',
      entityId:   data.orderId,
      metadata:   { orderNumber: data.orderNumber, total: data.total, transactionId: data.transactionId },
    });
  });

  emitter.on(EVENTS.PAYMENT_REFUNDED, (data) => {
    createForAdmins({
      type:       'payment',
      severity:   'warning',
      title:      'החזר כספי בוצע',
      message:    `החזר $${usd(data.amount ?? data.total)} עבור הזמנה ${data.orderNumber}`,
      entityType: 'Order',
      entityId:   data.orderId,
      metadata:   data,
    });
  });

  // ── Inventory ───────────────────────────────────────────────────────────────
  emitter.on(EVENTS.INVENTORY_LOW_STOCK, (data) => {
    const empty = data.stock === 0;
    createForAdmins({
      type:       'inventory',
      severity:   empty ? 'critical' : 'warning',
      title:      empty ? 'מלאי אזל' : 'מלאי נמוך',
      message:    `${data.productName}: ${data.stock} יח׳ נותרו`,
      entityType: 'Product',
      entityId:   data.productId,
      metadata:   data,
    });
  });

  // ── System alerts ───────────────────────────────────────────────────────────
  emitter.on(EVENTS.ALERT_CREATED, (data) => {
    createForAdmins({
      type:       'alert',
      severity:   data.severity ?? 'warning',
      title:      data.title ?? 'התראת מערכת',
      message:    data.message ?? '',
      entityType: data.entityType ?? null,
      entityId:   data.entityId  ?? null,
      metadata:   data,
    });
  });

  // ── Reviews ──────────────────────────────────────────────────────────────────
  emitter.on(EVENTS.REVIEW_CREATED, (data) => {
    createForAdmins({
      type:          'system',
      severity:      'info',
      title:         'ביקורת חדשה התקבלה',
      message:       `ביקורת ${data.rating}★ עבור "${data.productName}"${data.isVerifiedPurchase ? ' (רכישה מאומתת)' : ''}`,
      entityType:    'Product',
      entityId:      data.productId,
      recipientRole: 'admin',
      metadata:      data,
    });
  });

  // ── Analytics anomalies ─────────────────────────────────────────────────────
  emitter.on(EVENTS.ANOMALY_DETECTED, (data) => {
    createForAdmins({
      type:          'analytics',
      severity:      'warning',
      title:         'חריגה אנליטית זוהתה',
      message:       data.message ?? `חריגה בנתוני ${data.metric ?? 'מדד'}`,
      recipientRole: 'admin',
      metadata:      data,
    });
  });

  logger.info('[notificationHandlers] registered — domain events → AdminNotification');
};

module.exports = { registerNotificationHandlers };
