#!/usr/bin/env node
'use strict';

/**
 * rotateProductionCredentials.js — ONE-TIME PRODUCTION PASSWORD ROTATION.
 *
 * Rotates the password on a fixed, explicit list of demo/seed accounts
 * whose credentials were historically shared publicly (LinkedIn) — the
 * three privileged accounts (superadmin/admin/warehouse) plus the three
 * seeded customer demo accounts (see server/scripts/seed.js#USERS for the
 * dev-only seed values — intentionally never repeated in this file).
 * Removing the credential *hints* from the frontend UI (an earlier change)
 * never touched these already-existing MongoDB documents — password
 * hashes are DATA, not code, and redeploying application code never
 * modifies existing stored data. This script is the first thing that has
 * ever actually changed these specific password values in production.
 *
 * ─── What this touches ──────────────────────────────────────────────────
 * ONLY the `password` field, on ONLY the explicit emails in TARGETS below,
 * and ONLY when the caller supplies a new value for that exact target via
 * an environment variable. Nothing else — not role, not isActive, not
 * membership, not orders, not any other field. Never creates or deletes a
 * user. A target whose env vars are unset is simply skipped, not rotated.
 *
 * ─── How hashing works ──────────────────────────────────────────────────
 * Uses the REAL application hashing path: fetches the actual Mongoose User
 * document, assigns the new plaintext to `user.password`, and calls
 * `user.save()` — this is the exact same `pre('save')` bcrypt hook
 * (server/models/User.js, SALT_ROUNDS=12) every real password
 * change/register/reset in this app goes through. No hash is ever computed
 * or written by hand, and no plaintext password is ever written to
 * MongoDB — only the resulting bcrypt hash, via the model's own logic.
 *
 * `password`, `role`, `isActive`, and `email` are long-existing User schema
 * fields (present since this app's very first deployed version) — unlike
 * the Campaign.title incident, there is no risk of the currently-running
 * container's schema not knowing about them, so this script safely uses
 * the real Mongoose Model (not a raw-collection workaround).
 *
 * ─── Old-password verification — no value hardcoded in this file ────────
 * To prove a rotation actually took effect, the script self-checks that
 * the account's PREVIOUS password no longer authenticates. That old value
 * is never stored in this file (or anywhere else in tracked source) — it
 * arrives, per target, via its own `oldEnvVar` environment variable, set
 * only at the CI/CD secret level. A target is skipped unless BOTH its new-
 * and old-password env vars are supplied — the old value is required
 * because without it there is no way to prove the rotation had any effect.
 *
 * ─── Session invalidation ───────────────────────────────────────────────
 * After a successful rotation, calls the app's own `authService.logoutAll`
 * for that user — the exact same logic `/auth/logout-all` uses — which
 * revokes every active refresh Session and clears the legacy `refreshToken`
 * field. This blocks anyone from silently minting new access tokens with
 * an old session. It does NOT invalidate an access token already issued
 * and still inside its own (15-minute) expiry — that's an inherent
 * property of this app's stateless-JWT design, not something a DB-level
 * script can retroactively revoke; the exposure window for any already-
 * issued access token is therefore at most 15 minutes.
 *
 * ─── Never logged, never written in plaintext ───────────────────────────
 * Both old and new passwords arrive ONLY via environment variables
 * (GitHub Actions secrets, at the process level) — never as a CLI argument
 * (which would be visible via `ps`/shell history), never read from a file,
 * never echoed, console.log'd, or included in any report. Only
 * email/role/isActive/outcome are ever printed. Thrown errors never
 * interpolate a password value.
 *
 * ─── Hard safety model (mirrors the other production scripts) ──────────
 *   - Refuses to run unless NODE_ENV === "production".
 *   - Refuses to run if the resolved Mongo URI/host is localhost/127.0.0.1.
 *   - Refuses to run without ROTATE_CONFIRM=TECHVAULT_PRODUCTION set.
 *   - --audit is fully read-only: prints email/role/isActive/exists for
 *     every target, touches nothing, needs no passwords at all.
 *   - --apply only rotates a target whose newEnvVar AND oldEnvVar are both
 *     set, where the new value also meets a minimum strength floor; every
 *     other target is reported as skipped, not silently ignored.
 *   - Before writing, verifies the target's CURRENT role matches the
 *     expected role recorded in TARGETS — a real safety check against
 *     rotating the wrong account if a demo email were ever repurposed.
 *
 * Usage (must be run inside the production application context, e.g. via
 * `docker compose exec -T backend node server/scripts/rotateProductionCredentials.js`):
 *   node server/scripts/rotateProductionCredentials.js --audit
 *   node server/scripts/rotateProductionCredentials.js --apply
 */

