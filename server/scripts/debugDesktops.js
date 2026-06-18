#!/usr/bin/env node
'use strict';

/**
 * Debug script — desktop product inventory report.
 * Usage: npm run debug:desktops
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
  'lenovo',
  'hp',
  'dell',
  'asus',
  'msi',
];

async function main() {
  await connectDB();

  console.log('');
  console.log(c.bold('══════════════════════════════════════════════════════'));
  console.log(c.bold('  TechVault — Desktop PC Debug Report'));
  console.log(c.bold('══════════════════════════════════════════════════════'));
  console.log('');

  // ── 1. Data files ─────────────────────────────────────────────────────────
  console.log(c.bold('── Data files (server/data/desktops/) ──'));
  let rawTotal = 0, filesFound = 0, filesSkipped = 0;

  for (const brand of BRAND_FILES) {
    try {
      const products = require(`../data/desktops/${brand}.desktops`);
      const count = Array.isArray(products) ? products.length : 0;
      rawTotal += count;
      filesFound++;
      console.log(`  ${c.green('✓')} ${brand.padEnd(16)} ${count} products`);
    } catch {
      filesSkipped++;
      console.log(`  ${c.dim('○')} ${c.dim(brand.padEnd(16) + ' (file not found — skipped)')}`);
    }
  }

  console.log('');
  console.log(`  Files found  : ${c.green(String(filesFound))}`);
  console.log(`  Files missing: ${filesSkipped > 0 ? c.yellow(String(filesSkipped)) : c.dim('0')}`);
  console.log(`  Raw products : ${c.bold(String(rawTotal))}`);

  // ── 2. Category ───────────────────────────────────────────────────────────
  console.log('');
  console.log(c.bold('── MongoDB — Desktops category ──'));
  const cat = await Category.findOne({ slug: 'desktops' }).lean();
  if (!cat) {
    console.log(`  ${c.red('✗')} Category "desktops" NOT FOUND. Run ${c.yellow('npm run seed')} first.`);
  } else {
    console.log(`  ${c.green('✓')} Found: ${cat.name}`);
    console.log(`    _id  : ${c.cyan(String(cat._id))}`);
    console.log(`    slug : ${cat.slug}`);
  }

  // ── 3. Product counts ─────────────────────────────────────────────────────
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

    console.log(`  Total in DB      : ${c.bold(String(total))}`);
    console.log(`  Published        : ${published  > 0 ? c.green(String(published))   : c.red('0')}`);
    console.log(`  Unpublished      : ${unpublished > 0 ? c.yellow(String(unpublished)) : c.dim('0')}`);
    console.log(`  Soft-deleted     : ${deleted     > 0 ? c.red(String(deleted))      : c.dim('0')}`);
    console.log(`  Out of stock     : ${outOfStock  > 0 ? c.yellow(String(outOfStock))  : c.dim('0')}`);
    console.log('');
    console.log(`  ${c.bold('Visible in storefront')}: ${published > 0 ? c.green(String(published)) : c.red('0')}`);

    // ── 4. First 10 SKUs ──────────────────────────────────────────────────
    console.log('');
    console.log(c.bold('── First 10 SKUs in database ──'));
    const first10 = await Product.find({ category: catId }).select('sku name isPublished isDeleted stock').sort({ _id: 1 }).limit(10).lean();
    if (first10.length === 0) {
      console.log(`  ${c.yellow('No desktop products found. Run npm run seed:desktops')}`);
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

    // ── Last 10 SKUs ──────────────────────────────────────────────────────
    console.log('');
    console.log(c.bold('── Last 10 SKUs in database ──'));
    const last10 = await Product.find({ category: catId }).select('sku name isPublished isDeleted stock').sort({ _id: -1 }).limit(10).lean();
    if (last10.length > 0) {
      [...last10].reverse().forEach((p, i) => {
        const flags = [
          !p.isPublished ? c.yellow('[unpublished]') : '',
          p.isDeleted    ? c.red('[deleted]')      : '',
          p.stock === 0  ? c.yellow('[no stock]')  : '',
        ].filter(Boolean).join(' ');
        console.log(`  ${String(i + 1).padStart(2)}. ${c.cyan(p.sku.padEnd(18))} ${p.name.substring(0, 40).padEnd(42)} ${flags}`);
      });
    }

    // ── Missing TV-PC-XXXX SKU ranges ─────────────────────────────────────
    console.log('');
    console.log(c.bold('── Missing TV-PC-XXXX SKU ranges ──'));
    const allSkus = await Product.find({ category: catId }).select('sku').lean();
    const tvPcNums = new Set();
    for (const { sku } of allSkus) {
      const m = sku.match(/^TV-PC-(\d+)$/);
      if (m) tvPcNums.add(parseInt(m[1], 10));
    }
    const maxSku  = tvPcNums.size > 0 ? Math.max(...tvPcNums) : 0;
    const missing = [];
    for (let n = 1; n <= Math.max(maxSku, 179); n++) {
      if (!tvPcNums.has(n)) missing.push(n);
    }
    if (missing.length === 0) {
      console.log(`  ${c.green('✓')} No gaps in TV-PC-0001 → TV-PC-${String(maxSku).padStart(4, '0')}`);
    } else {
      const ranges = [];
      let start = missing[0], end = missing[0];
      for (let i = 1; i < missing.length; i++) {
        if (missing[i] === end + 1) { end = missing[i]; }
        else { ranges.push([start, end]); start = end = missing[i]; }
      }
      ranges.push([start, end]);
      ranges.forEach(([s, e]) => {
        const label = s === e
          ? `TV-PC-${String(s).padStart(4, '0')}`
          : `TV-PC-${String(s).padStart(4, '0')} → TV-PC-${String(e).padStart(4, '0')}`;
        console.log(`  ${c.yellow('○')} Missing: ${label}`);
      });
    }

    // ── Diagnosis ─────────────────────────────────────────────────────────
    console.log('');
    console.log(c.bold('── Diagnosis ──'));
    if (total === 0) {
      console.log(`  ${c.red('✗')} No desktop products in MongoDB.`);
      console.log(`    ${c.yellow('Fix:')} Run ${c.bold('npm run seed:desktops')}`);
    } else if (total < rawTotal) {
      console.log(`  ${c.yellow('⚠')} Only ${total} of ${rawTotal} products are in MongoDB.`);
      console.log(`    ${c.yellow('Fix:')} Run ${c.bold('npm run seed:desktops')} to add missing products.`);
    } else {
      console.log(`  ${c.green('✓')} All ${rawTotal} products appear to be loaded.`);
    }
    if (unpublished > 0) console.log(`  ${c.yellow('⚠')} ${unpublished} product(s) are unpublished.`);
    if (deleted     > 0) console.log(`  ${c.yellow('⚠')} ${deleted} product(s) are soft-deleted.`);
    if (outOfStock  > 0) console.log(`  ${c.yellow('⚠')} ${outOfStock} product(s) have stock=0.`);
  } else {
    console.log(`  ${c.red('✗')} Cannot query products — desktops category is missing.`);
  }

  console.log('');
  console.log(c.bold('══════════════════════════════════════════════════════'));
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('\x1b[31m✗\x1b[0m', e.message); process.exit(1); });
