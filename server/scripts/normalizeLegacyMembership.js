#!/usr/bin/env node
'use strict';

/**
 * normalizeLegacyMembership.js — LOCAL/DEV-ONLY normalization tooling.
 * NEVER production. Unlike rebuildProductSalesMonthly.js, this script is
 * deliberately restricted to local databases FOREVER, not just "this
 * session" — normalizing membership data with an assumed grant is not a
 * decision safe to make on behalf of real production users.
 *
 * Background: earlier local-dev fixtures (and the original lifetime-
 * membership model) could produce a User with membership.status:'active'
 * but no membership.expiresAt. The old business rule treated that shape as
 * "permanently active" (a grandfather exception). That rule has been
 * removed (see server/models/User.js#isMembershipActive) — a real
 * membership always requires a real plan/startedAt/expiresAt now. Without
 * this normalization, any local account in that legacy shape would
 * silently stop being VIP the moment this code ships.
 *
 * This script finds every LOCAL User in that legacy shape and grants them
 * a real annual term (the most generous real plan) starting from their
 * original joinedAt (or now, if joinedAt is also missing), so local
 * QA/demo accounts keep working exactly as before. It is idempotent — a
 * record that already has a real expiresAt is left untouched.
 *
 * Run manually only:
 *   node server/scripts/normalizeLegacyMembership.js
 *   node server/scripts/normalizeLegacyMembership.js --dry-run
 *
 * If production ever has real users in this legacy shape (pre-dating the
 * plan/expiresAt fields), that requires a deliberate, separate,
 * business-approved migration decision — NOT this script. See the
 * Club/VIP follow-up final report for that recommendation.
 */

const mongoose = require('mongoose');

function assertLocalSafety() {
  const errors = [];
  if (process.env.NODE_ENV === 'production') {
    errors.push('NODE_ENV is "production" — refusing to run');
  }
  const uri = process.env.MONGO_URI_DEV || process.env.MONGO_URI || '';
  if (!uri) {
    errors.push('No MONGO_URI_DEV/MONGO_URI resolved from the environment');
  } else if (!/localhost|127\.0\.0\.1/i.test(uri)) {
    errors.push(`Resolved Mongo URI does not look local: ${uri}`);
  }
  if (errors.length) {
    throw new Error('ABORT — local safety check failed:\n  - ' + errors.join('\n  - '));
  }
}

function assertConnectionIsLocal() {
  const host = mongoose.connection.host || '';
  if (!/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error(`ABORT — connected Mongo host "${host}" does not look local`);
  }
  const dbName = mongoose.connection.name || '';
  if (dbName === 'techvault' || /prod/i.test(dbName)) {
    throw new Error(`ABORT — connected database name "${dbName}" looks like production`);
  }
}

// ── Pure normalization logic — assumes a Mongoose connection is already open ──
async function normalizeLegacyMembership({ dryRun = false, verbose = true } = {}) {
  const say = verbose ? console.log : () => {};
  const User = require('../models/User');
  const { addCalendarTerm } = require('../config/membership');

  say(`Connected DB: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  const legacyUsers = await User.find({
    'membership.status': 'active',
    $or: [{ 'membership.expiresAt': null }, { 'membership.expiresAt': { $exists: false } }],
  }).select('email membership');

  say(`Found ${legacyUsers.length} legacy active-no-expiresAt member(s).`);

  const results = [];
  for (const user of legacyUsers) {
    const startedAt = user.membership.joinedAt || new Date();
    const expiresAt = addCalendarTerm(startedAt, 'annual');

    results.push({
      email: user.email,
      startedAt,
      expiresAt,
    });

    if (!dryRun) {
      user.membership.plan = 'annual';
      user.membership.startedAt = startedAt;
      user.membership.expiresAt = expiresAt;
      if (!user.membership.joinedAt) user.membership.joinedAt = startedAt;
      await user.save();
    }
  }

  return results;
}

// ── CLI wrapper ──────────────────────────────────────────────────────────────
async function runAsCli() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  assertLocalSafety();
  process.env.NODE_ENV = 'development';

  const dryRun = process.argv.includes('--dry-run');

  const { connectDB } = require('../config/db');
  await connectDB();
  try {
    assertConnectionIsLocal();
    const results = await normalizeLegacyMembership({ dryRun });

    console.log(`\n=== ${dryRun ? '[DRY RUN] Would normalize' : 'Normalized'} ${results.length} legacy member(s) ===`);
    results.forEach((r) => {
      console.log(`  ${r.email}: startedAt=${r.startedAt.toISOString().slice(0, 10)} expiresAt=${r.expiresAt.toISOString().slice(0, 10)} (plan=annual)`);
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nnormalizeLegacyMembership failed:', err.message);
    process.exit(1);
  });
}

module.exports = normalizeLegacyMembership;