const mongoose = require('mongoose');

const REQUIRED_CONFIRM_VALUE = 'TECHVAULT_PRODUCTION';
const MIN_PASSWORD_LENGTH = 12;

// Fixed, explicit target list — see file header. `newEnvVar` names the
// process environment variable this script reads the NEW password from;
// `oldEnvVar` names the one it reads the CURRENT (about-to-be-rotated-away)
// password from, used only to prove the old password stops working. Both
// values are supplied only via CI/CD secrets — neither is ever stored here.
// A target is skipped entirely unless both of its env vars are set.
const TARGETS = [
  { email: 'superadmin@techvault.dev', expectedRole: 'superadmin', newEnvVar: 'ROTATE_SUPERADMIN_NEW_PASSWORD', oldEnvVar: 'ROTATE_SUPERADMIN_OLD_PASSWORD' },
  { email: 'admin@techvault.dev',      expectedRole: 'admin',      newEnvVar: 'ROTATE_ADMIN_NEW_PASSWORD',      oldEnvVar: 'ROTATE_ADMIN_OLD_PASSWORD' },
  { email: 'warehouse@techvault.dev',  expectedRole: 'warehouse',  newEnvVar: 'ROTATE_WAREHOUSE_NEW_PASSWORD',  oldEnvVar: 'ROTATE_WAREHOUSE_OLD_PASSWORD' },
  { email: 'alice@example.com',        expectedRole: 'user',       newEnvVar: 'ROTATE_ALICE_NEW_PASSWORD',      oldEnvVar: 'ROTATE_ALICE_OLD_PASSWORD' },
  { email: 'bob@example.com',          expectedRole: 'user',       newEnvVar: 'ROTATE_BOB_NEW_PASSWORD',        oldEnvVar: 'ROTATE_BOB_OLD_PASSWORD' },
  { email: 'carol@example.com',        expectedRole: 'user',       newEnvVar: 'ROTATE_CAROL_NEW_PASSWORD',      oldEnvVar: 'ROTATE_CAROL_OLD_PASSWORD' },
];

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
  if (process.env.ROTATE_CONFIRM !== REQUIRED_CONFIRM_VALUE) {
    errors.push(`ROTATE_CONFIRM must equal exactly "${REQUIRED_CONFIRM_VALUE}"`);
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
  console.log('\nAudit — production account status (read-only, no writes):\n');
  for (const t of TARGETS) {
    const user = await User.findOne({ email: t.email }).select('email role isActive createdAt').lean();
    if (!user) {
      console.log(`- ${t.email}: NOT FOUND in production`);
      continue;
    }
    const roleOk = user.role === t.expectedRole;
    console.log(
      `- ${t.email}: role=${user.role}${roleOk ? '' : ` (EXPECTED ${t.expectedRole} — MISMATCH, would be skipped)`}, ` +
      `active=${user.isActive}, createdAt=${new Date(user.createdAt).toISOString()}`
    );
  }
  console.log('\nNo passwords were read or printed. No data was modified.');
}

