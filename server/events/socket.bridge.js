'use strict';

/**
 * Socket bridge — the ONLY module that couples the internal EventEmitter to Socket.IO.
 *
 * Call registerBridge() ONCE from server.js after initSocket() returns.
 * After that, services emit domain events on the shared emitter, and this
 * module forwards them to the admin Socket.IO room automatically.
 *
 * Separation contract:
 *   Services  →  emitter.emit(EVENTS.X, payload)
 *   Bridge    →  io.of('/admin').to(ADMIN_ROOM).emit(event, enrichedPayload)
 *   Clients   ←  socket.on(event, handler)
 */

const emitter = require('./emitter');
const EVENTS  = require('./events');
const { getIO } = require('../socket');
const logger  = require('../config/logger');

const ADMIN_ROOM = 'admin:dashboard';

// ─── Emit helper ──────────────────────────────────────────────────────────────
// Wraps every payload with a timestamp and the event name, then sends to the
// admin room.  Errors here are always non-fatal — socket loss must never crash
// the request that triggered the domain event.
const emitToAdmins = (event, data) => {
  try {
    const io = getIO();
    const payload = { event, ...data, ts: new Date().toISOString() };
    io.of('/admin').to(ADMIN_ROOM).emit(event, payload);
    logger.debug(`[socket.bridge] → ${event}`, { payload });
  } catch (err) {
    // getIO() throws if socket is not yet initialized (e.g. during tests)
    logger.debug(`[socket.bridge] skipped ${event} — socket unavailable: ${err.message}`);
  }
};

// ─── Bridge registration ──────────────────────────────────────────────────────
// Each emitter.on() call here is the single canonical mapping of
// domain event → socket room broadcast.

let _registered = false;

const registerBridge = () => {
  if (_registered) return; // idempotent — safe to call multiple times
  _registered = true;

  // ── Order lifecycle ─────────────────────────────────────────────────────────
  emitter.on(EVENTS.ORDER_CREATED, (data) =>
    emitToAdmins(EVENTS.ORDER_CREATED, data));

  emitter.on(EVENTS.ORDER_STATUS_CHANGED, (data) =>
    emitToAdmins(EVENTS.ORDER_STATUS_CHANGED, data));

  emitter.on(EVENTS.ORDER_CANCELLED, (data) =>
    emitToAdmins(EVENTS.ORDER_CANCELLED, data));

  // ── Payment / refund ────────────────────────────────────────────────────────
  emitter.on(EVENTS.PAYMENT_PAID, (data) =>
    emitToAdmins(EVENTS.PAYMENT_PAID, data));

  emitter.on(EVENTS.PAYMENT_REFUNDED, (data) =>
    emitToAdmins(EVENTS.PAYMENT_REFUNDED, data));

  // ── Inventory ───────────────────────────────────────────────────────────────
  emitter.on(EVENTS.INVENTORY_LOW_STOCK, (data) =>
    emitToAdmins(EVENTS.INVENTORY_LOW_STOCK, data));

  emitter.on(EVENTS.INVENTORY_SCAN_COMPLETE, (data) =>
    emitToAdmins(EVENTS.INVENTORY_SCAN_COMPLETE, data));

  // ── Alerts ──────────────────────────────────────────────────────────────────
  emitter.on(EVENTS.ALERT_CREATED, (data) =>
    emitToAdmins(EVENTS.ALERT_CREATED, data));

  emitter.on(EVENTS.ALERT_RESOLVED, (data) =>
    emitToAdmins(EVENTS.ALERT_RESOLVED, data));

  // ── Anomaly detection ────────────────────────────────────────────────────────
  emitter.on(EVENTS.ANOMALY_DETECTED, (data) =>
    emitToAdmins(EVENTS.ANOMALY_DETECTED, data));

  // ── Admin notification center ─────────────────────────────────────────────
  // Forward persisted AdminNotification objects to admin clients so the bell
  // dropdown can prepend them without a round-trip to the API.
  emitter.on(EVENTS.ADMIN_NOTIFICATION_CREATED, (data) =>
    emitToAdmins(EVENTS.ADMIN_NOTIFICATION_CREATED, data));

  logger.info('[socket.bridge] registered — domain events wired to admin room');
};

module.exports = { registerBridge };
