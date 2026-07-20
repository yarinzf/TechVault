'use strict';
// Narrowly-scoped production backfill for the monitor catalog Hebrew localization
// (Batches 01-07, commit 6a28e0ae3dba5705e5f3ad9b36551efa767b5fd8).
//
// Loads all server/data/monitors/*.monitors.js files (313 products across 18
// brand files), matches each to its production document by SKU, verifies the
// computed slug agrees before touching anything, and updates ONLY:
//   - descriptionHe
//   - shortDescriptionHe
//   - nameHe (only if the source record actually defines it — none currently do)
// Every other field (price, stock, images, specs, tags, publication state,
// timestamps, sales stats, etc.) is left untouched. Uses {timestamps:false} so
// updatedAt is not bumped by this maintenance write.
//
// Usage:
//   node scripts/backfillMonitorHebrew.js --dry-run              # safe, no writes, any environment
//   node scripts/backfillMonitorHebrew.js --execute-production   # real writes, PRODUCTION ONLY
//
// Safety:
//   - Refuses to run the real (non-dry-run) path unless --execute-production
//     is explicitly passed AND NODE_ENV=production AND the resolved URI's
//     database name is exactly "techvault" (the configured production DB name
//     per docker-compose.yml MONGO_URI_PROD). This prevents accidentally
//     pointing this script at a dev/staging database with the production flag,
//     or at production without the flag.
//   - Never logs the raw connection string; only host + db name are printed,
//     with any userinfo (user:pass@) stripped first.
//   - Exits non-zero if: any SKU is missing from the DB, any slug mismatch is
//     found, duplicate SKUs exist in the source catalog, or the source catalog
//     count is not exactly 313.
//   - Never uses replaceOne / deleteMany / drop — only a scoped $set updateOne
//     per matched document, restricted to the two (or three) Hebrew fields.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const slugify = require('slugify');
const Product = require('../models/Product');

const EXPECTED_TOTAL = 313;
const MONITOR_DIR = path.join(__dirname, '..', 'data', 'monitors');

function redactUri(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
}

function computeSlug(name) {
  return slugify(name, { lower: true, strict: true });
}

function loadCatalog() {
  const files = fs.readdirSync(MONITOR_DIR).filter((f) => f.endsWith('.monitors.js'));
  const all = [];
  for (const file of files) {
    const products = require(path.join(MONITOR_DIR, file));
    for (const p of products) all.push({ file, ...p });
  }
  return { files, all };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const executeProduction = process.argv.includes('--execute-production');

  if (!dryRun && !executeProduction) {
    console.error('Refusing to run: pass either --dry-run or --execute-production explicitly.');
    process.exitCode = 1;
    return;
  }

  const uri = process.env.MONGO_URI_PROD || process.env.MONGO_URI || process.env.MONGO_URI_DEV;
  if (!uri) {
    console.error('Refusing to run: no MONGO_URI_PROD / MONGO_URI / MONGO_URI_DEV resolved in this environment.');
    process.exitCode = 1;
    return;
  }

  if (executeProduction) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Refusing --execute-production: NODE_ENV is "${process.env.NODE_ENV}", expected "production".`);
      process.exitCode = 1;
      return;
    }
    let dbName;
    try {
      dbName = new URL(uri).pathname.replace(/^\//, '');
    } catch {
      console.error('Refusing --execute-production: could not parse database name from URI.');
      process.exitCode = 1;
      return;
    }
    if (dbName !== 'techvault') {
      console.error(`Refusing --execute-production: resolved database name is "${dbName}", expected exactly "techvault".`);
      process.exitCode = 1;
      return;
    }
  }

  const { files, all } = loadCatalog();

  const skuCounts = new Map();
  for (const p of all) skuCounts.set(p.sku, (skuCounts.get(p.sku) || 0) + 1);
  const duplicateSkus = [...skuCounts.entries()].filter(([, c]) => c > 1);

  console.log(`Monitor source files: ${files.length}`);
  console.log(`Source catalog total: ${all.length} (expected ${EXPECTED_TOTAL})`);
  console.log(`Duplicate source SKUs: ${duplicateSkus.length}`);

  if (all.length !== EXPECTED_TOTAL) {
    console.error(`Refusing to run: source catalog count is ${all.length}, expected exactly ${EXPECTED_TOTAL}.`);
    process.exitCode = 1;
    return;
  }
  if (duplicateSkus.length > 0) {
    console.error('Refusing to run: duplicate source SKUs found:', duplicateSkus.map(([sku]) => sku));
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);
  const conn = mongoose.connection;
  console.log(`Connected: host=${conn.host} db=${conn.name} (uri redacted: ${redactUri(uri)})`);
  console.log(dryRun ? 'Mode: DRY RUN — no writes will be made\n' : 'Mode: EXECUTE PRODUCTION — writes will be made\n');

  const stats = { scanned: 0, matched: 0, missing: 0, slugMismatch: 0, wouldModify: 0, modified: 0, unchanged: 0 };
  const problems = [];

  for (const p of all) {
    stats.scanned++;
    const dbProduct = await Product.findOne({ sku: p.sku });
    if (!dbProduct) {
      stats.missing++;
      problems.push(`MISSING: ${p.file} sku=${p.sku} name="${p.name}"`);
      continue;
    }

    const expectedSlug = computeSlug(p.name);
    if (dbProduct.slug !== expectedSlug) {
      stats.slugMismatch++;
      problems.push(`SLUG MISMATCH: ${p.file} sku=${p.sku} db="${dbProduct.slug}" expected="${expectedSlug}"`);
      continue;
    }

    stats.matched++;

    const update = {};
    if (dbProduct.descriptionHe !== p.descriptionHe) update.descriptionHe = p.descriptionHe;
    if (dbProduct.shortDescriptionHe !== p.shortDescriptionHe) update.shortDescriptionHe = p.shortDescriptionHe;
    if (p.nameHe && dbProduct.nameHe !== p.nameHe) update.nameHe = p.nameHe;

    if (Object.keys(update).length === 0) {
      stats.unchanged++;
      continue;
    }

    stats.wouldModify++;
    if (dryRun) continue;

    await Product.updateOne({ _id: dbProduct._id }, { $set: update }, { timestamps: false });
    stats.modified++;
  }

  console.log('\n--- Summary ---');
  console.table([stats]);

  if (problems.length) {
    console.log('\n--- Problems ---');
    for (const pr of problems) console.log(pr);
  } else {
    console.log('\nNo problems.');
  }

  await mongoose.disconnect();

  const hasBlockingIssues = stats.missing > 0 || stats.slugMismatch > 0;
  if (hasBlockingIssues) {
    console.error('\nExiting with failure status: missing SKUs or slug mismatches detected.');
    process.exitCode = 1;
  } else if (dryRun) {
    console.log(`\nDry run complete. Would modify: ${stats.wouldModify}. No writes were made.`);
  } else {
    console.log(`\nExecution complete. Modified: ${stats.modified}. Unchanged: ${stats.unchanged}.`);
  }
}

main().catch((err) => {
  console.error('Fatal error running backfill:', err.message);
  process.exitCode = 1;
});
