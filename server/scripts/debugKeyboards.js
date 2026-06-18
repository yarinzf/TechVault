#!/usr/bin/env node
'use strict';

/**
 * Debug script — keyboard product inventory report.
 *
 * Usage:  npm run debug:keyboards
 *
 * Prints:
 *   - brand data files found / skipped
 *   - raw product count from data files
 *   - MongoDB counts (total, published, deleted, out-of-stock)
 *   - category ObjectId for keyboards
 *   - first 10 SKUs in the database
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.NODE_ENV = 'development';

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Category = require('../models/Category');
const Product  = require('../models/Product');

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
};

const BRAND_FILES = [
  'logitech', 'razer', 'corsair', 'steelseries', 'hyperx',
  'keychron', 'redragon', 'asus', 'lenovo', 'hp',
  'dell', 'microsoft', 'apple', 'rapoo', 'coolermaster',
  'a4tech', 'cherry', 'glorious', 'ducky', 'akko',
];

async function main() {
  await connectDB();

  console.log('');
  console.log(c.bold('══════════════════════════════════════════════════════'));
  console.log(c.bold('  TechVault — Keyboard Debug Report'));
  console.log(c.bold('══════════════════════════════════════════════════════'));
  console.log('');

  // ── 1. Data files ────────────────────────────────────────────────────────────
  console.log(c.bold('── Data files (server/data/keyboards/) ──'));
  let rawTotal = 0;
  let filesFound = 0;
  let filesSkipped = 0;

  for (const brand of BRAND_FILES) {
    try {
      const products = require(`../data/keyboards/${brand}.keyboards`);
      const count = Array.isArray(products) ? products.length : 0;
      rawTotal += count;
      filesFound++;
      console.log(`  ${c.green('✓')} ${brand.padEnd(14)} ${count} products`);
    } catch {
      filesSkipped++;
      console.log(`  ${c.dim('○')} ${c.dim(brand.padEnd(14) + ' (file not found — skipped)')}`);
    }
  }

  console.log('');
  console.log(`  Files found  : ${c.green(String(filesFound))}`);
  console.log(`  Files missing: ${filesSkipped > 0 ? c.yellow(String(filesSkipped)) : c.dim('0')}`);
  console.log(`  Raw products : ${c.bold(String(rawTotal))}`);

  // ── 2. Category ──────────────────────────────────────────────────────────────
  console.log('');
  console.log(c.bold('── MongoDB — Keyboards category ──'));
  const cat = await Category.findOne({ slug: 'keyboards' }).lean();
  if (!cat) {
    console.log(`  ${c.red('✗')} Category with slug "keyboards" NOT FOUND.`);
    console.log(`    Run ${c.yellow('npm run seed')} first to create categories.`);
  } else {
    console.log(`  ${c.green('✓')} Found: ${cat.name}`);
    console.log(`    _id  : ${c.cyan(String(cat._id))}`);
    console.log(`    slug : ${cat.slug}`);
  }

  // ── 3. Product counts ────────────────────────────────────────────────────────
  console.log('');
  console.log(c.bold('── MongoDB — Product counts ──'));

  if (cat) {
    const catId = cat._id;

    const [total, published, deleted, outOfStock, unpublished] = await Promise.all([
      Product.countDocuments({ category: catId }),
      Product.countDocuments({ category: catId, isPublished: true,  isDeleted: false }),
      Product.countDocuments({ category: catId, isDeleted: true }),
      Product.countDocuments({ category: catId, isDeleted: false, stock: 0 }),
      Product.countDocuments({ category: catId, isPublished: false, isDeleted: false }),
    ]);

    const visible = published; // what the storefront actually shows by default

    console.log(`  Total in DB      : ${c.bold(String(total))}`);
    console.log(`  Published        : ${published > 0 ? c.green(String(published)) : c.red('0')}`);
    console.log(`  Unpublished      : ${unpublished > 0 ? c.yellow(String(unpublished)) : c.dim('0')}`);
    console.log(`  Soft-deleted     : ${deleted > 0 ? c.red(String(deleted)) : c.dim('0')}`);
    console.log(`  Out of stock     : ${outOfStock > 0 ? c.yellow(String(outOfStock)) : c.dim('0')}`);
    console.log('');
    console.log(`  ${c.bold('Visible in storefront')} (published, not deleted): ${visible > 0 ? c.green(String(visible)) : c.red('0')}`);

    // ── 4. First 10 SKUs ──────────────────────────────────────────────────────
    console.log('');
    console.log(c.bold('── First 10 SKUs in database (by _id) ──'));
    const first10 = await Product
      .find({ category: catId })
      .select('sku name isPublished isDeleted stock')
      .sort({ _id: 1 })
      .limit(10)
      .lean();

    if (first10.length === 0) {
      console.log(`  ${c.yellow('No keyboard products found in MongoDB.')}`);
      console.log(`  Run ${c.yellow('npm run seed:keyboards')} to import brand products.`);
    } else {
      first10.forEach((p, i) => {
        const flags = [
          !p.isPublished ? c.yellow('[unpublished]') : '',
          p.isDeleted    ? c.red('[deleted]')      : '',
          p.stock === 0  ? c.yellow('[no stock]')  : '',
        ].filter(Boolean).join(' ');
        console.log(`  ${String(i + 1).padStart(2)}. ${c.cyan(p.sku.padEnd(18))} ${p.name.substring(0, 40).padEnd(42)} ${flags}`);
      });
    }

    // ── Last 10 SKUs ─────────────────────────────────────────────────────────
    console.log('');
    console.log(c.bold('── Last 10 SKUs in database (by _id) ──'));
    const last10 = await Product
      .find({ category: catId })
      .select('sku name isPublished isDeleted stock')
      .sort({ _id: -1 })
      .limit(10)
      .lean();

    if (last10.length === 0) {
      console.log(`  ${c.dim('(none)')}`);
    } else {
      [...last10].reverse().forEach((p, i) => {
        const flags = [
          !p.isPublished ? c.yellow('[unpublished]') : '',
          p.isDeleted    ? c.red('[deleted]')      : '',
          p.stock === 0  ? c.yellow('[no stock]')  : '',
        ].filter(Boolean).join(' ');
        console.log(`  ${String(i + 1).padStart(2)}. ${c.cyan(p.sku.padEnd(18))} ${p.name.substring(0, 40).padEnd(42)} ${flags}`);
      });
    }

    // ── Missing TV-KB-XXXX SKU ranges ─────────────────────────────────────────
    console.log('');
    console.log(c.bold('── Missing TV-KB-XXXX SKU ranges ──'));
    const allSkus = await Product
      .find({ category: catId })
      .select('sku')
      .lean();
    const tvKbNums = new Set();
    for (const { sku } of allSkus) {
      const m = sku.match(/^TV-KB-(\d+)$/);
      if (m) tvKbNums.add(parseInt(m[1], 10));
    }
    const maxSku = tvKbNums.size > 0 ? Math.max(...tvKbNums) : 0;
    const missing = [];
    for (let n = 1; n <= Math.max(maxSku, 195); n++) {
      if (!tvKbNums.has(n)) missing.push(n);
    }
    if (missing.length === 0) {
      console.log(`  ${c.green('✓')} No gaps in TV-KB-0001 → TV-KB-${String(maxSku).padStart(4, '0')}`);
    } else {
      // Group consecutive ranges
      const ranges = [];
      let start = missing[0], end = missing[0];
      for (let i = 1; i < missing.length; i++) {
        if (missing[i] === end + 1) { end = missing[i]; }
        else { ranges.push([start, end]); start = end = missing[i]; }
      }
      ranges.push([start, end]);
      ranges.forEach(([s, e]) => {
        const label = s === e
          ? `TV-KB-${String(s).padStart(4, '0')}`
          : `TV-KB-${String(s).padStart(4, '0')} → TV-KB-${String(e).padStart(4, '0')}`;
        console.log(`  ${c.yellow('○')} Missing: ${label}`);
      });
    }

    // ── 5. Diagnosis ──────────────────────────────────────────────────────────
    console.log('');
    console.log(c.bold('── Diagnosis ──'));

    if (total === 0) {
      console.log(`  ${c.red('✗')} No keyboard products in MongoDB.`);
      console.log(`    ${c.yellow('Fix:')} Run ${c.bold('npm run seed:keyboards')} to seed all ${rawTotal} brand products.`);
    } else if (total < rawTotal) {
      console.log(`  ${c.yellow('⚠')} Only ${total} of ${rawTotal} brand products are in MongoDB.`);
      if (total <= 10) {
        console.log(`    ${c.yellow('Likely cause:')} Only the sample data from seed.js was loaded (${total} products).`);
        console.log(`    ${c.yellow('Fix:')} Run ${c.bold('npm run seed:keyboards')} to import all brand products.`);
      } else {
        console.log(`    ${c.yellow('Fix:')} Run ${c.bold('npm run seed:keyboards')} to add missing products.`);
        console.log(`    Use ${c.bold('npm run seed:keyboards:force')} to also update existing ones.`);
      }
    } else {
      console.log(`  ${c.green('✓')} All ${rawTotal} brand products appear to be loaded.`);
    }

    if (unpublished > 0) {
      console.log(`  ${c.yellow('⚠')} ${unpublished} product(s) are unpublished — not visible in storefront.`);
    }
    if (deleted > 0) {
      console.log(`  ${c.yellow('⚠')} ${deleted} product(s) are soft-deleted — not visible in storefront.`);
    }
    if (outOfStock > 0) {
      console.log(`  ${c.yellow('⚠')} ${outOfStock} product(s) have stock=0 (still visible unless inStock filter is active).`);
    }
    if (visible > 0 && visible < 7) {
      console.log(`  ${c.yellow('⚠')} Only ${visible} products visible — storefront will show ${visible} item(s).`);
      console.log(`    ${c.yellow('Fix:')} Run ${c.bold('npm run seed:keyboards')} to populate all brand products.`);
    }
  } else {
    console.log(`  ${c.red('✗')} Cannot query products — keyboards category is missing.`);
  }

  console.log('');
  console.log(c.bold('══════════════════════════════════════════════════════'));
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error('\x1b[31m✗\x1b[0m', e.message);
  process.exit(1);
});
