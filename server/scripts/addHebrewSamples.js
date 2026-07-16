'use strict';
// One-off backfill: propagates the Hebrew sample fields (nameHe,
// shortDescriptionHe, descriptionHe) that live in the seed source-data files
// for 5 representative products onto the corresponding documents in MongoDB,
// by stable slug. Source of truth is the seed data under server/data/**; this
// script only copies those three fields — nothing else — onto existing DB
// documents, so re-seeding a fresh environment and running this backfill
// against an existing one converge on the same values.
//
// Safe to run repeatedly (idempotent: re-running after nothing changed
// upstream produces matchedCount === N, modifiedCount === 0).
//
// Usage:
//   node scripts/addHebrewSamples.js              # local (uses MONGO_URI_DEV)
//   MONGO_URI=<prod-uri> node scripts/addHebrewSamples.js   # see README note
//   at the bottom of this file for the exact production command — do not run
//   it without a fresh backup and deployment approval.

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

// Each entry: the product's stable slug, the seed data file that owns it,
// and the exact `name` used to locate it within that file's array. Hebrew
// content is read from the seed file itself — not duplicated here — so this
// script can never drift out of sync with the source data.
const SAMPLES = [
  {
    slug: 'alienware-aw3423dwf',
    file: '../data/monitors/alienware.monitors.js',
    name: 'Alienware AW3423DWF',
  },
  {
    slug: 'keychron-q1-pro',
    file: '../data/keyboards/keychron.keyboards.js',
    name: 'Keychron Q1 Pro',
  },
  {
    slug: 'logitech-mx-master-3s',
    file: '../data/mice/logitech.mice.js',
    name: 'Logitech MX Master 3S',
  },
  {
    slug: 'msi-mpg-infinite-x2-ryzen-9-7950x-rtx-4090-tower',
    file: '../data/desktops/msi.desktops.js',
    name: 'MSI MPG Infinite X2 Ryzen 9 7950X RTX 4090 Tower',
  },
  {
    slug: 'sony-wh-xb900n-wireless-anc-extra-bass-over-ear-black',
    file: '../data/headphones/sony.headphones.js',
    name: 'Sony WH-XB900N Wireless ANC Extra Bass Over-Ear Black',
  },
];

const HE_FIELDS = ['nameHe', 'shortDescriptionHe', 'descriptionHe'];

function loadSourceRecord({ file, name }) {
  const products = require(file);
  const record = products.find((p) => p.name === name);
  if (!record) {
    throw new Error(`Source product not found: name="${name}" in ${file}`);
  }
  return record;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URI_DEV || 'mongodb://localhost:27017/techvault-main';
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}\n`);

  const results = [];
  let hadError = false;

  for (const sample of SAMPLES) {
    try {
      const source = loadSourceRecord(sample);

      const setPayload = {};
      for (const field of HE_FIELDS) {
        if (source[field] != null && source[field] !== '') setPayload[field] = source[field];
      }
      if (Object.keys(setPayload).length === 0) {
        throw new Error(`Source record for "${sample.name}" has no Hebrew fields set — nothing to backfill`);
      }

      // { timestamps: false } — the Product schema has `timestamps: true`,
      // which would otherwise bump `updatedAt` on every run and make
      // modifiedCount always report 1 even when nothing textual changed.
      // Skipping it here keeps the reported counts truthful for re-run
      // idempotency checks.
      const result = await Product.updateOne(
        { slug: sample.slug },
        { $set: setPayload },
        { timestamps: false }
      );

      if (result.matchedCount === 0) {
        throw new Error(`No product found in database with slug="${sample.slug}" — expected slug is missing`);
      }

      results.push({
        slug: sample.slug,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        fields: Object.keys(setPayload),
      });
      console.log(`✓ ${sample.slug} — matched=${result.matchedCount} modified=${result.modifiedCount} fields=[${Object.keys(setPayload).join(', ')}]`);
    } catch (err) {
      hadError = true;
      console.error(`✗ ${sample.slug} — FAILED: ${err.message}`);
    }
  }

  console.log('\n--- Summary ---');
  console.table(results);

  await mongoose.disconnect();

  if (hadError) {
    console.error('\nOne or more products failed to backfill. See errors above. Exiting with failure status.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error running backfill:', err);
  process.exitCode = 1;
});

// ─── Production execution (DO NOT RUN YET) ─────────────────────────────────
// This script only ever touches the 5 slugs listed in SAMPLES above, only
// ever $sets nameHe/shortDescriptionHe/descriptionHe, and never runs a full
// seed. It is safe to re-run. Before running against production:
//   1. Take a full MongoDB backup (e.g. mongodump) of the production database.
//   2. Get deployment approval.
// Then, from the deployed server environment (with MONGO_URI pointing at the
// production connection string, e.g. already set as an env var there), run:
//
//   node server/scripts/addHebrewSamples.js
//
// (MONGO_URI is read automatically from the environment; no extra flags are
// required. Do not pass --force, --seed, or any other seeding flag — this
// script has none, by design.)
