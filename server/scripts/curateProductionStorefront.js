#!/usr/bin/env node
'use strict';

/**
 * curateProductionStorefront.js — ONE-TIME PRODUCTION STOREFRONT CURATION.
 *
 * Populates the real production Deals page (via real Campaign documents)
 * and the real production New Arrivals page (via Product.createdAt only)
 * using EXCLUSIVELY products that already exist in the production catalog.
 *
 * This script NEVER creates, clones, or deletes a Product. It only ever:
 *   (a) creates new Campaign documents referencing existing Product _ids, and
 *   (b) updates the `createdAt` field on a small, explicitly-selected set of
 *       existing Product documents (nothing else on those documents changes).
 *
 * Hard safety model:
 *   - Refuses to run unless NODE_ENV === "production".
 *   - Refuses to run if the resolved Mongo URI/host is localhost/127.0.0.1.
 *   - Refuses to run without PRODUCTION_CURATION_CONFIRM=TECHVAULT_PRODUCTION
 *     set in the environment (never hardcoded, never stored in .env).
 *   - Refuses to mutate anything unless invoked with --apply. The default
 *     (no flag) and --dry-run print a full plan and touch nothing.
 *   - Idempotent: every campaign this script creates is tagged with a fixed
 *     marker prefix in its `name`. If a marker campaign already exists,
 *     --apply refuses to run again (no --force override implemented here on
 *     purpose — a second run must be a deliberate, reviewed code change, not
 *     a flag flip) and reports that curation was already applied.
 *   - Asserts productCountBefore === productCountAfter and that zero new
 *     Product documents were created, both in a dry-run preview and as a
 *     hard post-write invariant in --apply mode.
 *
 * Usage (must be run inside the production application context, e.g. via
 * `docker compose exec -T backend node server/scripts/curateProductionStorefront.js`):
 *   node server/scripts/curateProductionStorefront.js --dry-run
 *   node server/scripts/curateProductionStorefront.js --apply
 *
 * With no flag, or any unrecognized flag, the script prints usage and exits
 * non-zero without touching the database.
 */

const mongoose = require('mongoose');

const CURATION_MARKER = 'Production Curation 2026';
const REQUIRED_CONFIRM_VALUE = 'TECHVAULT_PRODUCTION';

const MIN_CAMPAIGNS = 25;
const MAX_CAMPAIGNS = 40;
const MIN_ARRIVALS  = 24;
const MAX_ARRIVALS  = 30;
const MAX_DISCOUNT_PERCENT = 25;
const SMALL_BRAND_MAX_PRODUCTS = 8; // "entire brand fits inside the New Arrivals budget"
const MAX_NEW_BRANDS = 4;

const DAY_MS = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

// ─── Deterministic distribution helpers ─────────────────────────────────────
// Every one of these is a pure function of (index, total) — no Math.random(),
// no Date-seeded values beyond "now" itself — so a --dry-run and a
// subsequent --apply over the same eligible-product set always produce the
// IDENTICAL plan. That's what makes the dry-run a real preview, not a guess.

// ~25% 5–9%, ~40% 10–14%, ~25% 15–19%, ~10% 20–25% — spread within each
// bucket (not a single repeated value) using the index's position inside
// its bucket.
function pickDiscountPercent(index, total) {
  const bucketed = [
    { start: 0.00, end: 0.25, min: 5,  max: 9  },
    { start: 0.25, end: 0.65, min: 10, max: 14 },
    { start: 0.65, end: 0.90, min: 15, max: 19 },
    { start: 0.90, end: 1.00, min: 20, max: 25 },
  ];
  const frac = total <= 1 ? 0 : index / total;
  const bucket = bucketed.find((b) => frac >= b.start && frac < b.end) || bucketed[bucketed.length - 1];
  const span = bucket.max - bucket.min;
  // Spread deterministically across the bucket's own local position, not the
  // global index, so small buckets don't all collapse onto bucket.min.
  const bucketStartIdx = Math.floor(bucket.start * total);
  const bucketEndIdx   = Math.ceil(bucket.end * total);
  const bucketSize     = Math.max(1, bucketEndIdx - bucketStartIdx);
  const posInBucket     = index - bucketStartIdx;
  const pct = bucket.min + Math.round((posInBucket % (span + 1)) * (span / Math.max(1, bucketSize - 1 || 1)));
  return Math.min(MAX_DISCOUNT_PERCENT, Math.max(1, Math.round(pct)));
}

