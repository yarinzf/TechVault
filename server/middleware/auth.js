'use strict';

const { verifyToken } = require('../utils/jwt');
const { AppError } = require('./errorHandler');
const { StatusCodes } = require('http-status-codes');
const User = require('../models/User');

/**
 * Verify the Bearer access token and attach req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('No token provided', StatusCodes.UNAUTHORIZED, 'NO_TOKEN');
    }

    const token = header.split(' ')[1];
    const decoded = verifyToken(token, process.env.JWT_ACCESS_SECRET);

    const user = await User.findById(decoded.id).select('-password -refreshToken -loginAttempts -lockUntil');
    if (!user) throw new AppError('User not found', StatusCodes.UNAUTHORIZED, 'USER_NOT_FOUND');
    if (!user.isActive) throw new AppError('Account deactivated', StatusCodes.FORBIDDEN, 'ACCOUNT_DEACTIVATED');

    req.user = user;
    // sid is the Session._id embedded in the access token — used to identify
    // the current session without reading the HttpOnly refresh-token cookie.
    req.sessionId = decoded.sid ?? null;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role-based access control gate.
 * @param {...string} roles
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('Insufficient permissions', StatusCodes.FORBIDDEN, 'FORBIDDEN'));
  }
  next();
};

/**
 * Like authenticate but non-blocking — attaches req.user if a valid token is
 * present, otherwise leaves req.user undefined and calls next() normally.
 * Used on public endpoints that have optional per-user behaviour (e.g. reviews
 * list shows the viewer's own hidden review).
 */
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return next();

    const token   = header.split(' ')[1];
    const decoded = verifyToken(token, process.env.JWT_ACCESS_SECRET);
    const user    = await User.findById(decoded.id).select('-password -refreshToken -loginAttempts -lockUntil');
    if (user?.isActive) req.user = user;
  } catch (_) {
    // Invalid / expired token — treat as unauthenticated, do not block
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };
