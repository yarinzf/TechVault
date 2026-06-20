'use strict';

const crypto = require('crypto');
const User    = require('../models/User');
const Session = require('../models/Session');
const { sendTemplate } = require('./email/email.service');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

// OAuth + SMS services — loaded lazily so missing credentials only throw on use
const googleService = require('./oauth/google.service');
const appleService  = require('./oauth/apple.service');
const smsService    = require('./sms.service');

// ── Cookie helpers ────────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   SESSION_DURATION_MS,
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
};

const setRefreshCookie = (res, token) => res.cookie('refreshToken', token, COOKIE_OPTIONS);
const clearRefreshCookie = (res) =>
  res.cookie('refreshToken', '', { ...COOKIE_OPTIONS, maxAge: 0, expires: new Date(0) });

// ── Token helpers ─────────────────────────────────────────────────────────────

const hashToken = (raw) =>
  crypto.createHash('sha256').update(raw).digest('hex');

// ── User-Agent parser ─────────────────────────────────────────────────────────

function parseDevice(ua = '') {
  let device = 'Desktop';
  let os     = 'Unknown OS';
  let browser = 'Unknown Browser';

  if (/mobile|iphone|android.*mobile/i.test(ua))        device = 'Mobile';
  else if (/tablet|ipad|android(?!.*mobile)/i.test(ua)) device = 'Tablet';

  if (/windows nt/i.test(ua))               os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua))  os = 'macOS';
  else if (/android/i.test(ua))             os = 'Android';
  else if (/iphone|ipad/i.test(ua))         os = 'iOS';
  else if (/linux/i.test(ua))               os = 'Linux';

  if (/edg\//i.test(ua))                                           browser = 'Edge';
  else if (/opr\/|opera/i.test(ua))                                browser = 'Opera';
  else if (/chrome\/[\d.]+/i.test(ua) && !/chromium/i.test(ua))   browser = 'Chrome';
  else if (/firefox\/[\d.]+/i.test(ua))                            browser = 'Firefox';
  else if (/safari\/[\d.]+/i.test(ua) && !/chrome/i.test(ua))     browser = 'Safari';

  return { device, os, browser, deviceName: `${browser} on ${os}` };
}

// ── Core: issue tokens + create/update session ────────────────────────────────

/**
 * Creates a new Session and returns signed tokens.
 * Called on login and register.
 */
const createSession = async (user, opts = {}) => {
  const refreshToken = generateRefreshToken({ id: user._id });
  const hash         = hashToken(refreshToken);
  const { device, os, browser, deviceName } = parseDevice(opts.userAgent);

  const session = await Session.create({
    user:             user._id,
    refreshTokenHash: hash,
    deviceName,
    browser,
    os,
    userAgent: opts.userAgent ?? '',
    ip:        opts.ip        ?? '',
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  });

  // sid embedded in access token → lets authenticate() attach req.sessionId
  const accessToken = generateAccessToken({
    id:   user._id,
    role: user.role,
    sid:  session._id.toString(),
  });

  return { accessToken, refreshToken };
};

// ── Service methods ───────────────────────────────────────────────────────────

const register = async (dto, opts = {}) => {
  const exists = await User.findOne({ email: dto.email });
  if (exists) throw new AppError('Email already registered', StatusCodes.CONFLICT, 'EMAIL_EXISTS');

  const user = await User.create(dto);
  const { accessToken, refreshToken } = await createSession(user, opts);
  return { user, accessToken, refreshToken };
};

const login = async (email, password, opts = {}) => {
  const user = await User.findOne({ email })
    .select('+password +loginAttempts +lockUntil');

  if (user && user.isLocked()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new AppError(
      `Account locked. Try again in ${minutesLeft} minute(s)`,
      StatusCodes.TOO_MANY_REQUESTS,
      'ACCOUNT_LOCKED'
    );
  }

  const valid = user && (await user.comparePassword(password));

  if (!valid) {
    if (user) await user.incrementLoginAttempts();
    throw new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED, 'INVALID_CREDENTIALS');
  }

  if (user.loginAttempts > 0) await user.resetLoginAttempts();

  const { accessToken, refreshToken } = await createSession(user, opts);

  // Fire-and-forget: new login alert (only if user opted in)
  if (user.emailSecurityAlerts !== false) {
    const { deviceName } = parseDevice(opts.userAgent);
    sendTemplate('new-login', user.email, {
      user,
      device:  deviceName,
      ip:      opts.ip,
      loginAt: new Date(),
    });
  }

  return { user, accessToken, refreshToken };
};

