#!/usr/bin/env node
'use strict';

/**
 * stageClearanceDemo.js — LOCAL/DEV-ONLY visual QA helper. NEVER production.
 *
 * Populates the LOCAL dev database with a handful of real Clearance
 * campaigns (using existing, real Product documents — never fake ones) and
 * deliberately staggers their LOCAL Product.stock so the Deals page's
 * Clearance section can be visually reviewed across normal/low/critical
 * stock states at once.
 *
 * Snapshot ordering matters: Product.stock is set to the STARTING value
 * BEFORE the clearance Campaign is created (so clearanceStockSnapshots
 * captures a truthful, higher starting point), and only reduced to the
 * final visible value AFTER — otherwise every progress bar would render
 * as 100% full. See campaign.service.js#buildClearanceSnapshots.
 *
 * Every campaign this script creates is tagged with the fixed marker
 * prefix below, so it can find (and replace) its own prior runs without
 * touching any other real campaign. It deliberately does NOT restore
 * product stock or delete the campaigns when done — the demo data is
 * meant to stay visible on localhost until manually cleaned up.
 *
 * Never wired into seeds, startup, CI, or any deployment/production
 * workflow. Run manually only:
 *
 *   node server/scripts/stageClearanceDemo.js
 */

const mongoose = require('mongoose');

const MARKER = 'LOCAL QA Clearance —';

// Real, existing local products (published, not deleted, real images) —
// picked from 3 different categories so the section looks realistic.
// startingStock is deliberately HIGHER than finalStock (see ordering note
// above); discounts are realistic, spread across ~25-50%.
const DEMO_PLAN = [
  { productId: '6a1e3337b5b8d032255e547a', startingStock: 30, finalStock: 12, discountPercent: 28 }, // AOC 22B2H (monitors)
  { productId: '6a1e3340cca93bb136ab960e', startingStock: 20, finalStock: 4,  discountPercent: 38 }, // Lenovo IdeaCentre 3 07ADA05 (desktops)
  { productId: '6a236698daace60fb4b97a5c', startingStock: 15, finalStock: 1,  discountPercent: 48 }, // JLab JBuds 2 Signature (headsets)
];

function assertLocalSafety() {
  const errors = [];
  if (process.env.NODE_ENV === 'production') {
    errors.push('NODE_ENV is "production" — refusing to run');
  }
  const uri = process.env.MONGO_URI_DEV || process.env.MONGO_URI || '';
  if (!uri) {
    errors.push('No MONGO_URI_DEV/MONGO_URI resolved from the environment');
  } else if (!/localhost|127\.0\.0\.1/i.test(uri)) {
    errors.push(`Resolved Mongo URI does not look local: ${uri}`);
  }
  if (errors.length) {
    throw new Error('ABORT — local safety check failed:\n  - ' + errors.join('\n  - '));
  }
}

function assertConnectionIsLocal() {
  const host = mongoose.connection.host || '';
  if (!/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error(`ABORT — connected Mongo host "${host}" does not look local`);
  }
  const dbName = mongoose.connection.name || '';
  // The real production database is named exactly "techvault" (see
  // MONGO_URI_PROD=mongodb://mongodb:27017/techvault); local dev is
  // "techvault-main". Guard against both a same-name collision and any
  // future db that happens to have "prod" in its name.
  if (dbName === 'techvault' || /prod/i.test(dbName)) {
    throw new Error(`ABORT — connected database name "${dbName}" looks like production`);
  }
}

// ── Pure staging logic — assumes a Mongoose connection is already open ─────
async function stageClearanceDemo({ verbose = true } = {}) {
  const say = verbose ? console.log : () => {};
  const Product  = require('../models/Product');
  const Campaign = require('../models/Campaign');
  const campaignService = require('../services/campaign.service');

  say(`Connected DB: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  // Re-running resets the demo: remove only OUR previously-staged
  // campaigns (by exact marker prefix), never any other real campaign.
  const escapedMarker = MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const deleted = await Campaign.deleteMany({ name: { $regex: '^' + escapedMarker } });
  if (deleted.deletedCount) say(`Removed ${deleted.deletedCount} previously-staged demo campaign(s).`);

  const now = new Date();
  const results = [];

  for (const item of DEMO_PLAN) {
    const product = await Product.findById(item.productId).select('name price stock isPublished isDeleted').lean();
    if (!product) { say(`SKIP — product ${item.productId} not found locally`); continue; }
    if (!product.isPublished || product.isDeleted) { say(`SKIP — "${product.name}" is unpublished/deleted`); continue; }

    const originalStock = product.stock;

    // 1. Stock -> STARTING value first, so the clearance snapshot below
    //    captures a truthful, higher starting point.
    await Product.updateOne({ _id: product._id }, { $set: { stock: item.startingStock } });

    // 2. Create the real clearance campaign — buildClearanceSnapshots reads
    //    Product.stock fresh, i.e. the startingStock just set above.
    const campaign = await campaignService.createCampaign({
      name:            `${MARKER} ${product.name}`,
      discountPercent: item.discountPercent,
      startDate:       now.toISOString(),
      endDate:         new Date(now.getTime() + 30 * 86400000).toISOString(),
      products:        [String(product._id)],
      placement:       'none',
      isClearance:     true,
    });

    // 3. Stock -> the final value we actually want visible on the page.
    await Product.updateOne({ _id: product._id }, { $set: { stock: item.finalStock } });

    results.push({
      product:          product.name,
      productId:        String(product._id),
      originalStock,
      startingSnapshot: campaign.clearanceStockSnapshots.find((s) => String(s.product) === String(product._id))?.startingStock ?? null,
      finalStock:       item.finalStock,
      discountPercent:  item.discountPercent,
      campaignId:       String(campaign._id),
      campaignName:     campaign.name,
    });
  }

  return results;
}

// ── CLI wrapper — owns environment/connection concerns, never the pure logic ──
async function runAsCli() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  assertLocalSafety();
  process.env.NODE_ENV = 'development';

  const { connectDB } = require('../config/db');
  await connectDB();
  try {
    assertConnectionIsLocal();
    const results = await stageClearanceDemo();

    console.log('\n=== Staged LOCAL clearance demo (kept in place — not cleaned up) ===');
    results.forEach((r) => {
      console.log(`\n${r.product}  (${r.productId})`);
      console.log(`  original stock:    ${r.originalStock}`);
      console.log(`  starting snapshot: ${r.startingSnapshot}`);
      console.log(`  final stock:       ${r.finalStock}`);
      console.log(`  discount:          ${r.discountPercent}%`);
      console.log(`  campaign:          ${r.campaignName} (${r.campaignId})`);
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nstageClearanceDemo failed:', err.message);
    process.exit(1);
  });
}

module.exports = stageClearanceDemo;
