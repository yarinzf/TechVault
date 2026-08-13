#!/usr/bin/env node
'use strict';

/**
 * runCategoryMigrationProd.js — ONE-TIME production runner for the canonical
 * category taxonomy migration (server/scripts/migrateCatalogCategories.js).
 *
 * migrateCatalogCategories.js's own CLI wrapper (runAsCli) deliberately
 * forces NODE_ENV=development and connects via MONGO_URI_DEV — the same
 * "local-only by default" convention seed.js uses, so a stray manual
 * invocation can never accidentally touch production. This script is the
 * intentional, separate, production-targeting path: it connects directly
 * via MONGO_URI_PROD (the exact connection string docker-compose.yml
 * already injects into the real backend container — see MONGO_URI_PROD in
 * docker-compose.yml) and calls the pure, already-idempotent/non-destructive
 * migrateCategories() function directly, never touching NODE_ENV.
 *
 * Never run manually outside the dedicated GitHub Actions workflow
 * (.github/workflows/apply-category-migration.yml), which gates this behind
 * an explicit typed confirmation input and a mandatory pre-migration backup.
 *
 * Verifies, in addition to the migration itself:
 *   - total Product count is unchanged (migration must never touch products)
 *   - no Product.category reference points to a category that no longer
 *     exists (every legacy category with real products is renamed/
 *     reparented in place — same _id — never deleted)
 */

const mongoose = require('mongoose');
const migrateCategories = require('./migrateCatalogCategories');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function run() {
  const productCountBefore = await Product.countDocuments({});

  const result = await migrateCategories({ verbose: true });

  const productCountAfter = await Product.countDocuments({});
  const productCountUnchanged = productCountAfter === productCountBefore;

  const categoryIds = new Set(
    (await Category.find({}).select('_id').lean()).map((c) => String(c._id))
  );
  const distinctProductCategoryIds = await Product.distinct('category');
  const orphanedProductCategoryRefs = distinctProductCategoryIds
    .filter((id) => id && !categoryIds.has(String(id)))
    .map(String);

  const summary = {
    ok: productCountUnchanged && orphanedProductCategoryRefs.length === 0,
    productCountBefore,
    productCountAfter,
    productCountUnchanged,
    orphanedProductCategoryRefs,
    migration: result,
  };

  // Single-line, greppable marker so the GitHub Actions step can extract
  // just this JSON payload out of the verbose human-readable log above it.
  console.log('CATEGORY_MIGRATION_RESULT_JSON:' + JSON.stringify(summary));

  if (!productCountUnchanged) {
    throw new Error(
      `Product count changed during migration: before=${productCountBefore} after=${productCountAfter} — this must never happen, migration touches Category only`
    );
  }
  if (orphanedProductCategoryRefs.length > 0) {
    throw new Error(
      `Found ${orphanedProductCategoryRefs.length} Product.category reference(s) pointing to a nonexistent category: ${orphanedProductCategoryRefs.join(', ')}`
    );
  }
}

(async () => {
  const uri = process.env.MONGO_URI_PROD;
  if (!uri) {
    throw new Error('MONGO_URI_PROD is not set in this environment — refusing to run (this script must only ever run inside the production backend container)');
  }
  await mongoose.connect(uri);
  try {
    await run();
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error('CATEGORY_MIGRATION_FAILED:', err.message);
  process.exit(1);
});