const refresh = async (rawToken) => {
  if (!rawToken) throw new AppError('No refresh token', StatusCodes.UNAUTHORIZED, 'NO_REFRESH_TOKEN');

  // Validate the JWT signature and expiry first
  let decoded;
  try {
    decoded = verifyToken(rawToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', StatusCodes.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN');
  }

  // Find the matching active session by token hash
  const hash    = hashToken(rawToken);
  const session = await Session.findOne({ refreshTokenHash: hash, isActive: true });

  if (!session) {
    throw new AppError('Refresh token revoked', StatusCodes.UNAUTHORIZED, 'REFRESH_TOKEN_REVOKED');
  }

  const user = await User.findById(session.user ?? decoded.id);
  if (!user || !user.isActive) {
    throw new AppError('Account not found or deactivated', StatusCodes.UNAUTHORIZED, 'USER_NOT_FOUND');
  }

  // Rotate: generate new refresh token, update session hash
  const newRefreshToken = generateRefreshToken({ id: user._id });
  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastUsedAt       = new Date();
  await session.save({ validateBeforeSave: false });

  // Access token retains the same sid — it's the same session
  const accessToken = generateAccessToken({
    id:   user._id,
    role: user.role,
    sid:  session._id.toString(),
  });

  return { accessToken, refreshToken: newRefreshToken };
};

const logout = async (userId, sessionId) => {
  if (sessionId) {
    await Session.findOneAndUpdate(
      { _id: sessionId, user: userId, isActive: true },
      { $set: { isActive: false, revokedAt: new Date(), revokedReason: 'logout' } }
    );
  }
  // Backward compat: clear legacy refreshToken field on User
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

const logoutAll = async (userId) => {
  await Session.updateMany(
    { user: userId, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedReason: 'logout_all' } }
  );
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

const getSessions = async (userId, currentSessionId) => {
  const now = new Date();
  const sessions = await Session.find({
    user:      userId,
    isActive:  true,
    expiresAt: { $gt: now },
  })
    .sort({ lastUsedAt: -1 })
    .lean();

  return sessions.map(s => ({
    ...s,
    isCurrent: s._id.toString() === currentSessionId,
  }));
};

const revokeSession = async (userId, sessionId, currentSessionId) => {
  if (sessionId === currentSessionId) {
    throw new AppError(
      'Use /auth/logout to end your current session',
      StatusCodes.BAD_REQUEST,
      'USE_LOGOUT_ENDPOINT'
    );
  }
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, user: userId, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedReason: 'logout' } },
    { new: true }
  );
  if (!session) throw new AppError('Session not found', StatusCodes.NOT_FOUND, 'SESSION_NOT_FOUND');
  return session;
};

const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');
  return user;
};

const updateMe = async (userId, dto) => {
  const allowed = ['name', 'phone', 'addresses'];
  const updates = {};
  allowed.forEach(f => { if (dto[f] !== undefined) updates[f] = dto[f]; });

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');
  return user;
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw new AppError('Current password is incorrect', StatusCodes.BAD_REQUEST, 'WRONG_PASSWORD');

  user.password     = newPassword;
  user.refreshToken = null; // backward compat
  await user.save();

  // Revoke every active session — forces re-login on all devices
  await Session.updateMany(
    { user: userId, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedReason: 'password_changed' } }
  );

  // Fire-and-forget: notify user via email
  if (user.emailSecurityAlerts !== false) {
    sendTemplate('password-changed', user.email, { user, changedAt: new Date() });
  }
};

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/**
 * Shared logic for Google / Apple: find-or-create user, then issue session.
 * Never exposes placeholder internals.
 *
 * @param {{ providerField, providerValue, email, name, authProvider }} opts
 */
const _oauthFindOrCreate = async ({ providerField, providerValue, email, name, authProvider }, sessionOpts) => {
  // 1. Try to find by provider ID (most reliable — survives email changes)
  let user = await User.findOne({ [providerField]: providerValue }).select('+' + providerField);

  if (!user && email) {
    // 2. Try to find existing account by email — link provider ID
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user[providerField] = providerValue;
      // Upgrade authProvider only if the account was email-only
      if (user.authProvider === 'email') user.authProvider = authProvider;
      await user.save({ validateBeforeSave: false });
    }
  }

  if (!user) {
    // 3. New user — create with random password (cannot be used to log in)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    user = await User.create({
      name:           name || (email ? email.split('@')[0] : 'User'),
      email:          email ? email.toLowerCase() : null,
      password:       randomPassword,
      [providerField]: providerValue,
      authProvider,
    });
  }

  return createSession(user, sessionOpts);
};

/**
 * POST /auth/google
 * Verifies Google ID token, finds/creates user, issues our JWT.
 */