// Staggered end dates in {120,135,150,165,180}-day buckets, cycled — so
// campaigns don't all expire on the same day.
const END_DATE_BUCKETS_DAYS = [120, 135, 150, 165, 180];
function pickEndDate(index, now) {
  const days = END_DATE_BUCKETS_DAYS[index % END_DATE_BUCKETS_DAYS.length];
  return new Date(now.getTime() + days * DAY_MS);
}

const NAME_TEMPLATES = [
  (cat) => `TechVault ${cat} Deal`,
  (cat) => `${cat} Special`,
  (cat) => `${cat} Savings`,
  (cat) => `Weekend ${cat} Price`,
  (cat) => `TechVault Special Price — ${cat}`,
  (cat) => `${cat} Upgrade Deal`,
];
function pickCampaignName(categoryName, index) {
  const cat = categoryName || 'TechVault';
  return `${CURATION_MARKER} — ${NAME_TEMPLATES[index % NAME_TEMPLATES.length](cat)}`;
}

// Arrival-day distribution: roughly today(~4), 1d(~3), 2–6d(~10), 7–13d(~10),
// scaled to however many products were actually selected.
function buildArrivalDayPlan(total) {
  const raw = [
    { days: [0], weight: 4 },
    { days: [1], weight: 3 },
    { days: [2, 3, 4, 5, 6], weight: 10 },
    { days: [7, 8, 9, 10, 11, 12, 13], weight: 10 },
  ];
  const weightSum = raw.reduce((s, b) => s + b.weight, 0);
  const plan = [];
  raw.forEach((bucket) => {
    const count = Math.max(1, Math.round((bucket.weight / weightSum) * total));
    for (let i = 0; i < count; i++) {
      plan.push(bucket.days[i % bucket.days.length]);
    }
  });
  // Trim/pad to exactly `total`, preferring to trim from the oldest bucket
  // first (7–13d) and pad by repeating within the 2–6d bucket — keeps the
  // "today"/"yesterday" counts stable, which matter most for label QA.
  while (plan.length > total) plan.pop();
  let i = 2;
  while (plan.length < total) { plan.push(raw[2].days[i % raw[2].days.length]); i++; }
  return plan;
}

// ─── Safety guards ───────────────────────────────────────────────────────────
function assertProductionSafety() {
  const errors = [];
  if (process.env.NODE_ENV !== 'production') {
    errors.push(`NODE_ENV must be "production" (got: ${JSON.stringify(process.env.NODE_ENV)})`);
  }
  const uri = process.env.MONGO_URI_PROD || '';
  if (!uri) {
    errors.push('MONGO_URI_PROD is not set');
  } else if (/localhost|127\.0\.0\.1/i.test(uri)) {
    errors.push('MONGO_URI_PROD resolves to localhost — refusing to run against a local database');
  }
  if (process.env.PRODUCTION_CURATION_CONFIRM !== REQUIRED_CONFIRM_VALUE) {
    errors.push(`PRODUCTION_CURATION_CONFIRM must equal exactly "${REQUIRED_CONFIRM_VALUE}"`);
  }
  if (errors.length) {
    throw new Error('ABORT — production safety check failed:\n  - ' + errors.join('\n  - '));
  }
}

function assertConnectionIsNotLocal() {
  const host = mongoose.connection.host || '';
  if (/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error(`ABORT — connected Mongo host "${host}" looks local, not production`);
  }
}

// ─── Eligibility + plan building ─────────────────────────────────────────────
async function loadEligibleProducts(Product) {
  // Deals eligibility: real, live, sellable, sane price. Also require
  // stock > 0 — an out-of-stock item on "sale" is misleading.
  const dealsEligible = await Product.find({
    isPublished: true,
    isDeleted: false,
    price: { $gt: 0 },
    stock: { $gt: 0 },
  }).populate('category', 'name slug').select('name brand price stock category images ratings createdAt').lean();

  // New Arrivals eligibility is slightly looser (stock not required — an
  // arrival can legitimately be momentarily out of stock), but still real,
  // published, sane data.
  const arrivalsEligible = await Product.find({
    isPublished: true,
    isDeleted: false,
    price: { $gt: 0 },
  }).populate('category', 'name slug').select('name brand price stock category images createdAt').lean();

  return { dealsEligible, arrivalsEligible };
}

async function excludeAlreadyCampaigned(Campaign, products) {
  const now = new Date();
  const active = await Campaign.find({ isActive: true, endDate: { $gte: now } }).select('products').lean();
  const claimed = new Set(active.flatMap((c) => c.products.map(String)));
  return products.filter((p) => !claimed.has(String(p._id)));
}

