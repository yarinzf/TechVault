'use strict';

const { Server }            = require('socket.io');
const { setupAdminNamespace } = require('./admin.gateway');
const logger                = require('../config/logger');
const env                   = require('../config/env');

/**
 * Socket.IO singleton.
 *
 * initSocket(httpServer) — call ONCE from server.js after creating the HTTP server.
 * getIO()               — returns the initialized io instance; throws if not ready.
 *
 * Scaling note:
 *   For horizontal scaling (multiple Node processes), replace the in-memory
 *   adapter with the Redis adapter:
 *
 *     const { createAdapter } = require('@socket.io/redis-adapter');
 *     const { createClient }  = require('redis');
 *     const pub = createClient({ url: env.REDIS_URL });
 *     const sub = pub.duplicate();
 *     await Promise.all([pub.connect(), sub.connect()]);
 *     io.adapter(createAdapter(pub, sub));
 *
 *   Install: npm install @socket.io/redis-adapter redis
 */

let _io = null;

const initSocket = (httpServer) => {
  if (_io) return _io; // idempotent

  _io = new Server(httpServer, {
    cors: {
      origin:      (env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim()),
      credentials: true,
    },
    // Prefer WebSocket; fall back to long-polling if needed (e.g. behind proxies)
    transports: ['websocket', 'polling'],

    // Connection health
    pingInterval: 10_000, // server pings every 10 s
    pingTimeout:  5_000,  // client has 5 s to pong before disconnect

    // Limit handshake size to prevent DoS on the upgrade endpoint
    maxHttpBufferSize: 1e5, // 100 KB
  });

  setupAdminNamespace(_io);

  logger.info('[socket] Socket.IO initialized');
  return _io;
};

const getIO = () => {
  if (!_io) throw new Error('Socket.IO not initialized — call initSocket(server) first');
  return _io;
};

module.exports = { initSocket, getIO };
