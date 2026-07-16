'use strict';
// One-off, safe, idempotent backfill: propagates the `descriptionHe` values
// added to server/data/mice/*.mice.js (structural normalization of products
// whose `description` was authored in Hebrew) onto the corresponding
// documents in MongoDB.
//
// This script is deliberately separate from server/scripts/addHebrewSamples.js
// (the 5 curated bilingual samples) — it only ever touches `descriptionHe`,
// never `description`, and never claims to fix missing English content.
//
// Usage:
//   node scripts/backfillMouseHebrewDescriptions.js --dry-run   # no writes, full report
//   node scripts/backfillMouseHebrewDescriptions.js             # applies safe updates only

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const slugify = require('slugify');
const Product = require('../models/Product');

const MICE_DIR = path.join(__dirname, '../data/mice');
const HEBREW_RE = /[֐-׿]/;

function computeSlug(name) {
  return slugify(name, { lower: true, strict: true });
}

function loadMiceFiles() {
  return fs.readdirSync(MICE_DIR).filter((f) => f.endsWith('.mice.js'));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGO_URI || process.env.MONGO_URI_DEV || 'mongodb://localhost:27017/techvault-main';
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}${dryRun ? '  [DRY RUN — no writes will be made]' : ''}\n`);

  const files = loadMiceFiles();
  const stats = {
    filesScanned: files.length,
    productsScanned: 0,
    hebrewDetected: 0,
    matchedDb: 0,
    modifiedDb: 0,
    unchangedDb: 0,
    skippedConflicts: 0,
    missingFromDb: 0,
    duplicateIdentifierErrors: 0,
  };

  const perFile = [];
  const problems = []; // { type, detail }

  // Pass 1: build identifier maps across ALL 460 mice source products (not
  // just the Hebrew-contaminated ones) to catch any duplicate slug/SKU
  // collisions in the source data itself before touching the database.
  const slugSeen = new Map(); // computed slug -> [{file, sku, name}]
  const skuSeen = new Map();  // uppercased sku -> [{file, slug, name}]
  const allRecords = [];      // { file, name, sku, description, descriptionHe }

  for (const file of files) {
    const full = path.join(MICE_DIR, file);
    let products;
    try {
      products = require(full);
    } catch (err) {
      problems.push({ type: 'load-error', detail: `${file}: ${err.message}` });
      continue;
    }
    for (const p of products) {
      stats.productsScanned++;
      const sku = p.sku ? String(p.sku).toUpperCase() : null;
      const slug = p.name ? computeSlug(p.name) : null;
      if (slug) {
        const arr = slugSeen.get(slug) || [];
        arr.push({ file, sku, name: p.name });
        slugSeen.set(slug, arr);
      }
      if (sku) {
        const arr = skuSeen.get(sku) || [];
        arr.push({ file, slug, name: p.name });
        skuSeen.set(sku, arr);
      }
      allRecords.push({ file, name: p.name, sku, slug, description: p.description, descriptionHe: p.descriptionHe });
    }
  }

  for (const [slug, entries] of slugSeen) {
    if (entries.length > 1) {
      stats.duplicateIdentifierErrors++;
      problems.push({ type: 'duplicate-slug', detail: `slug="${slug}" used by ${entries.length} products: ${entries.map((e) => `${e.file}/${e.sku}`).join(', ')}` });
    }
  }
  for (const [sku, entries] of skuSeen) {
    if (entries.length > 1) {
      stats.duplicateIdentifierErrors++;
      problems.push({ type: 'duplicate-sku', detail: `sku="${sku}" used by ${entries.length} products: ${entries.map((e) => `${e.file}/${e.slug}`).join(', ')}` });
    }
  }

  // Pass 2: process only the Hebrew-contaminated records (per-file totals).
  const perFileMap = new Map();
  for (const file of files) perFileMap.set(file, { file, scanned: 0, hebrew: 0, matched: 0, modified: 0, unchanged: 0, conflicts: 0, missing: 0 });

  for (const rec of allRecords) {
    const fstat = perFileMap.get(rec.file);
    fstat.scanned++;

    const hasHebrew = HEBREW_RE.test(rec.description || '');
    if (!hasHebrew) continue;
    stats.hebrewDetected++;
    fstat.hebrew++;

    if (!rec.descriptionHe || !rec.descriptionHe.trim()) {
      problems.push({ type: 'source-missing-descriptionHe', detail: `${rec.file} sku=${rec.sku} name="${rec.name}" — Hebrew description with no descriptionHe in source (run the seed-file codemod first)` });
      continue;
    }

    // Identifier resolution: slug (computed the same way the app does on
    // save) preferred; fall back to SKU. Cross-check both when possible.
    let dbProductBySlug = null;
    let dbProductBySku = null;
    if (rec.slug) dbProductBySlug = await Product.findOne({ slug: rec.slug });
    if (rec.sku) dbProductBySku = await Product.findOne({ sku: rec.sku });

    if (dbProductBySlug && dbProductBySku && String(dbProductBySlug._id) !== String(dbProductBySku._id)) {
      stats.duplicateIdentifierErrors++;
      problems.push({ type: 'unsafe-match', detail: `${rec.file} sku=${rec.sku}: slug lookup and SKU lookup resolved to DIFFERENT products — skipped for safety` });
      continue;
    }

    const dbProduct = dbProductBySlug || dbProductBySku;
    if (!dbProduct) {
      stats.missingFromDb++;
      fstat.missing++;
      problems.push({ type: 'missing-from-db', detail: `${rec.file} sku=${rec.sku} name="${rec.name}" slug="${rec.slug}" — not found in database` });
      continue;
    }

    stats.matchedDb++;
    fstat.matched++;

    const existingHe = dbProduct.descriptionHe || '';
    if (existingHe === rec.descriptionHe) {
      stats.unchangedDb++;
      fstat.unchanged++;
      continue;
    }
    if (existingHe.trim() !== '') {
      // Existing DB descriptionHe differs from source — do not overwrite automatically.
      stats.skippedConflicts++;
      fstat.conflicts++;
      problems.push({ type: 'conflict', detail: `${rec.file} sku=${rec.sku} name="${rec.name}" — DB descriptionHe differs from source and is non-empty; left unmodified` });
      continue;
    }

    // Safe to fill in: DB has no descriptionHe yet.
    if (!dryRun) {
      await Product.updateOne(
        { _id: dbProduct._id },
        { $set: { descriptionHe: rec.descriptionHe } },
        { timestamps: false }
      );
    }
    stats.modifiedDb++;
    fstat.modified++;
  }

  for (const f of files) perFile.push(perFileMap.get(f));

  console.log('--- Per-file totals (files with at least one Hebrew description) ---');
  console.table(perFile.filter((f) => f.hebrew > 0));

  console.log('\n--- Summary ---');
  console.table([stats]);

  if (problems.length) {
    console.log('\n--- Problems / conflicts / missing ---');
    for (const p of problems) console.log(`[${p.type}] ${p.detail}`);
  } else {
    console.log('\nNo problems, conflicts, or missing products.');
  }

  await mongoose.disconnect();

  const hasBlockingIssues = stats.duplicateIdentifierErrors > 0;
  if (hasBlockingIssues) {
    console.error('\nExiting with failure status: duplicate/unsafe identifiers detected — review before proceeding.');
    process.exitCode = 1;
  } else if (dryRun) {
    console.log('\nDry run complete. No database writes were made.');
  } else {
    console.log('\nBackfill complete.');
  }
}

main().catch((err) => {
  console.error('Fatal error running backfill:', err);
  process.exitCode = 1;
});

// ─── Production execution (DO NOT RUN YET) ─────────────────────────────────
// See Part 8 of the report for the full production procedure. In short, from
// the deployed server environment (MONGO_URI already pointing at production):
//   node server/scripts/backfillMouseHebrewDescriptions.js --dry-run
//   (review output)
//   node server/scripts/backfillMouseHebrewDescriptions.js
// Never run the non-dry-run form without a fresh backup and explicit approval.
