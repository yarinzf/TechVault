'use strict';

const { StatusCodes } = require('http-status-codes');
const logger = require('../config/logger');

/**
 * Custom application error — operational errors only.
 * Non-operational errors bubble up to the global handler.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Convert any thrown value into a normalised { statusCode, code, message, details } shape.
 *
 * Handles — in priority order:
 *   Mongoose ValidationError / CastError / duplicate-key (11000)
 *   JWT JsonWebTokenError / TokenExpiredError
 *   Stripe SDK errors (StripeCardError, StripeInvalidRequestError, etc.)
 *   Multer file-upload limit errors
 *   AppError (operational, with a known HTTP status + code)
 *   Anything else → generic 500, message hidden from client
 */
const normalizeError = (err) => {
  // ── Mongoose validation ────────────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    return {
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
      code:       'VALIDATION_ERROR',
      message:    'Validation failed',
      details:    Object.values(err.errors).map(e => ({ field: e.path, message: e.message })),
    };
  }

  // ── Mongoose duplicate key ─────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return {
      statusCode: StatusCodes.CONFLICT,
      code:       'DUPLICATE_KEY',
      message:    `${field} already exists`,
      details:    [],
    };
  }

  // ── Mongoose bad ObjectId ──────────────────────────────────────────────────
  if (err.name === 'CastError') {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      code:       'INVALID_ID',
      message:    'Invalid resource ID',
      details:    [],
    };
  }

  // ── JWT ────────────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    return { statusCode: StatusCodes.UNAUTHORIZED, code: 'INVALID_TOKEN',  message: 'Invalid token',  details: [] };
  }
  if (err.name === 'TokenExpiredError') {
    return { statusCode: StatusCodes.UNAUTHORIZED, code: 'TOKEN_EXPIRED',  message: 'Token expired',  details: [] };
  }

  // ── Stripe SDK errors ──────────────────────────────────────────────────────
  // Stripe throws typed errors (StripeCardError, StripeInvalidRequestError, …).
  // Expose a generic PAYMENT_ERROR code; never forward Stripe's raw message
  // to the client, as it may reference internal identifiers.
  if (err.type && typeof err.type === 'string' && err.type.startsWith('Stripe')) {
    const isClientFault = err.statusCode && err.statusCode < 500;
    return {
      statusCode: isClientFault ? err.statusCode : StatusCodes.BAD_GATEWAY,
      code:       'PAYMENT_ERROR',
      message:    isClientFault ? (err.message || 'Payment processing error') : 'Payment processing error',
      details:    [],
    };
  }

  // ── Multer file-upload limits ──────────────────────────────────────────────
  if (err.code && typeof err.code === 'string' && err.code.startsWith('LIMIT_')) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      code:       'FILE_UPLOAD_ERROR',
      message:    err.message || 'File upload limit exceeded',
      details:    [],
    };
  }

  // ── AppError (any other operational error) ─────────────────────────────────
  if (err.isOperational) {
    return {
      statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
      code:       err.code       || 'INTERNAL_ERROR',
      message:    err.message,
      details:    [],
    };
  }

  // ── Unexpected / programming error ────────────────────────────────────────
  return {
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    code:       'INTERNAL_ERROR',
    message:    'Internal Server Error',
    details:    [],
  };
};

// Errors we expect to see in normal operation — log at warn, not error.
const _isKnown = (err) =>
  err.isOperational ||
  err.name === 'ValidationError' ||
  err.name === 'CastError'       ||
  err.name === 'JsonWebTokenError' ||
  err.name === 'TokenExpiredError' ||
  err.code  === 11000             ||
  (err.type && typeof err.type === 'string' && err.type.startsWith('Stripe')) ||
  (err.code && typeof err.code === 'string' && err.code.startsWith('LIMIT_'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const { statusCode, code, message, details } = normalizeError(err);

  if (_isKnown(err)) {
    // Expected / operational — low-noise warn; no stack trace
    logger.warn('request_error', {
      correlationId: req.correlationId,
      code,
      statusCode,
      method: req.method,
      path:   req.path,
    });
  } else {
    // Programming error or totally unexpected — full details for investigation
    logger.error('unhandled_error', {
      correlationId: req.correlationId,
      message:       err.message,
      stack:         err.stack,
      method:        req.method,
      path:          req.path,
    });
  }

  return res.status(statusCode).json({
    success: false,
    error: { code, message, details },
    correlationId: req.correlationId ?? null,
  });
};

module.exports = { AppError, errorHandler, normalizeError };
