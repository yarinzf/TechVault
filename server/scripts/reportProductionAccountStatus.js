#!/usr/bin/env node
'use strict';

/**
 * reportProductionAccountStatus.js — READ-ONLY final-state report for the
 * six accounts covered by the credential-rotation/cleanup tooling, plus the
 * total production user count. Prints nothing but email/role/isActive/
 * exists — no passwords, no hashes, no tokens. Never writes anything.
 *
 * Usage (must be run inside the production application context):
 *   node server/scripts/reportProductionAccountStatus.js
 */

const mongoose = require('mongoose');

const EMAILS = [
  'superadmin@techvault.dev',
  'admin@techvault.dev',
  'warehouse@techvault.dev',
  'alice@example.com',
  'bob@example.com',
  'carol@example.com',
];

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

async function run() {
  const User = mongoose.model('User');
  console.log('\nFinal production account status report (read-only):\n');
  for (const email of EMAILS) {
    const user = await User.findOne({ email }).select('email role isActive').lean();
    console.log(user ? `- ${email}: role=${user.role}, active=${user.isActive}` : `- ${email}: NOT FOUND`);
  }
  const total = await User.countDocuments({});
  console.log(`\nTotal production user count: ${total}`);
}

async function runAsCli() {
  assertProductionSafety();
  const { connectDB } = require('../config/db');
  require('../models/User');
  await connectDB();
  assertConnectionIsNotLocal();
  try {
    await run();
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nReport failed:', err.message);
    process.exit(1);
  });
}

module.exports = { EMAILS, run };
