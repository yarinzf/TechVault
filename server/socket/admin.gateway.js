'use strict';

const { socketAuth } = require('./auth.middleware');
const logger         = require('../config/logger');

/**
 * Admin Socket.IO namespace — /admin
 *
 * All authenticated staff (admin, superadmin, warehouse) connect here.
 * After authentication, every socket is placed in ADMIN_ROOM so admin-wide
 * broadcasts reach all connected dashboards simultaneously.
 *
 * Room strategy:
 *   ADMIN_ROOM ('admin:dashboard') — general broadcast for all admin events
 *   Per-role rooms could be added here later (e.g. 'admin:warehouse') if
 *   warehouse-only events need to be filtered on the server side.
 */
const ADMIN_ROOM = 'admin:dashboard';

const setupAdminNamespace = (io) => {
  const admin = io.of('/admin');

  // Every socket in this namespace must pass auth before connecting
  admin.use(socketAuth);

  admin.on('connection', (socket) => {
    const { _id, email, role } = socket.user;
    logger.info(`[socket] admin connected: ${email} (${role}) — socket ${socket.id}`);

    // Join the shared admin broadcast room
    socket.join(ADMIN_ROOM);

    // Confirm connection to the client with context
    socket.emit('connected', {
      userId: _id,
      role,
      room:   ADMIN_ROOM,
      ts:     new Date().toISOString(),
    });

    // Health-check ping — client can call this to verify the connection is alive
    socket.on('ping:admin', (ack) => {
      if (typeof ack === 'function') {
        ack({ pong: true, ts: new Date().toISOString() });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`[socket] admin disconnected: ${email} — ${reason} (socket ${socket.id})`);
    });

    socket.on('error', (err) => {
      logger.warn(`[socket] admin socket error: ${email} — ${err.message}`);
    });
  });

  return admin;
};

module.exports = { setupAdminNamespace, ADMIN_ROOM };
