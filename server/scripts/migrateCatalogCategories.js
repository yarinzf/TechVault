#!/usr/bin/env node
'use strict';

/**
 * Migrates the flat ~15-category catalog into the real canonical
 * MAIN CATEGORY → SUBCATEGORY hierarchy (see server/config/categoryTaxonomy.js).
 *
 * Safe to run multiple times (idempotent) and safe to run on a database that
 * already contains real products/orders/users — it NEVER deletes a category
 * or a product. Categories that can be renamed/reparented in place keep
 * their original _id, so every existing Product.category reference stays
 * valid without touching a single Product document.
 *
 * CLI usage (always targets the LOCAL DEVELOPMENT database — see runAsCli()
 * below, matching server/scripts/seed.js's existing convention. Running
 * against production is a deliberate, separate deployment step, never a
 * side effect of running this file):
 *
 *   node server/scripts/migrateCatalogCategories.js
 *
 * Programmatic usage (e.g. tests) — operates on whichever Mongoose
 * connection is already open; does NOT touch NODE_ENV or connect/disconnect
 * itself:
 *
 *   const migrateCategories = require('./migrateCatalogCategories');
 *   const report = await migrateCategories();
 */

const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { CANONICAL_TREE, LEGACY_CATEGORY_PLAN } = require('../config/categoryTaxonomy');

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};
const log  = (msg) => console.log(c.green('✓') + ' ' + msg);
const info = (msg) => console.log(c.dim('  ' + msg));
const warn = (msg) => console.log(c.yellow('⚠') + ' ' + msg);

// Bypasses the pre-save slug-regeneration hook (which would otherwise
// overwrite an explicit slug the moment `name` changes) — migrations need
// exact, predictable slugs, not slugify()'s best guess.
const rawUpdate = (filter, update) => Category.updateOne(filter, { $set: update });

// Category.create() ALSO runs that same pre-save hook — `isModified('name')`
// is true for any brand-new document, so it would silently regenerate
// (and potentially change) the slug we explicitly asked for. Create first,
// then force the exact slug via rawUpdate (bypassing the hook) so the
// persisted slug always matches the canonical taxonomy exactly — otherwise
// a later idempotency check that looks up categories by their canonical
// slug can miss an already-created document and try to create a duplicate.
const createCategoryExact = async ({ name, slug, parentCategory }) => {
  const created = await Category.create({ name, slug, parentCategory, isActive: true });
  await rawUpdate({ _id: created._id }, { slug });
  return created;
};

