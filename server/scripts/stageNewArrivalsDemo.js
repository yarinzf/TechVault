#!/usr/bin/env node
'use strict';

/**
 * stageNewArrivalsDemo.js — DEVELOPMENT DEMO REFRESH / STAGING SCRIPT.
 * NOT a migration. NOT idempotent with respect to the persisted timestamps
 * it writes. Manual, developer-invoked only — see "When to run" below.
 *
 * Why this exists: every real product in the current dev DB was inserted by
 * the same bulk-seed run, so every Product.createdAt clusters at one single
 * moment in the past, outside the 14-day New Arrivals window. Under the
 * real, unmodified createdAt-based newness rule, the New Arrivals page would
 * show nothing at all, which makes the feature impossible to demonstrate on
 * seeded dev data.
 *
 * This script re-stamps createdAt on a SMALL, FIXED set of REAL, EXISTING,
 * already-published products so every arrival-label bucket (today /
 * yesterday / N days ago / this week) has real examples to render. It never:
 *   - touches price or compareAtPrice
 *   - touches Campaign data
 *   - creates or duplicates any product
 *   - changes anything outside the picked set's createdAt field
 *
 * Two brands (Finalmouse, Genius) are staged IN FULL — every one of their
 * products in the catalog gets a recent timestamp — so the "New Brands"
 * derivation (earliest catalog product per brand, see
 * product.service.js#getNewBrands) is genuinely true, not just individually
 * relabeled products under an otherwise-old brand.
 *
 * NOT IDEMPOTENT — re-running INTENTIONALLY moves the dates forward:
 * offsets are always computed as `Date.now() - dayOffset`, so the exact
 * same product set gets NEW absolute timestamps every time this runs,
 * anchored to whenever it was last invoked. Running it in October makes the
 * same Finalmouse product "חדש היום" again, in October. This is deliberate
 * — it's what lets the demo be refreshed right before a presentation — but
 * it means the picked product IDs are the only stable thing across runs,
 * not the persisted createdAt values themselves.
 *
 * When to run: only when a developer explicitly wants to (re)populate or
 * refresh the New Arrivals demo data on their local dev database — e.g.
 * before a demo/presentation, or after reseeding the catalog. It is never
 * invoked automatically:
 *   - not required/imported by server.js, app.js, or any startup path
 *   - not wired into `npm run dev` / `npm start`
 *   - not part of `npm run seed` or any other seed script
 *   - not referenced anywhere in production deployment config
 * It only runs when a developer types the command below.
 *
 * CLI usage (targets the LOCAL DEVELOPMENT database only):
 *   node server/scripts/stageNewArrivalsDemo.js
 */

const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Category = require('../models/Category');

const DAY_MS = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

// Entire real catalog for these two brands — deliberately small, genuine
// niche brands (6 products each), so staging "all of it" is truthful rather
// than cherry-picked.
const FINALMOUSE_DAY_OFFSETS = [0, 1, 2, 4, 6, 9];
const GENIUS_DAY_OFFSETS     = [0, 3, 5, 8, 11, 13];

// A handful more from each of the other real categories, purely for section
// variety (label buckets + grid fullness) — these do NOT make ASUS/Samsung/
// etc. "new brands" (they have hundreds of older products too), which is the
// correct, truthful outcome.
//
// Keyboards are deliberately staged at 8/12 days (the "חדש השבוע" / 7–14-day
// label bucket) rather than earlier: they're real catalog products with
// real nonzero salesCount, so the New & Recommended section's genuine
// popularity sort (see product.service.js sortMap.popularity) surfaces them
// on its own merit — this guarantees a 7–14-day example actually renders in
// that section without touching the sort/filter rule or any product's
// salesCount. The Finalmouse/Genius mice all have salesCount 0 (real,
// never-sold niche SKUs), so they wouldn't reliably win that ranking.
const CATEGORY_PLAN = [
  { slug: 'monitors',  dayOffsets: [0, 2] },
  { slug: 'keyboards', dayOffsets: [8, 12] },
  { slug: 'headsets',  dayOffsets: [0] },
  { slug: 'desktops',  dayOffsets: [3] },
];

async function stageNewArrivalsDemo({ verbose = true } = {}) {
  const say = verbose ? console.log : () => {};
  const assignments = [];

  const finalmouse = await Product.find({ brand: 'Finalmouse', isDeleted: false })
    .select('_id name').sort({ _id: 1 }).lean();
  const genius = await Product.find({ brand: 'Genius', isDeleted: false })
    .select('_id name').sort({ _id: 1 }).lean();

  finalmouse.forEach((p, i) => {
    if (i < FINALMOUSE_DAY_OFFSETS.length) assignments.push({ product: p, days: FINALMOUSE_DAY_OFFSETS[i], reason: 'Finalmouse (full brand)' });
  });
  genius.forEach((p, i) => {
    if (i < GENIUS_DAY_OFFSETS.length) assignments.push({ product: p, days: GENIUS_DAY_OFFSETS[i], reason: 'Genius (full brand)' });
  });

  for (const plan of CATEGORY_PLAN) {
    const cat = await Category.findOne({ slug: plan.slug }).select('_id').lean();
    if (!cat) { say(`  (category "${plan.slug}" not found — skipping)`); continue; }
    const products = await Product.find({ category: cat._id, isDeleted: false, isPublished: true, stock: { $gt: 0 } })
      .sort({ _id: 1 }).limit(plan.dayOffsets.length).select('_id name').lean();
    products.forEach((p, i) => assignments.push({ product: p, days: plan.dayOffsets[i], reason: `category:${plan.slug}` }));
  }

  // Mongoose's `timestamps: true` plugin silently strips `createdAt` from
  // any Product.updateOne()/findOneAndUpdate() payload — it only ever sets
  // that field on insert, by design (same class of issue as the slug-
  // regeneration hook worked around in migrateCatalogCategories.js). Bypass
  // Mongoose's query middleware entirely via the native driver collection.
  const rawProducts = mongoose.connection.collection('products');
  for (const { product, days } of assignments) {
    await rawProducts.updateOne({ _id: product._id }, { $set: { createdAt: daysAgo(days) } });
  }

  if (verbose) {
    say(`\nStaged ${assignments.length} real products with demo catalog-added dates:\n`);
    assignments
      .sort((a, b) => a.days - b.days)
      .forEach((a) => say(`  ${String(a.days).padStart(2, ' ')} day(s) ago — ${a.product.name}  [${a.reason}]`));
  }

  return {
    count: assignments.length,
    assignments: assignments.map((a) => ({ id: String(a.product._id), name: a.product.name, days: a.days, reason: a.reason })),
  };
}

async function runAsCli() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  process.env.NODE_ENV = 'development';

  const { connectDB } = require('../config/db');
  await connectDB();
  try {
    await stageNewArrivalsDemo({ verbose: true });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('Staging failed:', err);
    process.exit(1);
  });
}

module.exports = stageNewArrivalsDemo;
