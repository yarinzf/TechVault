#!/usr/bin/env node
'use strict';

/**
 * forceResetPrivilegedPasswords.js — ONE-TIME FORCED PASSWORD RESET for
 * accounts whose CURRENT password is unknown (admin/warehouse).
 *
 * This is deliberately a SEPARATE tool from rotateProductionCredentials.js.
 * That script requires an old-password value (for reuse-prevention and
 * self-verification) because it was built for accounts whose current
 * password was already known. This script exists for the opposite case:
 * the current password is unknown, so there is nothing to verify it
 * against — only that the account exists, is active, has the expected
 * role, and ends up authenticating with the new password.
 *
 * ─── superadmin@techvault.dev is NEVER a target of this script ──────────
 * It was already rotated in an earlier run and must not be touched again.
 * There is no code path in this file that can write to that account: it
 * simply never appears in TARGETS, and assertNeverSuperadmin() below is a
 * second, redundant guard that throws if it ever somehow did.
 *
 * ─── What this touches ──────────────────────────────────────────────────
 * ONLY the `password` field, on ONLY admin@techvault.dev and
 * warehouse@techvault.dev, and ONLY when the caller supplies a new value
 * for that exact target via its own environment variable. Nothing else —
 * not role, not isActive, not email. Never creates a user: an account that
 * doesn't already exist, or that isn't currently active, is skipped, not
 * created or reactivated.
 *
 * ─── How hashing works ──────────────────────────────────────────────────
 * Uses the REAL application hashing path: fetches the actual Mongoose User
 * document, assigns the new plaintext to `user.password`, and calls
 * `user.save()` — the exact same `pre('save')` bcrypt hook
 * (server/models/User.js, SALT_ROUNDS=12) every real password
 * change/register/reset in this app goes through.
 *
 * ─── No old-password verification ────────────────────────────────────────
 * The old password is unknown by design — this script never reads, stores,
 * or compares against one. Proof that the reset worked comes from two
 * places instead: an in-process self-check that the NEW password now
 * authenticates (`comparePassword`), and — at the workflow level — a live
 * call to the real production login API with the new password.
 *
 * ─── Session invalidation ───────────────────────────────────────────────
 * After a successful reset, calls the app's own `authService.logoutAll`
 * for that user — revokes every active refresh Session and clears the
 * legacy `refreshToken` field, exactly like `/auth/logout-all`.
 *
 * ─── Never logged, never written in plaintext ───────────────────────────
 * New passwords arrive ONLY via environment variables (GitHub Actions
 * secrets). Never echoed, console.log'd, or included in any report. Only
 * email/role/isActive/outcome are ever printed. Thrown errors never
 * interpolate a password value.
 *
 * ─── Hard safety model (mirrors the other production scripts) ──────────
 *   - Refuses to run unless NODE_ENV === "production".
 *   - Refuses to run if the resolved Mongo URI/host is localhost/127.0.0.1.
 *   - Refuses to run without RESET_CONFIRM=TECHVAULT_PRODUCTION set.
 *   - --audit is fully read-only.
 *   - --apply only resets a target whose newEnvVar is set AND meets a
 *     minimum strength floor, AND whose account already exists, is
 *     active, and has the expected role — otherwise it is skipped.
 *
 * Usage (must be run inside the production application context):
 *   node server/scripts/forceResetPrivilegedPasswords.js --audit
 *   node server/scripts/forceResetPrivilegedPasswords.js --apply
 */

const mongoose = require('mongoose');

const REQUIRED_CONFIRM_VALUE = 'TECHVAULT_PRODUCTION';
const MIN_PASSWORD_LENGTH = 12;
const NEVER_TOUCH_EMAIL = 'superadmin@techvault.dev';

// Fixed, explicit target list — superadmin is intentionally absent.
const TARGETS = [
  { email: 'admin@techvault.dev',     expectedRole: 'admin',     newEnvVar: 'ROTATE_ADMIN_NEW_PASSWORD' },
  { email: 'warehouse@techvault.dev', expectedRole: 'warehouse', newEnvVar: 'ROTATE_WAREHOUSE_NEW_PASSWORD' },
];

function assertNeverSuperadmin(email) {
  if (email === NEVER_TOUCH_EMAIL) {
    throw new Error(`ABORT — refusing to touch ${NEVER_TOUCH_EMAIL}; it was already rotated and must never be reset by this script`);
  }
}

// ─── Safety guards ───────────────────────────────────────────────────────────
function assertProductionSafety() {
  const errors = [];
  if (process.env.NODE_ENV !== 'production') {
    errors.push(`NODE_ENV must be "production" (got: ${JSON.stringify(process.env.NODE_ENV)})`);
  }
  const uri = process.env.MONGO_URI_PROD || '';
  if (!uri) {
    errors.push('MONGO_URI_PROD is not set');
  } else if (/localhost|127\.0\.0\.1/i.test(uri)) {
    errors.push('MONGO_URI_PROD resolves to localhost — refusing to run against a local database');
  }
  if (process.env.RESET_CONFIRM !== REQUIRED_CONFIRM_VALUE) {
    errors.push(`RESET_CONFIRM must equal exactly "${REQUIRED_CONFIRM_VALUE}"`);
  }
  if (errors.length) {
    throw new Error('ABORT — production safety check failed:\n  - ' + errors.join('\n  - '));
  }
}

function assertConnectionIsNotLocal() {
  const host = mongoose.connection.host || '';
  if (/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error(`ABORT — connected Mongo host "${host}" looks local, not production`);
  }
}