const loginWithGoogle = async (idToken, opts = {}) => {
  const { googleSub, email, name } = await googleService.verifyGoogleToken(idToken);
  const { accessToken, refreshToken } = await _oauthFindOrCreate(
    { providerField: 'googleId', providerValue: googleSub, email, name, authProvider: 'google' },
    opts
  );
  // Re-fetch user for clean response (toJSON strips sensitive fields)
  const user = await User.findOne({ googleId: googleSub }).select('+googleId');
  return { user, accessToken, refreshToken };
};

/**
 * POST /auth/apple
 * Verifies Apple ID token, finds/creates user, issues our JWT.
 * Apple only sends email on first sign-in — subsequent logins send null.
 */
const loginWithApple = async (idToken, opts = {}) => {
  const { appleSub, email, emailVerified } = await appleService.verifyAppleToken(idToken);

  // If email is null (repeat sign-in), still find by appleId
  const { accessToken, refreshToken } = await _oauthFindOrCreate(
    { providerField: 'appleId', providerValue: appleSub, email, name: null, authProvider: 'apple' },
    opts
  );
  const user = await User.findOne({ appleId: appleSub }).select('+appleId');
  return { user, accessToken, refreshToken };
};

/**
 * POST /auth/sms/start
 * Sends OTP to phone via Twilio Verify. Returns { sent: true }.
 */
const startSmsAuth = async (phone) => {
  return smsService.sendVerificationCode(phone);
};

/**
 * POST /auth/sms/verify
 * Verifies OTP. On success, finds/creates user by phone, issues JWT.
 * Placeholder email (sms_*@sms.techvault.internal) is stripped by User.toJSON.
 */
const verifySmsAuth = async (phone, code, opts = {}) => {
  const { verified } = await smsService.checkVerificationCode(phone, code);
  if (!verified) {
    throw new AppError('Invalid or expired verification code', StatusCodes.UNAUTHORIZED, 'INVALID_SMS_CODE');
  }

  // Normalise phone to E.164 before DB lookup
  const normPhone = phone.trim();

  let user = await User.findOne({ phone: normPhone });
  if (!user) {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const placeholderEmail = `sms_${normPhone.replace(/\D/g, '')}@sms.techvault.internal`;
    user = await User.create({
      name:         normPhone, // user should update from profile settings
      email:        placeholderEmail,
      phone:        normPhone,
      password:     randomPassword,
      authProvider: 'sms',
    });
  }

  const { accessToken, refreshToken } = await createSession(user, opts);
  return { user, accessToken, refreshToken };
};

// ── Password reset ────────────────────────────────────────────────────────────

/**
 * Sends a password-reset email if the email belongs to an email-auth user.
 * Always resolves silently — never reveals whether the email exists.
 */
const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Silently return for unknown emails or OAuth-only accounts (enumeration protection)
  if (!user || user.authProvider !== 'email') return;

  const rawToken  = crypto.randomBytes(32).toString('hex'); // 256-bit entropy
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await User.findByIdAndUpdate(user._id, {
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: expiresAt,
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl    = `${frontendUrl}/reset-password?token=${rawToken}`;

  sendTemplate('password-reset', user.email, { user, resetUrl });
};

/**
 * Validates the raw reset token, sets the new password, and revokes all sessions.
 */
const resetPassword = async (rawToken, newPassword) => {
  const tokenHash = hashToken(rawToken);

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw new AppError(
      'Invalid or expired reset link. Please request a new one.',
      StatusCodes.BAD_REQUEST,
      'INVALID_RESET_TOKEN'
    );
  }

  user.password               = newPassword; // pre-save hook hashes it
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  // Revoke every active session — forces re-login on all devices
  await Session.updateMany(
    { user: user._id, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedReason: 'password_reset' } }
  );

  if (user.emailSecurityAlerts !== false) {
    sendTemplate('password-changed', user.email, { user, changedAt: new Date() });
  }

  return user;
};

// Admin helpers
const getUserSessions = async (userId) => {
  const now = new Date();
  return Session.find({
    user:      userId,
    isActive:  true,
    expiresAt: { $gt: now },
  })
    .sort({ lastUsedAt: -1 })
    .lean();
};

const forceRevokeUserSessions = async (userId) => {
  const result = await Session.updateMany(
    { user: userId, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedReason: 'admin_force' } }
  );
  return result.modifiedCount;
};

module.exports = {
  register, login, refresh, logout, logoutAll,
  getSessions, revokeSession,
  getMe, updateMe, changePassword,
  forgotPassword, resetPassword,
  getUserSessions, forceRevokeUserSessions,
  setRefreshCookie, clearRefreshCookie,
  loginWithGoogle, loginWithApple,
  startSmsAuth, verifySmsAuth,
};
