'use strict';

const mongoose = require('mongoose');

const REVOKE_REASONS = ['logout', 'logout_all', 'password_changed', 'admin_force', 'expired'];

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // SHA-256 hash of the raw refresh token — never store the token itself
    refreshTokenHash: { type: String, required: true },

    // Parsed from User-Agent at login time
    deviceName: { type: String, default: 'Unknown Device' }, // e.g. "Chrome on macOS"
    browser:    { type: String, default: '' },
    os:         { type: String, default: '' },
    userAgent:  { type: String, default: '' },

    ip: { type: String, default: '' },

    isActive:      { type: Boolean, default: true },
    lastUsedAt:    { type: Date,    default: Date.now },
    expiresAt:     { type: Date,    required: true },

    revokedAt:     { type: Date,    default: null },
    revokedReason: {
      type: String,
      enum: { values: [...REVOKE_REASONS, null], message: 'Invalid revoke reason' },
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
sessionSchema.index({ user: 1, isActive: 1, lastUsedAt: -1 });
sessionSchema.index({ refreshTokenHash: 1 }); // for O(1) token lookup by hash
sessionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
module.exports.REVOKE_REASONS = REVOKE_REASONS;