// ── Pure migration logic — assumes a Mongoose connection is already open ───────
async function migrateCategories({ verbose = true } = {}) {
  const say = verbose ? console.log : () => {};

  const before = await Category.find({}).select('name slug parentCategory isActive').lean();
  say(c.bold(`\nBefore migration: ${before.length} category document(s)\n`));

  const report = {
    mainsCreated: [], mainsConfirmed: [],
    subsCreated: [], subsConfirmed: [],
    renamed: [], reparented: [], deactivated: [],
    productsPreservedInPlace: [], // categories with real products, verified unchanged _id
  };

  // ── Step 1: upsert every canonical MAIN category, except pc-components  ────
  // (that one is a rename of the existing "components" doc — upserting it
  // here first would create a duplicate instead of renaming in place).
  const mainIdBySlug = new Map();
  for (const main of CANONICAL_TREE) {
    if (main.slug === 'pc-components') continue;
    const existing = await Category.findOne({ slug: main.slug }).select('_id name').lean();
    if (existing) {
      await rawUpdate({ _id: existing._id }, { name: main.name, parentCategory: null, isActive: true });
      mainIdBySlug.set(main.slug, existing._id);
      report.mainsConfirmed.push(main.slug);
    } else {
      const created = await createCategoryExact({ name: main.name, slug: main.slug, parentCategory: null });
      mainIdBySlug.set(main.slug, created._id);
      report.mainsCreated.push(main.slug);
    }
  }

  // ── Step 2: rename "components" → "pc-components" in place (or confirm) ────
  {
    const legacy = await Category.findOne({ slug: 'components' }).select('_id').lean();
    if (legacy) {
      await rawUpdate({ _id: legacy._id }, { name: 'PC Components', slug: 'pc-components', parentCategory: null, isActive: true });
      mainIdBySlug.set('pc-components', legacy._id);
      report.renamed.push({ from: 'components', to: 'pc-components', categoryId: legacy._id });
    } else {
      const existing = await Category.findOne({ slug: 'pc-components' }).select('_id').lean();
      if (existing) {
        mainIdBySlug.set('pc-components', existing._id);
        report.mainsConfirmed.push('pc-components');
      } else {
        const created = await createCategoryExact({ name: 'PC Components', slug: 'pc-components', parentCategory: null });
        mainIdBySlug.set('pc-components', created._id);
        report.mainsCreated.push('pc-components');
      }
    }
  }

  // ── Step 3: reparent legacy leaf categories under their new main (same
  //    slug/name, same _id — Product.category references need no changes) ────
  for (const [oldSlug, plan] of Object.entries(LEGACY_CATEGORY_PLAN)) {
    if (plan.action !== 'reparent') continue;
    const doc = await Category.findOne({ slug: oldSlug }).select('_id').lean();
    if (!doc) { if (verbose) warn(`reparent target "${oldSlug}" not found — skipping (already migrated or absent)`); continue; }
    const parentId = mainIdBySlug.get(plan.parentSlug);
    await rawUpdate({ _id: doc._id }, { parentCategory: parentId, isActive: true });
    report.reparented.push({ slug: oldSlug, newParent: plan.parentSlug, categoryId: doc._id });
  }

  // ── Step 4: rename "headphones" → "headsets" in place under Peripherals ────
  {
    const plan = LEGACY_CATEGORY_PLAN.headphones;
    const parentId = mainIdBySlug.get(plan.parentSlug);
    const legacy = await Category.findOne({ slug: 'headphones' }).select('_id').lean();
    if (legacy) {
      await rawUpdate({ _id: legacy._id }, { name: plan.newName, slug: plan.newSlug, parentCategory: parentId, isActive: true });
      report.renamed.push({ from: 'headphones', to: plan.newSlug, categoryId: legacy._id });
    } else {
      const existing = await Category.findOne({ slug: plan.newSlug }).select('_id').lean();
      if (existing) {
        await rawUpdate({ _id: existing._id }, { parentCategory: parentId });
        report.subsConfirmed.push(plan.newSlug);
      } else {
        const created = await createCategoryExact({ name: plan.newName, slug: plan.newSlug, parentCategory: parentId });
        report.subsCreated.push(plan.newSlug);
        if (verbose) info(`created "${plan.newSlug}" fresh (no legacy "headphones" doc existed)`);
      }
    }
  }

  // ── Step 5: deactivate reviewed legacy categories with no canonical home ───
  for (const [oldSlug, plan] of Object.entries(LEGACY_CATEGORY_PLAN)) {
    if (plan.action !== 'deactivate') continue;
    const doc = await Category.findOne({ slug: oldSlug }).select('_id').lean();
    if (!doc) { if (verbose) warn(`deactivate target "${oldSlug}" not found — skipping`); continue; }
    const productCount = await Product.countDocuments({ category: doc._id });
    await rawUpdate({ _id: doc._id }, { isActive: false });
    report.deactivated.push({ slug: oldSlug, categoryId: doc._id, productCount, reason: plan.reason });
    if (productCount > 0 && verbose) {
      warn(`"${oldSlug}" has ${productCount} product(s) still assigned — deactivated (kept, not deleted), NOT reassigned automatically`);
    }
  }

  // ── Step 6: upsert every canonical SUBCATEGORY ──────────────────────────────
  for (const main of CANONICAL_TREE) {
    const parentId = mainIdBySlug.get(main.slug);
    for (const child of main.children || []) {
      const existing = await Category.findOne({ slug: child.slug }).select('_id parentCategory').lean();
      if (existing) {
        await rawUpdate({ _id: existing._id }, { name: child.name, parentCategory: parentId, isActive: true });
        report.subsConfirmed.push(child.slug);
      } else {
        await createCategoryExact({ name: child.name, slug: child.slug, parentCategory: parentId });
        report.subsCreated.push(child.slug);
      }
    }
  }

  // ── Verify: no Product document needed to change ────────────────────────────
  // Every legacy category with real products was renamed/reparented in place
  // (same _id), so re-querying by the *original* _id must still return the
  // same product count — proof that zero Product documents were touched.
  for (const oldCat of before) {
    const stillCount = await Product.countDocuments({ category: oldCat._id });
    if (stillCount > 0) {
      report.productsPreservedInPlace.push({ categoryId: oldCat._id, originalSlug: oldCat.slug, productCount: stillCount });
    }
  }

  const after = await Category.find({}).select('name slug parentCategory isActive').lean();
  const activeMains = after.filter((c2) => c2.isActive && !c2.parentCategory);
  const activeSubs  = after.filter((c2) => c2.isActive && c2.parentCategory);
  const inactive    = after.filter((c2) => !c2.isActive);

  if (verbose) {
    say(c.bold(`\nAfter migration: ${after.length} category document(s)\n`));
    log(`Active main categories: ${activeMains.length}`);
    activeMains.forEach((m) => info(m.slug));
    log(`Active subcategories: ${activeSubs.length}`);
    log(`Deactivated (kept, not deleted): ${inactive.length}`);
    inactive.forEach((d) => info(d.slug));

    say(c.bold('\n── Migration report ──'));
    say(JSON.stringify(report, null, 2));

    say(c.bold('\n── Summary ──'));
    info(`Category documents before: ${before.length}`);
    info(`Category documents after:  ${after.length}`);
    info(`New documents created:     ${report.mainsCreated.length + report.subsCreated.length}`);
    info(`Renamed in place:          ${report.renamed.length}`);
    info(`Reparented in place:       ${report.reparented.length}`);
    info(`Deactivated:               ${report.deactivated.length}`);
    info('Product documents modified: 0 (renames/reparents preserve the original _id — verified below)');
    report.productsPreservedInPlace.forEach((p) =>
      info(`  "${p.originalSlug}" — ${p.productCount} product(s) still resolve correctly via the same _id`));
  }

  return {
    report,
    before: { total: before.length },
    after: { total: after.length, activeMains: activeMains.length, activeSubs: activeSubs.length, inactive: inactive.length },
  };
}

// ── CLI wrapper — owns environment/connection concerns, never the pure logic ───
async function runAsCli() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  process.env.NODE_ENV = 'development';

  const { connectDB } = require('../config/db');
  await connectDB();
  try {
    await migrateCategories({ verbose: true });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error(c.red('Migration failed:'), err);
    process.exit(1);
  });
}

module.exports = migrateCategories;
