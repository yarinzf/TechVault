'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const MAX_ATTEMPTS     = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5',  10);
const LOCK_DURATION_MS = parseInt(process.env.LOGIN_LOCK_MINUTES || '30', 10) * 60 * 1000;

const addressSchema = new mongoose.Schema(
  {
    label:     { type: String, trim: true },
    street:    { type: String, trim: true },
    city:      { type: String, trim: true },
    zip:       { type: String, trim: true },
    country:   { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

// TechVault Club membership — persisted independently of `role`/authorization.
// ONE membership level only (a Club member IS a VIP member) — there are NO
// tiers (no Silver/Gold/Platinum/Diamond) and never will be a `vipTier`
// field. Membership is a TERM (plan + startedAt/expiresAt), not a lifetime
// purchase — see server/config/membership.js for plan pricing/duration.
//
// `status` is a stored, eventually-consistent field (flipped to 'expired'
// lazily — see isMembershipActive below — never via a cron in this phase).
// `joinedAt` is preserved as the historical FIRST-ever join date and never
// changes on renewal; `startedAt`/`expiresAt` describe the CURRENT term.
//
// A record with status:'active' but no expiresAt is NOT treated as
// permanently VIP — that legacy "grandfather forever" rule from the old
// lifetime-membership model has been removed (see isMembershipActive
// below). Every real membership now requires a real plan/startedAt/
// expiresAt; a status:'active' document missing expiresAt is malformed
// data, not a special permanent-access case. Pre-existing local-dev
// records in this shape should be normalized via
// server/scripts/normalizeLegacyMembership.js (local/dev only, never run
// against production automatically — see that script and the Club/VIP
// follow-up report for the required production migration).
const membershipSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: {
        values: ['none', 'active', 'expired'],
        message: 'Membership status must be one of: none, active, expired',
      },
      default: 'none',
    },
    plan: {
      type: String,
      enum: {
        values: ['monthly', 'annual', null],
        message: 'Membership plan must be one of: monthly, annual',
      },
      default: null,
    },
    joinedAt:  { type: Date, default: null }, // first-ever join date — historical, never overwritten by renewal
    startedAt: { type: Date, default: null }, // start of the CURRENT term
    expiresAt: { type: Date, default: null }, // end of the CURRENT term — required for real VIP access, see isMembershipActive
    points: { type: Number, default: 0, min: 0 },
    lifetimePoints: { type: Number, default: 0, min: 0 },
    notificationPreference: {
      type: String,
      enum: {
        values: ['none', 'email', 'sms', 'both'],
        message: 'Notification preference must be one of: none, email, sms, both',
      },
      default: 'none',
    },

    // ── Subscription-lifecycle state (prep for real recurring billing) ──────
    // NONE of these fields cause any real charge to happen — no cron, no
    // webhook, no scheduled job currently reads or acts on them. They exist
    // so the target "Netflix-style" auto-renew business model (see
    // membership.service.js#cancelAutoRenew and the Club/VIP recurring-
    // billing audit report) has somewhere truthful to record customer
    // intent ahead of the real Stripe Subscription integration described
    // there. Until that integration exists, the frontend must never display
    // these as if a real renewal will happen — see
    // client ProfilePage club banner wording.
    autoRenew: { type: Boolean, default: true }, // customer's default intent under the target model; not yet acted on by any real billing process
    cancelAtPeriodEnd: { type: Boolean, default: false }, // true once the customer has opted out of the next renewal — see cancelAutoRenew
    cancelledAt: { type: Date, default: null }, // when cancelAtPeriodEnd was last set true

    // Stripe Customer / Subscription ids — always null today. No Customer
    // object is ever created (payment.service.js/stripe.provider.js only
    // ever call paymentIntents.create with no `customer` param), and no
    // Subscription object exists anywhere in this codebase. Reserved so a
    // future real integration has a place to store them without another
    // schema migration.
    providerCustomerId:     { type: String, default: null },
    providerSubscriptionId: { type: String, default: null },
  },
  { _id: false }
);

