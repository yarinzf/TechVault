'use strict';

const rateLimit = require('express-rate-limit');
const env    = require('../config/env');
const logger = require('../config/logger');

const enabled  = env.RATE_LIMIT_ENABLED !== 'false';
const windowMs = env.RATE_LIMIT_WINDOW_MS;          // strict — auth/password/payment/coupon/order/admin-mutation
const generousWindowMs = env.GENEROUS_RATE_LIMIT_WINDOW_MS; // general/public-read, refresh, admin-read

// Resolve the effective max for a limiter.
// Priority: single-value override → test → env-specific default.
// An explicit override always wins — this lets a test deliberately construct
// a small, real limiter (see tests/rateLimiting.test.js) to exercise actual
// 429 behavior. No override is set anywhere in the default test bootstrap
// (tests/helpers/testEnv.js), so every OTHER test file is unaffected and
// still gets the effectively-unlimited 100_000 default.
const resolveMax = (override, devDefault, prodDefault) => {
  if (override != null)        return override;
  if (env.NODE_ENV === 'test') return 100_000;
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

const makeLimiter = (max, message, category, skip = routeSkip, limiterWindowMs = windowMs) =>
  rateLimit({
    windowMs: limiterWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    skip,
    handler:         makeHandler(message, category),
  });

// ── General — applied globally under /api ─────────────────────────────────────
// Skips OPTIONS preflight + health checks; respects RATE_LIMIT_ENABLED.
//
// This is the default bucket for every request not covered by a more
// specific limiter below — in practice that's public catalog reads
// (products/categories/campaigns/currency/location) plus ordinary
// authenticated customer traffic (auth/me, cart, wishlist, order/review
// reads, etc). A real measured page load is 3 API calls anonymous, 6 logged
// in, and up to ~10 in the worst case where an expired access token causes
// 3 parallel 401s -> one deduped refresh -> 3 retries. On a short (1-minute,
// GENEROUS_RATE_LIMIT_WINDOW_MS) window, 240/min gives a wide safety margin
// over even a user aggressively mashing F5 — while a 15-minute window with
// the same low cap (the previous behavior) let one short reload burst
// exhaust the ENTIRE window's budget and lock the visitor out of the whole
// API for up to 15 minutes. Auth-sensitive/payment/admin-mutation endpoints
// are NOT loosened by this — they sit behind their own separate, still-
// strict limiters further below, applied IN ADDITION to this one.
const generalLimiter = makeLimiter(
  resolveMax(
    env.RATE_LIMIT_MAX,
    env.GENERAL_RATE_LIMIT_MAX_DEV,
    env.GENERAL_RATE_LIMIT_MAX_PROD,
  ),
  'Too many requests, please try again later',
  'general',
  globalSkip,
  generousWindowMs,
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

// ── Refresh token — POST /auth/refresh ─────────────────────────────────────────
// Deliberately separate from authLimiter (login/register): a refresh call is
// not a credential-guessing surface — it requires an already-valid HttpOnly
// refresh cookie — and happens automatically as a normal part of browsing
// (access tokens are short-lived). The frontend's single-flight refresh
// promise (client/src/services/api/index.js) already collapses any number of
// concurrent 401s from one reload into exactly ONE refresh call, so real
// usage — even a burst of rapid reloads with an expired access token — stays
// far under this budget. A short (1-minute) window means a real transient
// 429 here recovers almost immediately, instead of leaving a legitimate user
// unable to refresh their session for up to 15 minutes.
const refreshLimiter = makeLimiter(
  resolveMax(env.REFRESH_RATE_LIMIT_MAX, env.REFRESH_RATE_LIMIT_MAX_DEV, env.REFRESH_RATE_LIMIT_MAX_PROD),
  'Too many session refresh attempts, please try again shortly',
  'refresh',
  routeSkip,
  generousWindowMs,
);

// ── Admin/warehouse reads (GET/HEAD on /admin routes) ──────────────────────────
// Applied per-method inside admin.routes.js — mirrors adminMutationLimiter's
// method split, but for reads. Kept in its OWN bucket rather than sharing
// generalLimiter's budget with public customer traffic, so a busy admin/
// warehouse dashboard session (several widgets fetching on one page) can
// never be crowded out by — or itself crowd out — ordinary storefront
// browsing sharing the same office/warehouse IP.
const adminReadLimiter = makeLimiter(
  resolveMax(env.ADMIN_READ_RATE_LIMIT_MAX, env.ADMIN_READ_RATE_LIMIT_MAX_DEV, env.ADMIN_READ_RATE_LIMIT_MAX_PROD),
  'Too many admin requests, please try again shortly',
  'admin-read',
  routeSkip,
  generousWindowMs,
);

module.exports = {
  generalLimiter,
  authLimiter,
  passwordLimiter,
  paymentLimiter,
  couponLimiter,
  orderCreationLimiter,
  adminMutationLimiter,
  refreshLimiter,
  adminReadLimiter,
};
