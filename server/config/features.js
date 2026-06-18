'use strict';

// ─── Feature flags ─────────────────────────────────────────────────────────────
// All flags default to enabled (true). Set the corresponding env var to 'false'
// to disable the feature without touching code.
//
// Usage in routes (app.js):
//   app.use(`${API}/reviews`, requireFeature('reviews'), reviewRouter);

const flag = (envVar) => process.env[envVar]?.toLowerCase() !== 'false';

const features = Object.freeze({
  reviews:       flag('FEATURE_REVIEWS'),
  coupons:       flag('FEATURE_COUPONS'),
  wishlist:      flag('FEATURE_WISHLIST'),
  notifications: flag('FEATURE_NOTIFICATIONS'),
  auditLogs:     flag('FEATURE_AUDIT_LOGS'),
});

module.exports = features;
