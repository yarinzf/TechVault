#!/usr/bin/env node
'use strict';

/**
 * Removes mock/seed products from the database, keeping only real imported
 * products (currently: TV-KB-* keyboards).
 *
 * Safe: touches only the products collection.
 *
 * Usage (local dev):
 *   node server/scripts/cleanupMockProducts.js
 *   npm run cleanup:mock-products
 *
 * Usage (Docker):
 *   docker compose exec backend node server/scripts/cleanupMockProducts.js
 *
 * Environment:
 *   Respects NODE_ENV — uses MONGO_URI_DEV (development) or
 *   MONGO_URI_PROD (production). In Docker, NODE_ENV=production and
 *   MONGO_URI_PROD are already injected by docker-compose.yml.
 */

const path = require('path');

// Load .env for local dev; in Docker, env vars are already present.
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { connectDB } = require('../config/db');
const mongoose      = require('mongoose');
const Product       = require('../models/Product');

// ─── Console colours ─────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
};
const log  = (msg) => console.log(c.green('✓') + ' ' + msg);
const warn = (msg) => console.log(c.yellow('⚠') + ' ' + msg);
const fail = (msg) => console.log(c.red('✗') + ' ' + msg);
const info = (msg) => console.log(c.dim('  ' + msg));
const head = (msg) => console.log('\n' + c.bold(c.cyan(msg)));

// ─── SKU prefixes that belong to real imported products ───────────────────────
// Extend this list when new real product categories are imported.
const REAL_PREFIXES = [
  'TV-KB-',   // Keyboards (KSP-style import)
];

const buildFilter = () => {
  // Match any product whose SKU does NOT start with a real prefix.
  const exclude = REAL_PREFIXES.map((p) => new RegExp(`^${p}`, 'i'));
  return { sku: { $not: { $in: exclude } } };
};

const run = async () => {
  head('TechVault — Mock Product Cleanup');

  const env = process.env.NODE_ENV || 'development';
  info(`NODE_ENV : ${env}`);
  info(`Keeping  : ${REAL_PREFIXES.join(', ')}`);

  await connectDB();

  const filter = buildFilter();

  const totalBefore  = await Product.countDocuments({});
  const mockCount    = await Product.countDocuments(filter);
  const keepCount    = totalBefore - mockCount;

  head('Before');
  info(`Total products   : ${totalBefore}`);
  info(`Real (keeping)   : ${keepCount}  (${REAL_PREFIXES.join(', ')})`);
  info(`Mock (deleting)  : ${mockCount}`);

  if (mockCount === 0) {
    log('Nothing to delete — database is already clean.');
    await mongoose.connection.close();
    return;
  }

  // ── Preview first 10 SKUs that will be removed ─────────────────────────────
  const preview = await Product.find(filter, 'sku name').limit(10).lean();
  head('Sample of products to be deleted');
  preview.forEach((p) => info(`  ${p.sku.padEnd(20)} ${p.name}`));
  if (mockCount > 10) info(`  … and ${mockCount - 10} more`);

  // ── Delete ──────────────────────────────────────────────────────────────────
  head('Deleting');
  const result = await Product.deleteMany(filter);

  const totalAfter = await Product.countDocuments({});

  head('After');
  info(`Products deleted : ${result.deletedCount}`);
  info(`Products remain  : ${totalAfter}`);

  if (result.deletedCount === mockCount) {
    log(`Done — removed ${result.deletedCount} mock product(s), ${totalAfter} real product(s) remain.`);
  } else {
    warn(`Expected to delete ${mockCount} but deleted ${result.deletedCount}. Check for concurrent writes.`);
  }

  await mongoose.connection.close();
};

run().catch((err) => {
  fail(`Fatal: ${err.message}`);
  process.exit(1);
});
