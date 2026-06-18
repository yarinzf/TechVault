'use strict';

const rateLimit = require('express-rate-limit');
const env    = require('../config/env');
const logger = require('../config/logger');

const enabled  = env.RATE_LIMIT_ENABLED !== 'false';
const windowMs = env.RATE_LIMIT_WINDOW_MS;

// Resolve the effective max for a limiter.
// Priority: test → single-value override → env-specific default.
const resolveMax = (override, devDefault, prodDefault) => {
  if (env.NODE_ENV === 'test') return 100_000;
  if (override != null)        return override;
  return env.NODE_ENV === 'development' ? devDefault : prodDefault;
};

// skip for the global limiter: disabled flag + OPTIONS + health checks
const globalSkip = (req) =>
  !enabled ||
  req.method === 'OPTIONS' ||
  req.path.endsWith('/health');

// skip for route-level limiters: disabled flag + OPTIONS preflight only
const routeSkip = (req) =>
  !enabled || req.method === 'OPTIONS';

// Unified 429 handler — logs abuse and returns a clean JSON response.
// category drives log level: auth/password/admin-mutation → error, rest → warn
const makeHandler = (message, category) => (req, res, _next, options) => {
  const retryAfter = Math.ceil(options.windowMs / 1000);

  const payload = {
    category,
    method:        req.method,
    path:          req.path,
    ip:            req.ip,
    correlationId: req.correlationId,
    userId:        req.user?._id,
    retryAfter,
  };

  if (category === 'auth' || category === 'password') {
    logger.error('suspicious_auth_flood', payload);
  } else if (category === 'admin-mutation') {
    logger.error('suspicious_admin_mutation_flood', payload);
  } else {
    logger.warn('rate_limit_exceeded', payload);
  }

  res
    .status(429)
    .set('Retry-After', String(retryAfter))
    .json({
      success: false,
      error: {
        code:       'RATE_LIMIT_EXCEEDED',
        message,
        details:    [],
        retryAfter,
      },
    });
};

const makeLimiter = (max, message, category, skip = routeSkip) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    skip,
    handler:         makeHandler(message, category),
  });

// ── General — applied globally under /api ─────────────────────────────────────
// Skips OPTIONS preflight + health checks; respects RATE_LIMIT_ENABLED.
const generalLimiter = makeLimiter(
  resolveMax(
    env.RATE_LIMIT_MAX,
    env.GENERAL_RATE_LIMIT_MAX_DEV,
    env.GENERAL_RATE_LIMIT_MAX_PROD,
  ),
  'Too many requests, please try again later',
  'general',
  globalSkip,
);

// ── Auth — login / register ───────────────────────────────────────────────────
// Tightest limit; protects against credential stuffing and account enumeration.
const authLimiter = makeLimiter(
  resolveMax(
    env.AUTH_RATE_LIMIT_MAX,
    env.AUTH_RATE_LIMIT_MAX_DEV,
    env.AUTH_RATE_LIMIT_MAX_PROD,
  ),
  'Too many authentication attempts, please try again later',
  'auth',
);

// ── Password — change / reset ─────────────────────────────────────────────────
// Stricter than general to prevent password-spray and account takeover.
const passwordLimiter = makeLimiter(
  resolveMax(env.PASSWORD_RATE_LIMIT_MAX, 20, 5),
  'Too many password change attempts, please try again later',
  'password',
);

// ── Payment / checkout ────────────────────────────────────────────────────────
// Prevents card-testing fraud and accidental checkout loops.
const paymentLimiter = makeLimiter(
  resolveMax(env.PAYMENT_RATE_LIMIT_MAX, 50, 20),
  'Too many payment requests, please try again later',
  'payment',
);

// ── Coupon validation ─────────────────────────────────────────────────────────
// Blocks brute-force coupon guessing (tighter than general, looser than auth).
const couponLimiter = makeLimiter(
  resolveMax(env.COUPON_RATE_LIMIT_MAX, 100, 30),
  'Too many coupon validation attempts, please try again later',
  'coupon',
);

// ── Order creation ────────────────────────────────────────────────────────────
// Prevents accidental or malicious order flooding that would exhaust stock.
const orderCreationLimiter = makeLimiter(
  resolveMax(env.ORDER_RATE_LIMIT_MAX, 50, 20),
  'Too many order requests, please try again later',
  'order-creation',
);

// ── Admin mutations (POST/PATCH/DELETE on /admin routes) ──────────────────────
// Applied per-method inside admin.routes.js — GET reads are not affected.
const adminMutationLimiter = makeLimiter(
  resolveMax(env.ADMIN_MUTATION_RATE_LIMIT_MAX, 200, 50),
  'Too many admin mutation requests, please try again later',
  'admin-mutation',
);

module.exports = {
  generalLimiter,
  authLimiter,
  passwordLimiter,
  paymentLimiter,
  couponLimiter,
  orderCreationLimiter,
  adminMutationLimiter,
};