// Round-robin across categories so 30–40 picks don't collapse onto one
// category just because it has the most inventory.
function diversePick(products, count) {
  const byCategory = new Map();
  for (const p of products) {
    const key = p.category?.name || 'Uncategorized';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(p);
  }
  const buckets = [...byCategory.values()];
  const picked = [];
  let round = 0;
  while (picked.length < count && buckets.some((b) => round < b.length)) {
    for (const bucket of buckets) {
      if (picked.length >= count) break;
      if (round < bucket.length) picked.push(bucket[round]);
    }
    round++;
  }
  return picked;
}

async function findNewBrandCandidates(Product, excludeIds) {
  const results = await Product.aggregate([
    { $match: { isPublished: true, isDeleted: false } },
    { $group: { _id: '$brand', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { _id: { $ne: null }, count: { $gt: 0, $lte: SMALL_BRAND_MAX_PRODUCTS } } },
    { $sort: { count: 1 } },
    { $limit: MAX_NEW_BRANDS },
  ]);
  const excludeSet = new Set(excludeIds.map(String));
  return results
    .filter((r) => !r.ids.some((id) => excludeSet.has(String(id))))
    .map((r) => ({ brand: r._id, productIds: r.ids.map(String), count: r.count }));
}

function buildCampaignPlan(products, now) {
  return products.map((p, i) => {
    const discountPercent = pickDiscountPercent(i, products.length);
    const startDate = now;
    const endDate = pickEndDate(i, now);
    const discountedPrice = Math.round(p.price * (1 - discountPercent / 100) * 100) / 100;
    return {
      productId: String(p._id),
      productName: p.name,
      category: p.category?.name || null,
      brand: p.brand || null,
      basePrice: p.price,
      discountPercent,
      discountedPrice,
      startDate,
      endDate,
      placement: 'none',
      name: pickCampaignName(p.category?.name, i),
    };
  });
}

function chooseFeaturedProduct(campaignPlan, productsById) {
  // Prefer a mid-to-high-priced, meaningfully-discounted, image-complete
  // product for the homepage Weekly Deal slot — it's the single most visible
  // deal on the site.
  const candidates = campaignPlan
    .map((c) => ({ c, p: productsById.get(c.productId) }))
    .filter(({ p }) => p && p.images && p.images.length > 0 && p.stock > 0)
    .sort((a, b) => (b.c.basePrice * b.c.discountPercent) - (a.c.basePrice * a.c.discountPercent));
  return candidates[0]?.c || null;
}

function buildArrivalsPlan(products, now) {
  const dayPlan = buildArrivalDayPlan(products.length);
  return products.map((p, i) => {
    const days = dayPlan[i];
    const newCreatedAt = new Date(now.getTime() - days * DAY_MS);
    return {
      productId: String(p._id),
      productName: p.name,
      brand: p.brand || null,
      category: p.category?.name || null,
      oldCreatedAt: p.createdAt,
      newCreatedAt,
      ageDays: days,
    };
  });
}

// ─── Dry-run / plan printing ─────────────────────────────────────────────────
function printPlan({ dbName, host, productCountBefore, dealsEligibleCount, arrivalsEligibleCount, campaignPlan, featured, arrivalsPlan, newBrandPlan, alreadyApplied }) {
  console.log('='.repeat(78));
  console.log('PRODUCTION STOREFRONT CURATION — PLAN');
  console.log('='.repeat(78));
  console.log(`Database host: ${host}`);
  console.log(`Database name: ${dbName}`);
  console.log(`Product count (before): ${productCountBefore}`);
  console.log(`Deals-eligible products: ${dealsEligibleCount}`);
  console.log(`Arrivals-eligible products: ${arrivalsEligibleCount}`);
  console.log(`Curation marker already present: ${alreadyApplied ? 'YES — curation already applied' : 'no'}`);
  console.log('');

  console.log(`--- Proposed Campaigns (${campaignPlan.length}) ---`);
  campaignPlan.forEach((c, i) => {
    const featuredTag = featured && c.productId === featured.productId ? '  [FEATURED — homepage_weekly_deal]' : '';
    console.log(
      `${String(i + 1).padStart(2, ' ')}. ${c.productName}  [${c.category}/${c.brand}]  ` +
      `₪${c.basePrice} -${c.discountPercent}% -> ₪${c.discountedPrice}  ` +
      `${c.startDate.toISOString().slice(0, 10)} -> ${c.endDate.toISOString().slice(0, 10)}${featuredTag}`
    );
  });

  console.log('');
  console.log(`--- Proposed New Arrivals (${arrivalsPlan.length}) ---`);
  arrivalsPlan.forEach((a, i) => {
    console.log(
      `${String(i + 1).padStart(2, ' ')}. ${a.productName}  [${a.category}/${a.brand}]  ` +
      `${new Date(a.oldCreatedAt).toISOString().slice(0, 10)} -> ${a.newCreatedAt.toISOString().slice(0, 10)}  ` +
      `(age after change: ${a.ageDays}d)`
    );
  });

  console.log('');
  console.log(`--- New Brands (${newBrandPlan.length}) ---`);
  newBrandPlan.forEach((b) => console.log(`  ${b.brand}: ${b.count} product(s), all staged into the New Arrivals window`));

  console.log('');
  console.log('--- Totals ---');
  console.log(`Campaigns to create: ${campaignPlan.length}`);
  console.log(`Products whose createdAt will change: ${arrivalsPlan.length}`);
  console.log('='.repeat(78));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function buildFullPlan() {
  const Product  = require('../models/Product');
  const Category = require('../models/Category');
  const Campaign = require('../models/Campaign');
  void Category;

  const productCountBefore = await Product.countDocuments();
  const { dealsEligible, arrivalsEligible } = await loadEligibleProducts(Product);
  const dealsPool = await excludeAlreadyCampaigned(Campaign, dealsEligible);

  const targetCampaigns = Math.max(MIN_CAMPAIGNS, Math.min(MAX_CAMPAIGNS, dealsPool.length));
  const campaignProducts = diversePick(dealsPool, Math.min(targetCampaigns, dealsPool.length));

  const now = new Date();
  const campaignPlan = buildCampaignPlan(campaignProducts, now);
  const productsById = new Map(campaignProducts.map((p) => [String(p._id), p]));
  const featured = chooseFeaturedProduct(campaignPlan, productsById);

  // New Brands: entire small-brand product sets, chosen first so they're
  // guaranteed included; general diverse picks fill the remaining budget.
  const alreadyChosenIds = campaignProducts.map((p) => p._id);
  const newBrandCandidates = await findNewBrandCandidates(Product, []);
  const brandProductIdSet = new Set(newBrandCandidates.flatMap((b) => b.productIds));
  const brandStagedProducts = arrivalsEligible.filter((p) => brandProductIdSet.has(String(p._id)));

  const remainingBudget = Math.max(0, Math.min(MAX_ARRIVALS, Math.max(MIN_ARRIVALS, arrivalsEligible.length)) - brandStagedProducts.length);
  const generalPool = arrivalsEligible.filter((p) => !brandProductIdSet.has(String(p._id)));
  const generalPicks = diversePick(generalPool, Math.min(remainingBudget, generalPool.length));

  const arrivalsProducts = [...brandStagedProducts, ...generalPicks];
  const arrivalsPlan = buildArrivalsPlan(arrivalsProducts, now);

  const alreadyApplied = (await Campaign.countDocuments({ name: { $regex: `^${CURATION_MARKER}` } })) > 0;

  return {
    productCountBefore,
    dealsEligibleCount: dealsEligible.length,
    arrivalsEligibleCount: arrivalsEligible.length,
    campaignPlan,
    featured,
    arrivalsPlan,
    newBrandPlan: newBrandCandidates,
    alreadyApplied,
  };
}

async function applyPlan(plan) {
  const Product  = require('../models/Product');
  const Campaign = require('../models/Campaign');

  if (plan.alreadyApplied) {
    console.log('ABORT — curation marker already present. Refusing to apply again (no --force implemented).');
    return { applied: false, reason: 'already_applied' };
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────
  const createdCampaignIds = [];
  for (const c of plan.campaignPlan) {
    const isFeatured = plan.featured && c.productId === plan.featured.productId;
    const doc = await Campaign.create({
      name: c.name,
      discountPercent: c.discountPercent,
      startDate: c.startDate,
      endDate: c.endDate,
      isActive: true,
      products: [c.productId],
      placement: isFeatured ? 'homepage_weekly_deal' : 'none',
    });
    createdCampaignIds.push(String(doc._id));
  }

  // ── New Arrivals — createdAt only, raw driver bypass (Mongoose's
  // timestamps plugin silently strips createdAt from updateOne/
  // findOneAndUpdate payloads; see stageNewArrivalsDemo.js for the same,
  // previously-diagnosed issue). updatedAt is deliberately left untouched. ──
  const rawProducts = mongoose.connection.collection('products');
  const changedProductIds = [];
  for (const a of plan.arrivalsPlan) {
    await rawProducts.updateOne(
      { _id: new mongoose.Types.ObjectId(a.productId) },
      { $set: { createdAt: a.newCreatedAt } }
    );
    changedProductIds.push(a.productId);
  }

  const productCountAfter = await Product.countDocuments();

  return {
    applied: true,
    createdCampaignIds,
    changedProductIds,
    productCountAfter,
  };
}

async function verifyInvariants(plan, applyResult) {
  const Product  = require('../models/Product');
  const Campaign = require('../models/Campaign');

  const problems = [];

  if (applyResult.productCountAfter !== plan.productCountBefore) {
    problems.push(`productCountBefore (${plan.productCountBefore}) !== productCountAfter (${applyResult.productCountAfter})`);
  }

  const campaigns = await Campaign.find({ _id: { $in: applyResult.createdCampaignIds } }).lean();
  if (campaigns.length !== plan.campaignPlan.length) {
    problems.push(`Expected ${plan.campaignPlan.length} campaigns, found ${campaigns.length}`);
  }
  for (const c of campaigns) {
    if (!c.isActive) problems.push(`Campaign ${c._id} is not active`);
    if (c.discountPercent > MAX_DISCOUNT_PERCENT) problems.push(`Campaign ${c._id} exceeds max discount`);
    if (!(c.endDate > new Date())) problems.push(`Campaign ${c._id} end date is not in the future`);
    const prod = await Product.findById(c.products[0]).select('price').lean();
    if (!prod || !(prod.price > 0)) problems.push(`Campaign ${c._id} references an invalid product`);
  }
  const featuredCount = campaigns.filter((c) => c.placement === 'homepage_weekly_deal').length;
  if (featuredCount !== 1) problems.push(`Expected exactly 1 homepage_weekly_deal campaign, found ${featuredCount}`);

  const now = Date.now();
  for (const id of applyResult.changedProductIds) {
    const prod = await Product.findById(id).select('createdAt').lean();
    if (!prod) { problems.push(`Arrival product ${id} not found after write`); continue; }
    const ageDays = (now - new Date(prod.createdAt).getTime()) / DAY_MS;
    if (ageDays > 14 || ageDays < 0) problems.push(`Arrival product ${id} age is ${ageDays.toFixed(1)}d (must be 0-14)`);
  }

  return problems;
}

async function runAsCli() {
  const args = process.argv.slice(2);
  const mode = args.includes('--apply') ? 'apply' : args.includes('--dry-run') ? 'dry-run' : null;

  if (!mode) {
    console.error('Usage: node server/scripts/curateProductionStorefront.js --dry-run | --apply');
    console.error('No flag was provided — refusing to run.');
    process.exit(1);
  }

  assertProductionSafety();

  const { connectDB } = require('../config/db');
  await connectDB();
  assertConnectionIsNotLocal();

  try {
    const plan = await buildFullPlan();
    printPlan({
      dbName: mongoose.connection.name,
      host: mongoose.connection.host,
      ...plan,
    });

    if (mode === 'dry-run') {
      console.log('\nDRY RUN ONLY — no data was modified.');
      return;
    }

    if (plan.alreadyApplied) {
      console.log('\nABORT — curation already applied. No changes made.');
      process.exitCode = 1;
      return;
    }

    console.log('\nApplying plan...');
    const applyResult = await applyPlan(plan);
    if (!applyResult.applied) {
      process.exitCode = 1;
      return;
    }

    console.log(`Campaigns created: ${applyResult.createdCampaignIds.length}`);
    console.log(`Products with createdAt changed: ${applyResult.changedProductIds.length}`);
    console.log(`Product count after: ${applyResult.productCountAfter} (before: ${plan.productCountBefore})`);

    const problems = await verifyInvariants(plan, applyResult);
    if (problems.length) {
      console.error('\nPOST-WRITE VERIFICATION FAILED:');
      problems.forEach((p) => console.error('  - ' + p));
      process.exitCode = 1;
      return;
    }

    console.log('\nPost-write verification passed. Curation applied successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nCuration failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  buildFullPlan,
  applyPlan,
  verifyInvariants,
  pickDiscountPercent,
  pickEndDate,
  pickCampaignName,
  buildArrivalDayPlan,
  CURATION_MARKER,
  REQUIRED_CONFIRM_VALUE,
};
