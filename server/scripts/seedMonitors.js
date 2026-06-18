#!/usr/bin/env node
'use strict';

/**
 * Monitor seed — inserts / updates monitor products.
 *
 * Usage:
 *   npm run seed:monitors            # safe: skips existing SKUs
 *   npm run seed:monitors:force      # overwrites existing monitor products
 *
 * Requires `npm run seed` to have been run first (creates the Monitors category).
 * Brand data files: server/data/monitors/<brand>.monitors.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
// Respect NODE_ENV already set in the environment (e.g. Docker: production).
// Default to 'development' only when running locally without an explicit value.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Category = require('../models/Category');
const Product  = require('../models/Product');
const { normalize } = require('../utils/catalog/monitorSpecNormalizer');

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  blue:   (s) => `\x1b[34m${s}\x1b[0m`,
};
const log  = (msg) => console.log(c.green('✓') + ' ' + msg);
const warn = (msg) => console.log(c.yellow('⚠') + ' ' + msg);
const fail = (msg) => console.log(c.red('✗') + ' ' + msg);
const info = (msg) => console.log(c.dim('  ' + msg));
const note = (msg) => console.log(c.blue('ℹ') + ' ' + msg);

const BRAND_FILES = [
  'samsung', 'lg', 'dell', 'asus', 'aoc', 'gigabyte',
  'msi', 'lenovo', 'hp', 'acer', 'philips', 'benq',
  'viewsonic', 'xiaomi', 'apple', 'coolermaster', 'corsair', 'alienware',
];

const loadBrand = (name) => {
  try { return require(`../data/monitors/${name}.monitors`); }
  catch { return []; }
};

function findDuplicateSkus(products) {
  const seen = new Map();
  const dupes = [];
  products.forEach((p, i) => {
    if (!p.sku) return;
    if (seen.has(p.sku)) dupes.push({ sku: p.sku, indices: [seen.get(p.sku), i] });
    else seen.set(p.sku, i);
  });
  return dupes;
}

async function main() {
  await connectDB();

  const cat = await Category.findOne({ slug: 'monitors' }).select('_id').lean();
  if (!cat) {
    fail('Monitors category not found. Run `npm run seed` first to create categories.');
    process.exit(1);
  }

  const rawAll = BRAND_FILES.flatMap(loadBrand);
  if (rawAll.length === 0) {
    warn('No monitor data files found in server/data/monitors/. Add brand files and re-run.');
    process.exit(0);
  }

  const force = process.argv.includes('--force');
  console.log('');
  console.log(c.bold(`Loaded ${rawAll.length} raw product(s) from ${BRAND_FILES.length} brand file(s).`));

  const dupes = findDuplicateSkus(rawAll);
  if (dupes.length > 0) {
    console.log('');
    fail('Duplicate SKUs detected — fix before seeding:');
    dupes.forEach(d => fail(`  ${d.sku} appears at indices ${d.indices.join(' and ')}`));
    process.exit(1);
  }

  console.log('');
  note('Running normalizer…');
  let normOk = 0, normFailed = 0;
  const validProducts = [];
  const validationErrors = [];

  for (const raw of rawAll) {
    const result = normalize(raw, cat._id);
    if (result.valid) {
      validProducts.push(result.product);
      normOk++;
      result.warns.forEach(w => warn(`  [${raw.sku}] ${w}`));
    } else {
      normFailed++;
      validationErrors.push({ sku: raw.sku || '?', errors: result.errors });
      result.errors.forEach(e => fail(`  [${raw.sku || '?'}] ${e}`));
    }
  }

  if (normFailed > 0) {
    console.log('');
    warn(`${normFailed} product(s) failed validation and will be skipped.`);
  }
  if (validProducts.length === 0) {
    fail('No valid products to seed after normalization.');
    process.exit(1);
  }

  console.log('');
  console.log(c.bold(`Seeding ${validProducts.length} product(s)…`));
  console.log('');

  let created = 0, skipped = 0, updated = 0, failed = 0, slugConflict = 0;

  for (const data of validProducts) {
    try {
      const existing = await Product.findOne({ sku: data.sku }).select('_id').lean();
      if (existing) {
        if (force) {
          const { sku, slug, ...upd } = data;
          await Product.findOneAndUpdate({ _id: existing._id }, { $set: upd });
          updated++;
          info(`Updated  ${data.sku} — ${data.name}`);
        } else {
          skipped++;
        }
      } else {
        const product = new Product(data);
        await product.save();
        created++;
        info(`Created  ${data.sku} — ${data.name}`);
      }
    } catch (e) {
      if (e.code === 11000 && e.message && e.message.includes('slug')) {
        slugConflict++;
        warn(`Skipped  ${data.sku} — ${data.name}: slug already exists`);
      } else {
        failed++;
        fail(`Failed   ${data.sku} — ${data.name}: ${e.message}`);
      }
    }
  }

  console.log('');
  console.log(c.bold('─── Monitor Seed Summary ──────────────────────────────'));
  note(`${rawAll.length} raw products loaded`);
  if (normFailed > 0) {
    fail(`${normFailed} product(s) invalid (skipped)`);
    validationErrors.forEach(({ sku, errors }) => info(`  ${sku}: ${errors.join(', ')}`));
  }
  log(`${normOk} product(s) passed validation`);
  log(`${created} product(s) created`);
  if (updated      > 0) log(`${updated} product(s) updated`);
  if (skipped      > 0) warn(`${skipped} product(s) skipped (SKU exists — use --force to update)`);
  if (slugConflict > 0) warn(`${slugConflict} product(s) skipped: slug already exists`);
  if (failed       > 0) fail(`${failed} product(s) failed DB insert/update`);
  console.log(c.bold('───────────────────────────────────────────────────────'));
  console.log('');

  await mongoose.disconnect();
  process.exit(failed > 0 || normFailed > 0 ? 1 : 0);
}

main().catch(e => { fail(e.message); process.exit(1); });
