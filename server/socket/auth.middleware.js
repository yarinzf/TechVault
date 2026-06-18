'use strict';

const { verifyToken } = require('../utils/jwt');
const User            = require('../models/User');
const { STAFF_ROLES } = require('../config/roles');
const env             = require('../config/env');

/**
 * Socket.IO handshake authentication middleware.
 *
 * Clients must supply a valid access token via:
 *   socket = io('/admin', { auth: { token: '<JWT>' } })
 *
 * On success: attaches socket.user and proceeds.
 * On failure: calls next(Error) — Socket.IO rejects the connection.
 */
const socketAuth = async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(Object.assign(new Error('Authentication required'), { code: 'NO_TOKEN' }));
  }

  try {
    const decoded = verifyToken(token, env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.id).select('name email role isActive');

    if (!user) {
      return next(Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND' }));
    }
    if (!user.isActive) {
      return next(Object.assign(new Error('Account deactivated'), { code: 'ACCOUNT_DEACTIVATED' }));
    }
    if (!STAFF_ROLES.includes(user.role)) {
      return next(Object.assign(new Error('Admin access required'), { code: 'FORBIDDEN' }));
    }

    socket.user = user;
    next();
  } catch (err) {
    // JWT verification failures (expired, invalid signature, etc.)
    next(Object.assign(new Error('Invalid or expired token'), { code: 'INVALID_TOKEN' }));
  }
};

module.exports = { socketAuth };
