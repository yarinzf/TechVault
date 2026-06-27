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
