'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter, passwordLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and profile management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             name: "Jane Doe"
 *             email: "jane@example.com"
 *             password: "SecurePass123!"
 *             phone: "+972-50-1234567"
 *     responses:
 *       201:
 *         description: User registered — access token returned, refresh cookie set
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "User registered"
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   _id: "665a1f2e8b1c2d3e4f5a6b7c"
 *                   name: "Jane Doe"
 *                   email: "jane@example.com"
 *                   role: "user"
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: { code: "DUPLICATE_KEY", message: "email already exists", details: [] }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/register', authLimiter, validate(registerSchema), ctrl.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "jane@example.com"
 *             password: "SecurePass123!"
 *     responses:
 *       200:
 *         description: Access token returned, refresh cookie set
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Login successful"
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   _id: "665a1f2e8b1c2d3e4f5a6b7c"
 *                   name: "Jane Doe"
 *                   email: "jane@example.com"
 *                   role: "user"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", details: [] }
 *       429:
 *         description: Too many attempts — account temporarily locked
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: { code: "ACCOUNT_LOCKED", message: "Account locked. Try again in 15 minutes.", details: [] }
 */
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token (uses HttpOnly cookie)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: New access token, new refresh cookie set
 *       401:
 *         description: Missing or invalid refresh token
 */
router.post('/refresh', ctrl.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout — clears cookie and revokes refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', authenticate, ctrl.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get own profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get('/me', authenticate, ctrl.getMe);

/**
 * @swagger
 * /auth/me:
 *   patch:
 *     summary: Update own profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/me', authenticate, validate(updateProfileSchema), ctrl.updateMe);

/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     summary: Change password (invalidates all sessions)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/change-password', authenticate, passwordLimiter, validate(changePasswordSchema), ctrl.changePassword);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Always 200 — email sent if address is registered (enumeration-safe)
 */
router.post('/forgot-password', passwordLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a valid reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:       { type: string, description: "64-char hex token from email link" }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset — all sessions revoked
 *       400:
 *         description: Token invalid or expired
 */
router.post('/reset-password', passwordLimiter, validate(resetPasswordSchema), ctrl.resetPassword);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: Logout from all devices (revokes all sessions)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked
 */
router.post('/logout-all', authenticate, ctrl.logoutAll);

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     summary: List all active sessions for the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active session list with isCurrent flag
 */
router.get('/sessions', authenticate, ctrl.getSessions);

/**
 * @swagger
 * /auth/sessions/{id}:
 *   delete:
 *     summary: Revoke a specific session (cannot revoke current session — use /logout)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session revoked
 *       400:
 *         description: Cannot revoke current session via this endpoint
 *       404:
 *         description: Session not found
 */
router.delete('/sessions/:id', authenticate, ctrl.revokeSession);

// ── OAuth / Social sign-in ────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Sign in with Google (ID token from GSI)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken: { type: string }
 *     responses:
 *       200:
 *         description: Access token returned, refresh cookie set
 *       503:
 *         description: Google Sign In not configured (GOOGLE_CLIENT_ID missing)
 */
router.post('/google', authLimiter, ctrl.googleLogin);

/**
 * @swagger
 * /auth/apple:
 *   post:
 *     summary: Sign in with Apple (id_token from Apple JS SDK)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken: { type: string }
 *     responses:
 *       200:
 *         description: Access token returned, refresh cookie set
 *       503:
 *         description: Apple Sign In not configured — set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
 */
router.post('/apple', authLimiter, ctrl.appleLogin);

/**
 * @swagger
 * /auth/sms/start:
 *   post:
 *     summary: Send OTP to phone via Twilio Verify
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: "+972501234567" }
 *     responses:
 *       200:
 *         description: Code sent
 *       503:
 *         description: SMS not configured (TWILIO_* vars missing)
 */
router.post('/sms/start', authLimiter, ctrl.smsStart);

/**
 * @swagger
 * /auth/sms/verify:
 *   post:
 *     summary: Verify OTP and issue JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, code]
 *             properties:
 *               phone: { type: string }
 *               code:  { type: string }
 *     responses:
 *       200:
 *         description: Access token returned, refresh cookie set
 *       401:
 *         description: Invalid or expired code
 */
router.post('/sms/verify', authLimiter, ctrl.smsVerify);

module.exports = router;