// ─── Audit (read-only) ──────────────────────────────────────────────────────
async function runAudit() {
  const User = mongoose.model('User');
  console.log('\nAudit — admin/warehouse account status (read-only, no writes):\n');
  for (const t of TARGETS) {
    assertNeverSuperadmin(t.email);
    const user = await User.findOne({ email: t.email }).select('email role isActive createdAt').lean();
    if (!user) {
      console.log(`- ${t.email}: NOT FOUND in production`);
      continue;
    }
    const roleOk = user.role === t.expectedRole;
    console.log(
      `- ${t.email}: role=${user.role}${roleOk ? '' : ` (EXPECTED ${t.expectedRole} — MISMATCH, would be skipped)`}, ` +
      `active=${user.isActive}${user.isActive ? '' : ' (INACTIVE — would be skipped)'}, ` +
      `createdAt=${new Date(user.createdAt).toISOString()}`
    );
  }
  console.log(`\n${NEVER_TOUCH_EMAIL} is never included in this script's targets. No passwords were read or printed. No data was modified.`);
}

// ─── Apply ──────────────────────────────────────────────────────────────────
async function runApply() {
  const User = mongoose.model('User');
  const authService = require('../services/auth.service');

  const results = [];

  for (const t of TARGETS) {
    assertNeverSuperadmin(t.email);

    const newPassword = process.env[t.newEnvVar];

    if (!newPassword) {
      results.push({ email: t.email, outcome: 'skipped', reason: `${t.newEnvVar} not set` });
      continue;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      results.push({ email: t.email, outcome: 'skipped', reason: `new password shorter than ${MIN_PASSWORD_LENGTH} chars` });
      continue;
    }

    const user = await User.findOne({ email: t.email }).select('+password role isActive');
    if (!user) {
      results.push({ email: t.email, outcome: 'skipped', reason: 'account not found in production — this script never creates a user' });
      continue;
    }
    if (!user.isActive) {
      results.push({ email: t.email, outcome: 'skipped', reason: 'account is not active — refusing to reset an inactive account' });
      continue;
    }
    if (user.role !== t.expectedRole) {
      results.push({ email: t.email, outcome: 'skipped', reason: `role is "${user.role}", expected "${t.expectedRole}" — refusing to reset` });
      continue;
    }

    // Real application hashing path — see file header.
    user.password = newPassword;
    await user.save();

    // In-process self-check only — never over the network, never logged.
    const newWorks = await user.comparePassword(newPassword);

    let sessionsRevoked = 0;
    try {
      const before = await mongoose.model('Session').countDocuments({ user: user._id, isActive: true });
      await authService.logoutAll(user._id);
      sessionsRevoked = before;
    } catch (err) {
      results.push({ email: t.email, outcome: 'reset_session_revoke_failed', role: user.role, isActive: user.isActive, error: err.message });
      continue;
    }

    if (!newWorks) {
      // Should be cryptographically impossible, but never report success
      // without direct proof.
      results.push({ email: t.email, outcome: 'FAILED_VERIFICATION', role: user.role, isActive: user.isActive, reason: 'newWorks=false' });
      continue;
    }

    results.push({ email: t.email, outcome: 'reset', role: user.role, isActive: user.isActive, sessionsRevoked });
  }

  return results;
}

function printResults(results) {
  console.log('\nForced-reset results (no passwords or hashes shown):\n');
  for (const r of results) {
    if (r.outcome === 'reset') {
      console.log(`- ${r.email}: RESET — role=${r.role}, active=${r.isActive}, sessionsRevoked=${r.sessionsRevoked}, new password verified accepted`);
    } else if (r.outcome === 'skipped') {
      console.log(`- ${r.email}: skipped — ${r.reason}`);
    } else {
      console.log(`- ${r.email}: ${r.outcome} — ${r.reason || r.error || ''}`);
    }
  }
}

async function runAsCli() {
  const args = process.argv.slice(2);
  const mode = args.includes('--apply') ? 'apply' : args.includes('--audit') ? 'audit' : null;

  if (!mode) {
    console.error('Usage: node server/scripts/forceResetPrivilegedPasswords.js --audit | --apply');
    console.error('No flag was provided — refusing to run.');
    process.exit(1);
  }

  assertProductionSafety();

  const { connectDB } = require('../config/db');
  require('../models/User');
  require('../models/Session');
  await connectDB();
  assertConnectionIsNotLocal();

  try {
    if (mode === 'audit') {
      await runAudit();
      return;
    }

    const results = await runApply();
    printResults(results);

    const failed = results.filter((r) => r.outcome !== 'reset' && r.outcome !== 'skipped');
    const resetCount = results.filter((r) => r.outcome === 'reset').length;

    console.log(`\nReset: ${resetCount}. Skipped: ${results.filter((r) => r.outcome === 'skipped').length}. Failed: ${failed.length}.`);

    if (resetCount === 0) {
      console.error('\nNo accounts were reset (no valid new passwords were supplied, or targets were ineligible). Nothing to do — exiting non-zero.');
      process.exitCode = 1;
      return;
    }
    if (failed.length > 0) {
      console.error('\nONE OR MORE RESETS FAILED VERIFICATION — see above.');
      process.exitCode = 1;
      return;
    }

    console.log('\nAll requested resets verified successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nForced reset failed:', err.message);
    process.exit(1);
  });
}

module.exports = { TARGETS, NEVER_TOUCH_EMAIL, assertNeverSuperadmin, runAudit, runApply };