const DEFAULT_MEMBERSHIP = Object.freeze({
  status: 'none',
  plan: null,
  joinedAt: null,
  startedAt: null,
  expiresAt: null,
  points: 0,
  lifetimePoints: 0,
  notificationPreference: 'none',
  autoRenew: true,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  providerCustomerId: null,
  providerSubscriptionId: null,
});

// Single source of truth for "is this membership document CURRENTLY VIP" —
// used everywhere a real business decision is gated on membership (points
// earning, VIP pricing, early access, checkout redemption), not just the
// raw `status` string, so an expired-but-not-yet-lazily-synced document is
// never mistakenly treated as active.
const isMembershipActive = (membership) => {
  if (!membership || membership.status !== 'active') return false;
  // A real membership always has a real expiresAt. status:'active' with no
  // expiresAt is malformed/legacy data, not a permanent-access case — see
  // server/scripts/normalizeLegacyMembership.js for the local/dev
  // normalization path (the old "grandfather forever" rule is retired).
  if (!membership.expiresAt) return false;
  return new Date(membership.expiresAt) > new Date();
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['user', 'admin', 'superadmin', 'warehouse'],
        message: 'Role must be one of: user, admin, superadmin, warehouse',
      },
      default: 'user',
    },
    phone: { type: String, trim: true },
    addresses: { type: [addressSchema], default: [] },
    isActive: { type: Boolean, default: true },

    // Lockout tracking
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil:     { type: Date, select: false },

    // Refresh token — stored server-side for rotation/revocation
    refreshToken: { type: String, select: false },

    // OAuth provider links — sparse so null values don't trigger the unique constraint
    googleId: { type: String, select: false },
    appleId:  { type: String, select: false },

    // Auth provider used to create the account (for profile UX — e.g. hide password change)
    authProvider: {
      type:    String,
      enum:    ['email', 'google', 'apple', 'sms'],
      default: 'email',
    },

    // Password reset — raw token is never stored; only the SHA-256 hash
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date,   select: false, default: null },

    // Email notification preferences
    emailOrderUpdates:   { type: Boolean, default: true },
    emailSecurityAlerts: { type: Boolean, default: true },
    emailMarketing:      { type: Boolean, default: false },
    emailAdminAlerts:    { type: Boolean, default: true },

    // TechVault Club membership — NOT an authorization role. See membershipSchema above.
    membership: { type: membershipSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.googleId;
        delete ret.appleId;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        // authProvider intentionally kept — frontend uses it for profile UI (e.g. hide password change)
        // Strip internal SMS placeholder emails so they never reach the UI
        if (ret.email && ret.email.endsWith('@sms.techvault.internal')) {
          delete ret.email;
        }
        // Belt-and-suspenders: pre-existing documents created before the
        // membership field existed rely on Mongoose's hydration defaults,
        // which don't apply to .lean() reads. Normalize here so the API
        // never returns a user without a well-formed membership object.
        ret.membership = { ...DEFAULT_MEMBERSHIP, ...ret.membership };
        // Read-time expiry correction: the API must never claim a member is
        // 'active' past their expiresAt, even if the stored field hasn't
        // been lazily synced yet (see isMembershipActive) — this is
        // display-only and does not write anything back to the database.
        if (ret.membership.status === 'active' && !isMembershipActive(ret.membership)) {
          ret.membership = { ...ret.membership, status: 'expired' };
        }
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Pre-save: hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

// ─── Instance methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incrementLoginAttempts = async function () {
  this.loginAttempts = (this.loginAttempts || 0) + 1;
  if (this.loginAttempts >= MAX_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    this.loginAttempts = 0;
  }
  return this.save({ validateBeforeSave: false });
};

userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  return this.save({ validateBeforeSave: false });
};

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ appleId: 1 },  { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
module.exports.isMembershipActive = isMembershipActive;
