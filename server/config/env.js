'use strict';

const Joi = require('joi');
const path = require('path');

const isTest = process.env.NODE_ENV === 'test';

// Load .env only in dev/prod — tests set env vars manually
if (!isTest) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().default(5000),
  API_VERSION: Joi.string().default('v1'),

  // MongoDB — only require the relevant URI per environment
  MONGO_URI_DEV: Joi.when('NODE_ENV', {
    is: 'development',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().optional(),
  }),
  MONGO_URI_PROD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().optional(),
  }),
  MONGO_URI_TEST: Joi.string().uri().optional(),

  // JWT (NO DEFAULTS — must come from .env)
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

  // Cookies (NO DEFAULT)
  COOKIE_SECRET: Joi.string().min(32).required(),

  // Tax
  TAX_RATE: Joi.number().min(0).max(1).default(0.17),

  // CORS
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Frontend URL — used in password-reset email links
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  // Email
  SMTP_HOST: Joi.string().optional().allow(''),
  SMTP_PORT: Joi.number().integer().optional(),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  EMAIL_FROM: Joi.string().optional().allow(''),

  // Upload
  UPLOAD_MAX_SIZE_MB: Joi.number().integer().min(1).default(5),

  // Stripe — set real test keys to enable sandbox payments; stub values activate mock provider
  STRIPE_SECRET_KEY:     Joi.string().default('sk_test_stub'),
  STRIPE_WEBHOOK_SECRET: Joi.string().default('whsec_stub'),

  // Rate limiting — global controls
  RATE_LIMIT_ENABLED:  Joi.string().valid('true', 'false').default('true'),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(15 * 60 * 1000),

  // Per-environment base defaults (requests per window)
  GENERAL_RATE_LIMIT_MAX_DEV:  Joi.number().integer().min(1).default(5000),
  GENERAL_RATE_LIMIT_MAX_PROD: Joi.number().integer().min(1).default(100),
  AUTH_RATE_LIMIT_MAX_DEV:     Joi.number().integer().min(1).default(1000),
  AUTH_RATE_LIMIT_MAX_PROD:    Joi.number().integer().min(1).default(10),

  // Single-value overrides — override the env-specific defaults above when set
  RATE_LIMIT_MAX:                Joi.number().integer().min(1).optional(),
  AUTH_RATE_LIMIT_MAX:           Joi.number().integer().min(1).optional(),
  PASSWORD_RATE_LIMIT_MAX:       Joi.number().integer().min(1).optional(),
  PAYMENT_RATE_LIMIT_MAX:        Joi.number().integer().min(1).optional(),
  COUPON_RATE_LIMIT_MAX:         Joi.number().integer().min(1).optional(),
  ORDER_RATE_LIMIT_MAX:          Joi.number().integer().min(1).optional(),
  ADMIN_MUTATION_RATE_LIMIT_MAX: Joi.number().integer().min(1).optional(),

  // Account lockout — failed login attempts before lock
  LOGIN_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  LOGIN_LOCK_MINUTES: Joi.number().integer().min(1).default(30),

  // Admin / alerts
  LOW_STOCK_THRESHOLD: Joi.number().integer().min(0).default(5),
  ALERT_REFUND_SPIKE_THRESHOLD: Joi.number().integer().min(1).default(5),

  // Background jobs — master switch + retention windows
  JOBS_ENABLED:                        Joi.string().valid('true', 'false').default('true'),
  CART_CLEANUP_DAYS:                   Joi.number().integer().min(1).default(30),
  SESSION_CLEANUP_RETENTION_DAYS:      Joi.number().integer().min(1).default(7),
  NOTIFICATION_READ_RETENTION_DAYS:    Joi.number().integer().min(1).default(60),
  NOTIFICATION_MAX_RETENTION_DAYS:     Joi.number().integer().min(1).default(120),
  ADMIN_NOTIFICATION_RETENTION_DAYS:   Joi.number().integer().min(1).default(30),
  AUDIT_LOG_RETENTION_DAYS:            Joi.number().integer().min(1).default(90),
  // Per-job cron overrides (optional — any valid cron expression)
  JOB_CRON_CLEANUP_CARTS:              Joi.string().optional().allow(''),
  JOB_CRON_PROCESS_ALERTS:             Joi.string().optional().allow(''),
  JOB_CRON_CLEANUP_SESSIONS:           Joi.string().optional().allow(''),
  JOB_CRON_DEACTIVATE_COUPONS:         Joi.string().optional().allow(''),
  JOB_CRON_DEACTIVATE_CAMPAIGNS:       Joi.string().optional().allow(''),
  JOB_CRON_CLEANUP_NOTIFICATIONS:      Joi.string().optional().allow(''),
  JOB_CRON_CLEANUP_AUDIT_LOGS:         Joi.string().optional().allow(''),
  JOB_CRON_DAILY_SNAPSHOT:             Joi.string().optional().allow(''),

  // Feature flags (default: enabled — set to 'false' to disable)
  FEATURE_REVIEWS: Joi.string().valid('true', 'false').default('true'),
  FEATURE_COUPONS: Joi.string().valid('true', 'false').default('true'),
  FEATURE_WISHLIST: Joi.string().valid('true', 'false').default('true'),
  FEATURE_NOTIFICATIONS: Joi.string().valid('true', 'false').default('true'),
  FEATURE_AUDIT_LOGS: Joi.string().valid('true', 'false').default('true'),

  // Monitoring
  METRICS_PATH: Joi.string().default('/metrics'),

  // OAuth — optional; features degrade gracefully when not set
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),

  // Cookie domain — set to '.yourdomain.com' for cross-subdomain cookies (e.g. www + apex)
  COOKIE_DOMAIN: Joi.string().optional().allow(''),
}).unknown(true); // allow OS / CI env vars

const { error, value } = schema.validate(process.env, { abortEarly: false });

if (error) {
  throw new Error(
    `\n❌ Environment validation failed:\n${error.details
      .map(d => `  • ${d.message}`)
      .join('\n')}\n`
  );
}

module.exports = value;