// ─── Apply ──────────────────────────────────────────────────────────────────
async function runApply() {
  const User = mongoose.model('User');
  const authService = require('../services/auth.service');

  const results = [];

  for (const t of TARGETS) {
    const newPassword = process.env[t.newEnvVar];
    const oldPassword = process.env[t.oldEnvVar];

    if (!newPassword) {
      results.push({ email: t.email, outcome: 'skipped', reason: `${t.newEnvVar} not set` });
      continue;
    }
    if (!oldPassword) {
      results.push({ email: t.email, outcome: 'skipped', reason: `${t.oldEnvVar} not set — required to verify the old password is actually rejected after rotation` });
      continue;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      results.push({ email: t.email, outcome: 'skipped', reason: `new password shorter than ${MIN_PASSWORD_LENGTH} chars` });
      continue;
    }
    if (newPassword === oldPassword) {
      results.push({ email: t.email, outcome: 'skipped', reason: 'new password matches the old password supplied for verification' });
      continue;
    }

    const user = await User.findOne({ email: t.email }).select('+password role isActive');
    if (!user) {
      results.push({ email: t.email, outcome: 'skipped', reason: 'account not found in production' });
      continue;
    }
    if (user.role !== t.expectedRole) {
      results.push({ email: t.email, outcome: 'skipped', reason: `role is "${user.role}", expected "${t.expectedRole}" — refusing to rotate` });
      continue;
    }

    // Real application hashing path — see file header.
    user.password = newPassword;
    await user.save();

    // In-process self-check only — never over the network, never logged.
    const oldStillWorks = await user.comparePassword(oldPassword);
    const newWorks = await user.comparePassword(newPassword);

    let sessionsRevoked = 0;
    try {
      const before = await mongoose.model('Session').countDocuments({ user: user._id, isActive: true });
      await authService.logoutAll(user._id);
      sessionsRevoked = before;
    } catch (err) {
      results.push({ email: t.email, outcome: 'rotated_session_revoke_failed', role: user.role, isActive: user.isActive, error: err.message });
      continue;
    }

    if (oldStillWorks || !newWorks) {
      // Should be cryptographically impossible given the above, but this is
      // exactly the class of silent failure this script exists to catch —
      // never report success without direct proof.
      results.push({
        email: t.email, outcome: 'FAILED_VERIFICATION', role: user.role, isActive: user.isActive,
        reason: `oldStillWorks=${oldStillWorks} newWorks=${newWorks}`,
      });
      continue;
    }

    results.push({
      email: t.email, outcome: 'rotated', role: user.role, isActive: user.isActive, sessionsRevoked,
    });
  }

  return results;
}

function printResults(results) {
  console.log('\nRotation results (no passwords or hashes shown):\n');
  for (const r of results) {
    if (r.outcome === 'rotated') {
      console.log(`- ${r.email}: ROTATED — role=${r.role}, active=${r.isActive}, sessionsRevoked=${r.sessionsRevoked}, old password verified rejected, new password verified accepted`);
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
    console.error('Usage: node server/scripts/rotateProductionCredentials.js --audit | --apply');
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

    const failed = results.filter((r) => r.outcome !== 'rotated' && r.outcome !== 'skipped');
    const rotatedCount = results.filter((r) => r.outcome === 'rotated').length;

    console.log(`\nRotated: ${rotatedCount}. Skipped: ${results.filter((r) => r.outcome === 'skipped').length}. Failed: ${failed.length}.`);

    if (rotatedCount === 0) {
      console.error('\nNo accounts were rotated (no valid new passwords were supplied). Nothing to do — exiting non-zero so this is never mistaken for a successful run.');
      process.exitCode = 1;
      return;
    }
    if (failed.length > 0) {
      console.error('\nONE OR MORE ROTATIONS FAILED VERIFICATION — see above.');
      process.exitCode = 1;
      return;
    }

    console.log('\nAll requested rotations verified successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nRotation failed:', err.message);
    process.exit(1);
  });
}

module.exports = { TARGETS, runAudit, runApply };
