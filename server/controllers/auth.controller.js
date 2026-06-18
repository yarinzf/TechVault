'use strict';

const authService = require('../services/auth.service');
const audit       = require('../services/audit.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

// ── Shared opts extractor ─────────────────────────────────────────────────────
const reqOpts = (req) => ({
  ip:        req.ip || req.headers['x-forwarded-for'] || '',
  userAgent: req.headers['user-agent'] || '',
});

// ── Auth ──────────────────────────────────────────────────────────────────────

const register = async (req, res, next) => {
  try {
    const { user, accessToken, refreshToken } = await authService.register(req.body, reqOpts(req));
    authService.setRefreshCookie(res, refreshToken);
    sendSuccess(res, { user, accessToken }, 'Registration successful', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const { user, accessToken, refreshToken } = await authService.login(
      req.body.email, req.body.password, reqOpts(req)
    );
    authService.setRefreshCookie(res, refreshToken);

    // Audit all logins (admin/staff level) — non-fatal fire-and-forget
    if (user.role !== 'user') {
      audit.log({
        action:   'auth.login',
        entity:   'User',
        entityId: user._id,
        actor:    user,
        after:    { email: user.email, role: user.role },
        req,
      });
    }

    sendSuccess(res, { user, accessToken }, 'Login successful');
  } catch (err) { next(err); }
};

const refresh = async (req, res, next) => {
  try {
    const { accessToken, refreshToken } = await authService.refresh(req.cookies?.refreshToken);
    authService.setRefreshCookie(res, refreshToken);
    sendSuccess(res, { accessToken }, 'Token refreshed');
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    // req.sessionId comes from the `sid` claim in the access token (set in authenticate middleware)
    await authService.logout(req.user._id, req.sessionId);
    authService.clearRefreshCookie(res);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) { next(err); }
};

const logoutAll = async (req, res, next) => {
  try {
    await authService.logoutAll(req.user._id);
    authService.clearRefreshCookie(res);

    audit.log({
      action:   'auth.logout_all',
      entity:   'User',
      entityId: req.user._id,
      actor:    req.user,
      req,
    });

    sendSuccess(res, null, 'Logged out from all devices');
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user._id);
    sendSuccess(res, { user });
  } catch (err) { next(err); }
};

const updateMe = async (req, res, next) => {
  try {
    const user = await authService.updateMe(req.user._id, req.body);
    sendSuccess(res, { user }, 'Profile updated');
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
    authService.clearRefreshCookie(res);

    audit.log({
      action:   'auth.password_changed',
      entity:   'User',
      entityId: req.user._id,
      actor:    req.user,
      req,
    });

    sendSuccess(res, null, 'Password changed. Please log in again.');
  } catch (err) { next(err); }
};

// ── OAuth ─────────────────────────────────────────────────────────────────────

const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return next(new (require('../middleware/errorHandler').AppError)('idToken is required', 400, 'VALIDATION_ERROR'));

    const { user, accessToken, refreshToken } = await authService.loginWithGoogle(idToken, reqOpts(req));
    authService.setRefreshCookie(res, refreshToken);

    audit.log({
      action:   'auth.google_login',
      entity:   'User',
      entityId: user._id,
      actor:    user,
      after:    { email: user.email, authProvider: user.authProvider },
      req,
    });

    sendSuccess(res, { user, accessToken }, 'Google login successful');
  } catch (err) { next(err); }
};

const appleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return next(new (require('../middleware/errorHandler').AppError)('idToken is required', 400, 'VALIDATION_ERROR'));

    const { user, accessToken, refreshToken } = await authService.loginWithApple(idToken, reqOpts(req));
    authService.setRefreshCookie(res, refreshToken);

    audit.log({
      action:   'auth.apple_login',
      entity:   'User',
      entityId: user._id,
      actor:    user,
      after:    { authProvider: user.authProvider },
      req,
    });

    sendSuccess(res, { user, accessToken }, 'Apple login successful');
  } catch (err) { next(err); }
};

const smsStart = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return next(new (require('../middleware/errorHandler').AppError)('phone is required', 400, 'VALIDATION_ERROR'));

    await authService.startSmsAuth(phone);

    // Audit: record that a code was requested (no user linked yet)
    audit.log({
      action:   'auth.sms_start',
      entity:   'Auth',
      entityId: null,
      // actor requires _id + role — use a minimal synthetic entry for unauthenticated events
      actor:    { _id: null, role: 'anonymous' },
      after:    { phonePrefix: phone.slice(0, 5) + '***' }, // never log full phone
      req,
    });

    sendSuccess(res, { sent: true }, 'Verification code sent');
  } catch (err) { next(err); }
};

const smsVerify = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return next(new (require('../middleware/errorHandler').AppError)('phone and code are required', 400, 'VALIDATION_ERROR'));

    let result;
    try {
      result = await authService.verifySmsAuth(phone, code, reqOpts(req));
    } catch (verifyErr) {
      // Audit failed verification attempt
      audit.log({
        action:   'auth.sms_verify_failed',
        entity:   'Auth',
        entityId: null,
        actor:    { _id: null, role: 'anonymous' },
        after:    { phonePrefix: phone.slice(0, 5) + '***', reason: verifyErr.message },
        req,
      });
      throw verifyErr;
    }

    const { user, accessToken, refreshToken } = result;
    authService.setRefreshCookie(res, refreshToken);

    audit.log({
      action:   'auth.sms_verify_success',
      entity:   'User',
      entityId: user._id,
      actor:    user,
      after:    { authProvider: user.authProvider },
      req,
    });

    sendSuccess(res, { user, accessToken }, 'SMS verification successful');
  } catch (err) { next(err); }
};

// ── Password reset ────────────────────────────────────────────────────────────

const forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email);
    // Always 200 — never reveal whether email exists (enumeration protection)
    sendSuccess(res, null, 'If this email is registered, a reset link has been sent.');
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const user = await authService.resetPassword(req.body.token, req.body.newPassword);
    authService.clearRefreshCookie(res);

    audit.log({
      action:   'auth.password_reset',
      entity:   'User',
      entityId: user._id,
      actor:    user,
      req,
    });

    sendSuccess(res, null, 'Password reset successfully. Please log in again.');
  } catch (err) { next(err); }
};

// ── Session management ────────────────────────────────────────────────────────

const getSessions = async (req, res, next) => {
  try {
    const sessions = await authService.getSessions(req.user._id, req.sessionId);
    sendSuccess(res, { sessions });
  } catch (err) { next(err); }
};

const revokeSession = async (req, res, next) => {
  try {
    await authService.revokeSession(req.user._id, req.params.id, req.sessionId);

    audit.log({
      action:   'auth.session_revoked',
      entity:   'Session',
      entityId: req.params.id,
      actor:    req.user,
      metadata: { sessionId: req.params.id },
      req,
    });

    sendSuccess(res, null, 'Session revoked');
  } catch (err) { next(err); }
};

module.exports = {
  register, login, refresh, logout, logoutAll,
  getMe, updateMe, changePassword,
  forgotPassword, resetPassword,
  getSessions, revokeSession,
  googleLogin, appleLogin,
  smsStart, smsVerify,
};
