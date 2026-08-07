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
 * ─── Deals coverage model ────────────────────────────────────────────────────
 * The Campaign dataset is NOT a flat pile of random discounts. It is built to
 * deliberately exercise every real, code-verified Deals-page feature:
 *
 *   - Mega Deal ("מבצע ענק"): DealsPage's Hero always shows the
 *     highest-discountPercent CAMPAIGN whose placement !== 'homepage_weekly_deal'
 *     (ties broken by most recent startDate) — see DealsPage.jsx `heroCampaign`.
 *     There is no dedicated "mega deal" field; it's a derived selection. This
 *     script guarantees one product carries the single highest non-weekly
 *     discount in the whole dataset so it deterministically wins that slot.
 *   - Weekly Deal ("מבצע השבוע"): the one real Campaign with
 *     placement: 'homepage_weekly_deal' — the exact same campaign feeds both
 *     HomePage's WeeklyDealSection and DealsPage's WeeklySpotlight (both call
 *     campaignService.getWeeklyDeal(), backed by the same
 *     campaign.service.js#getActiveWeeklyDeal()). Always a DIFFERENT product
 *     from the Mega Deal — DealsPage's own heroCampaign selection already
 *     prefers non-weekly campaigns for exactly this reason.
 *   - Discount filters — read verbatim from DealsPage.jsx's real filter
 *     logic, NOT assumed:
 *       under20:  discountPercent <= 20   ("עד 20%" / "Up to 20%")
 *       20to40:   20 < discountPercent <= 40   ("20%-40%")
 *       over40:   discountPercent > 40    ("מעל 40%" / "Over 40%")
 *     The normal realistic-discount ceiling (25%) cannot reach the 20to40
 *     bucket's upper half or the over40 bucket at all. Per explicit
 *     instruction, a SMALL, clearly-flagged number of campaigns are given a
 *     higher-but-still-plausible discount (up to 50%) specifically so those
 *     filters have real matching data — never used for the bulk of the
 *     dataset, always reported before apply.
 *   - Category coverage: campaigns are round-robin distributed across every
 *     real category with eligible products, discovered at runtime (never
 *     hardcoded) — DealsPage's category chips are themselves derived from
 *     whatever categories the curated campaigns happen to cover, so a
 *     category with zero curated campaigns simply never renders a chip for
 *     itself (not an "empty state", just absent — this is normal/correct).
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
 *     --apply refuses to run again — a second run must be a deliberate,
 *     reviewed code change, not a flag flip.
 *   - Asserts productCountBefore === productCountAfter and that zero new
 *     Product documents were created, both previewed in dry-run and enforced
 *     as a hard post-write invariant in --apply mode.
 *   - The dry-run FAILS (non-zero exit) if any Deals filter that can
 *     reasonably be populated from the real catalog ends up with zero
 *     coverage — this is a planning bug, not something to silently ship.
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
const SMALL_BRAND_MAX_PRODUCTS = 8;
const MAX_NEW_BRANDS = 4;

const DAY_MS = 86400000;

// ─── Deals filters — copied verbatim from DealsPage.jsx, not re-derived ────
// (see file header for the exact source lines these mirror).
const DEALS_FILTERS = [
  { key: 'under20',  labelHe: 'עד 20%',   labelEn: 'Up to 20%', test: (d) => d <= 20 },
  { key: '20to40',   labelHe: '20%-40%',  labelEn: '20%-40%',   test: (d) => d > 20 && d <= 40 },
  { key: 'over40',   labelHe: 'מעל 40%',  labelEn: 'Over 40%',  test: (d) => d > 40 },
];

// ─── Discount plan — explicit counts, not fractions, so the 3–5-per-filter
// minimum is guaranteed regardless of where N lands in [25,40]. ─────────────
const MEGA_DEAL_DISCOUNT   = 50; // must be the unique highest non-weekly discount
const WEEKLY_DEAL_DISCOUNT = 18; // believable; irrelevant to Hero selection either way
const OVER40_VALUES        = [45, 43, 41]; // 3 more, distinct from the Mega Deal's own 50
const TWENTY_TO_FORTY_MIN  = 5;            // 21–30%, dedicated "20to40" filter coverage
const UNDER20_SUBTIERS     = [
  { min: 5,  max: 9  },
  { min: 10, max: 14 },
  { min: 15, max: 19 },
];

// ─── Staggered, long-lived expiries — 120/135/150/165/180 days, cycled. ────
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
function pickCampaignName(categoryName, index, tag) {
  const cat = categoryName || 'TechVault';
  const base = NAME_TEMPLATES[index % NAME_TEMPLATES.length](cat);
  return `${CURATION_MARKER} — ${tag ? tag + ' — ' : ''}${base}`;
}

// Deterministic, evenly-spread discount values within [min,max] for a bucket
// of `count` items — no Math.random(), so dry-run and apply always agree.
function spreadWithinRange(count, min, max) {
  if (count <= 1) return [min];
  const span = max - min;
  return Array.from({ length: count }, (_, i) => min + Math.round((i * span) / (count - 1)));
}

// Arrival-day distribution: today(~4), 1d(~3), 2–6d(~10), 7–13d(~10), scaled
// to however many products were actually selected.
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
    for (let i = 0; i < count; i++) plan.push(bucket.days[i % bucket.days.length]);
  });
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

// ─── Eligibility ──────────────────────────────────────────────────────────────
async function loadEligibleProducts(Product) {
  const dealsEligible = await Product.find({
    isPublished: true,
    isDeleted: false,
    price: { $gt: 0 },
    stock: { $gt: 0 },
  }).populate('category', 'name slug').select('name brand price stock category images ratings createdAt').lean();

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

// Round-robin across categories so picks don't collapse onto whichever
// category happens to have the most inventory.
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

async function findNewBrandCandidates(Product) {
  const results = await Product.aggregate([
    { $match: { isPublished: true, isDeleted: false } },
    { $group: { _id: '$brand', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { _id: { $ne: null }, count: { $gt: 0, $lte: SMALL_BRAND_MAX_PRODUCTS } } },
    { $sort: { count: 1 } },
    { $limit: MAX_NEW_BRANDS },
  ]);
  return results.map((r) => ({ brand: r._id, productIds: r.ids.map(String), count: r.count }));
}

// ─── Deals coverage plan ──────────────────────────────────────────────────────
// Returns { campaignPlan, featuredCampaignKey, coverage, warnings }.
function buildDealsCoveragePlan(dealsPool, now) {
  const warnings = [];

  const reserved = 2 + OVER40_VALUES.length + TWENTY_TO_FORTY_MIN; // mega + weekly + over40 + 20to40
  if (dealsPool.length < reserved) {
    throw new Error(`ABORT — only ${dealsPool.length} eligible products; need at least ${reserved} to cover Mega Deal, Weekly Deal, and both non-standard filter tiers.`);
  }

  // Never force MIN_CAMPAIGNS out of a smaller real pool — cap by what
  // actually exists first, THEN clamp into [reserved, MAX_CAMPAIGNS]. A
  // pool that can only support the reserved slots still gets full filter
  // coverage; it just won't reach the preferred 25-campaign minimum, which
  // is reported as a warning below rather than silently forced.
  const totalTarget = Math.max(reserved, Math.min(MAX_CAMPAIGNS, dealsPool.length));
  if (totalTarget < MIN_CAMPAIGNS) {
    warnings.push(`Only ${totalTarget} campaigns are supported by the real eligible-product pool (${dealsPool.length}) — below the preferred ${MIN_CAMPAIGNS} minimum. Filter/category coverage is still complete.`);
  }
  const generalCount = Math.max(0, totalTarget - reserved);

  // Diverse pick across the WHOLE pool up front so every special slot also
  // gets category variety, then peel slices off in a fixed, documented order.
  const ordered = diversePick(dealsPool, Math.min(totalTarget, dealsPool.length));
  let cursor = 0;
  const take = (n) => ordered.slice(cursor, cursor += n);

  const megaProduct       = take(1)[0];
  const weeklyProduct     = take(1)[0];
  const over40Products    = take(OVER40_VALUES.length);
  const twentyForty       = take(TWENTY_TO_FORTY_MIN);
  const generalProducts   = take(generalCount);

  if (!megaProduct || !weeklyProduct) {
    throw new Error('ABORT — not enough eligible products to select distinct Mega Deal and Weekly Deal products.');
  }

  const twentyFortyValues = spreadWithinRange(twentyForty.length, 21, 30);
  const underSubCounts = [
    Math.round(generalProducts.length * 0.35),
    Math.round(generalProducts.length * 0.40),
  ];
  underSubCounts.push(Math.max(0, generalProducts.length - underSubCounts[0] - underSubCounts[1]));

  const campaignPlan = [];
  let idx = 0;

  // Mega Deal — deliberately the single highest non-weekly discount.
  campaignPlan.push({
    key: 'mega',
    productId: String(megaProduct._id), productName: megaProduct.name,
    category: megaProduct.category?.name || null, brand: megaProduct.brand || null,
    basePrice: megaProduct.price, discountPercent: MEGA_DEAL_DISCOUNT,
    discountedPrice: Math.round(megaProduct.price * (1 - MEGA_DEAL_DISCOUNT / 100) * 100) / 100,
    startDate: now, endDate: pickEndDate(idx, now), placement: 'none',
    name: pickCampaignName(megaProduct.category?.name, idx++, 'Mega Deal'),
    aboveNormalCap: true,
  });

  // Weekly Deal — separate product, real placement value.
  campaignPlan.push({
    key: 'weekly',
    productId: String(weeklyProduct._id), productName: weeklyProduct.name,
    category: weeklyProduct.category?.name || null, brand: weeklyProduct.brand || null,
    basePrice: weeklyProduct.price, discountPercent: WEEKLY_DEAL_DISCOUNT,
    discountedPrice: Math.round(weeklyProduct.price * (1 - WEEKLY_DEAL_DISCOUNT / 100) * 100) / 100,
    startDate: now, endDate: pickEndDate(idx, now), placement: 'homepage_weekly_deal',
    name: pickCampaignName(weeklyProduct.category?.name, idx++, 'Weekly Deal'),
    aboveNormalCap: false,
  });

  // over40 filter coverage — small, explicit, flagged exception to the
  // normal ~25% ceiling.
  over40Products.forEach((p, i) => {
    const discountPercent = OVER40_VALUES[i];
    campaignPlan.push({
      key: 'over40',
      productId: String(p._id), productName: p.name,
      category: p.category?.name || null, brand: p.brand || null,
      basePrice: p.price, discountPercent,
      discountedPrice: Math.round(p.price * (1 - discountPercent / 100) * 100) / 100,
      startDate: now, endDate: pickEndDate(idx, now), placement: 'none',
      name: pickCampaignName(p.category?.name, idx++, 'Clearance'),
      aboveNormalCap: true,
    });
  });

  // 20to40 filter coverage — 21–30%, plausible "big sale" tier.
  twentyForty.forEach((p, i) => {
    const discountPercent = twentyFortyValues[i];
    campaignPlan.push({
      key: '20to40',
      productId: String(p._id), productName: p.name,
      category: p.category?.name || null, brand: p.brand || null,
      basePrice: p.price, discountPercent,
      discountedPrice: Math.round(p.price * (1 - discountPercent / 100) * 100) / 100,
      startDate: now, endDate: pickEndDate(idx, now), placement: 'none',
      name: pickCampaignName(p.category?.name, idx++, null),
      aboveNormalCap: false,
    });
  });

  // General filler — spread across the three under-20 sub-tiers for
  // realistic variety (never a single repeated percentage).
  let gi = 0;
  UNDER20_SUBTIERS.forEach((tier, tierIdx) => {
    const count = underSubCounts[tierIdx];
    const values = spreadWithinRange(count, tier.min, tier.max);
    for (let i = 0; i < count; i++) {
      const p = generalProducts[gi++];
      if (!p) break;
      const discountPercent = values[i];
      campaignPlan.push({
        key: 'general',
        productId: String(p._id), productName: p.name,
        category: p.category?.name || null, brand: p.brand || null,
        basePrice: p.price, discountPercent,
        discountedPrice: Math.round(p.price * (1 - discountPercent / 100) * 100) / 100,
        startDate: now, endDate: pickEndDate(idx, now), placement: 'none',
        name: pickCampaignName(p.category?.name, idx++, null),
        aboveNormalCap: false,
      });
    }
  });

  // ── Coverage report + hard validation ──────────────────────────────────────
  const coverage = DEALS_FILTERS.map((f) => {
    // Mirrors DealsPage's own exclusion of the Hero product from the
    // filterable grid (`eligibleForHot`), so this count matches what a real
    // visitor would actually see when clicking that filter chip.
    const matching = campaignPlan.filter((c) => c.key !== 'mega' && f.test(c.discountPercent));
    return { key: f.key, labelHe: f.labelHe, labelEn: f.labelEn, count: matching.length };
  });
  const categoryCoverage = [...new Map(
    campaignPlan.filter((c) => c.key !== 'mega').map((c) => [c.category, (categoryCoverageCount(campaignPlan, c.category))])
  ).entries()].map(([category, count]) => ({ category, count }));

  const zeroCoverage = coverage.filter((c) => c.count === 0);
  if (zeroCoverage.length) {
    throw new Error(`ABORT — Deals filter(s) with zero coverage: ${zeroCoverage.map((c) => c.labelEn).join(', ')}`);
  }
  const under5 = coverage.filter((c) => c.count > 0 && c.count < 3);
  if (under5.length) {
    warnings.push(`Filter(s) below the preferred 3–5 minimum: ${under5.map((c) => `${c.labelEn} (${c.count})`).join(', ')}`);
  }

  return { campaignPlan, coverage, categoryCoverage, warnings };
}

function categoryCoverageCount(campaignPlan, category) {
  return campaignPlan.filter((c) => c.key !== 'mega' && c.category === category).length;
}

function buildArrivalsPlan(products, now) {
  const dayPlan = buildArrivalDayPlan(products.length);
  return products.map((p, i) => {
    const days = dayPlan[i];
    const newCreatedAt = new Date(now.getTime() - days * DAY_MS);
    return {
      productId: String(p._id), productName: p.name, brand: p.brand || null,
      category: p.category?.name || null, oldCreatedAt: p.createdAt,
      newCreatedAt, ageDays: days,
    };
  });
}

// ─── Dry-run / plan printing ─────────────────────────────────────────────────
function printPlan({ dbName, host, productCountBefore, dealsEligibleCount, arrivalsEligibleCount, campaignPlan, coverage, categoryCoverage, warnings, arrivalsPlan, newBrandPlan, alreadyApplied }) {
  console.log('='.repeat(78));
  console.log('PRODUCTION STOREFRONT CURATION — PLAN');
  console.log('='.repeat(78));
  console.log(`Database host: ${host}`);
  console.log(`Database name: ${dbName}`);
  console.log(`Product count (before): ${productCountBefore}`);
  console.log(`Deals-eligible products: ${dealsEligibleCount}`);
  console.log(`Arrivals-eligible products: ${arrivalsEligibleCount}`);
  console.log(`Curation marker already present: ${alreadyApplied ? 'YES — curation already applied' : 'no'}`);

  console.log('\n--- DEALS UI COVERAGE ---');
  const mega = campaignPlan.find((c) => c.key === 'mega');
  const weekly = campaignPlan.find((c) => c.key === 'weekly');
  console.log(`Mega Deal (מבצע ענק): COVERED — "${mega.productName}" — ₪${mega.basePrice} -${mega.discountPercent}% -> ₪${mega.discountedPrice}  [campaign: "${mega.name}"]`);
  console.log(`Weekly Deal (מבצע השבוע): COVERED — "${weekly.productName}" — ₪${weekly.basePrice} -${weekly.discountPercent}% -> ₪${weekly.discountedPrice}  [campaign: "${weekly.name}", placement: homepage_weekly_deal]`);

  console.log('\nDiscount filters (exact DealsPage.jsx buckets, Hero product excluded — matches the real grid):');
  coverage.forEach((c) => console.log(`  ${c.labelHe} / ${c.labelEn}: ${c.count} product(s)`));

  const aboveCap = campaignPlan.filter((c) => c.aboveNormalCap);
  if (aboveCap.length) {
    console.log(`\nDiscounts ABOVE the normal ~25% cap (explicit filter-coverage exception, ${aboveCap.length} campaign(s)):`);
    aboveCap.forEach((c) => console.log(`  ${c.productName}: ${c.discountPercent}%  [${c.key}]`));
  }

  console.log('\nCategory coverage:');
  categoryCoverage.forEach((c) => console.log(`  ${c.category}: ${c.count}`));

  if (warnings.length) {
    console.log('\nWarnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }

  console.log(`\n--- Full Campaign List (${campaignPlan.length}) ---`);
  campaignPlan.forEach((c, i) => {
    console.log(
      `${String(i + 1).padStart(2, ' ')}. [${c.key}] ${c.productName}  [${c.category}/${c.brand}]  ` +
      `₪${c.basePrice} -${c.discountPercent}% -> ₪${c.discountedPrice}  ` +
      `${c.startDate.toISOString().slice(0, 10)} -> ${c.endDate.toISOString().slice(0, 10)}  ` +
      `placement=${c.placement}`
    );
  });

  console.log(`\n--- Proposed New Arrivals (${arrivalsPlan.length}) ---`);
  arrivalsPlan.forEach((a, i) => {
    console.log(
      `${String(i + 1).padStart(2, ' ')}. ${a.productName}  [${a.category}/${a.brand}]  ` +
      `${new Date(a.oldCreatedAt).toISOString().slice(0, 10)} -> ${a.newCreatedAt.toISOString().slice(0, 10)}  ` +
      `(age after change: ${a.ageDays}d)`
    );
  });

  console.log(`\n--- New Brands (${newBrandPlan.length}) ---`);
  newBrandPlan.forEach((b) => console.log(`  ${b.brand}: ${b.count} product(s), all staged into the New Arrivals window`));

  console.log('\n--- Totals ---');
  console.log(`Campaigns to create: ${campaignPlan.length}`);
  console.log(`Products whose createdAt will change: ${arrivalsPlan.length}`);
  console.log('='.repeat(78));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function buildFullPlan() {
  const Product  = require('../models/Product');
  const Campaign = require('../models/Campaign');

  const productCountBefore = await Product.countDocuments();
  const { dealsEligible, arrivalsEligible } = await loadEligibleProducts(Product);
  const dealsPool = await excludeAlreadyCampaigned(Campaign, dealsEligible);

  const now = new Date();
  const { campaignPlan, coverage, categoryCoverage, warnings } = buildDealsCoveragePlan(dealsPool, now);

  const campaignProductIds = new Set(campaignPlan.map((c) => c.productId));

  // New Brands: entire small-brand product sets, chosen first so they're
  // guaranteed included; general diverse picks fill the remaining budget.
  const newBrandCandidates = await findNewBrandCandidates(Product);
  const brandProductIdSet = new Set(newBrandCandidates.flatMap((b) => b.productIds));
  const brandStagedProducts = arrivalsEligible.filter((p) => brandProductIdSet.has(String(p._id)));

  const remainingBudget = Math.max(0, Math.min(MAX_ARRIVALS, Math.max(MIN_ARRIVALS, arrivalsEligible.length)) - brandStagedProducts.length);
  const generalPool = arrivalsEligible.filter((p) => !brandProductIdSet.has(String(p._id)));
  const generalPicks = diversePick(generalPool, Math.min(remainingBudget, generalPool.length));

  const arrivalsProducts = [...brandStagedProducts, ...generalPicks];
  const arrivalsPlan = buildArrivalsPlan(arrivalsProducts, now);

  const alreadyApplied = (await Campaign.countDocuments({ name: { $regex: `^${CURATION_MARKER}` } })) > 0;

  void campaignProductIds; // reserved for future cross-check use
  return {
    productCountBefore,
    dealsEligibleCount: dealsEligible.length,
    arrivalsEligibleCount: arrivalsEligible.length,
    campaignPlan,
    coverage,
    categoryCoverage,
    warnings,
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

  const createdCampaignIds = [];
  for (const c of plan.campaignPlan) {
    const doc = await Campaign.create({
      name: c.name,
      discountPercent: c.discountPercent,
      startDate: c.startDate,
      endDate: c.endDate,
      isActive: true,
      products: [c.productId],
      placement: c.placement,
    });
    createdCampaignIds.push(String(doc._id));
  }

  // New Arrivals — createdAt only, raw driver bypass (Mongoose's timestamps
  // plugin silently strips createdAt from updateOne/findOneAndUpdate
  // payloads). updatedAt is deliberately left untouched.
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

  return { applied: true, createdCampaignIds, changedProductIds, productCountAfter };
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
    if (c.discountPercent > 50) problems.push(`Campaign ${c._id} exceeds the 50% absolute ceiling`);
    if (!(c.endDate > new Date())) problems.push(`Campaign ${c._id} end date is not in the future`);
    const prod = await Product.findById(c.products[0]).select('price').lean();
    if (!prod || !(prod.price > 0)) problems.push(`Campaign ${c._id} references an invalid product`);
  }
  const featuredCount = campaigns.filter((c) => c.placement === 'homepage_weekly_deal').length;
  if (featuredCount !== 1) problems.push(`Expected exactly 1 homepage_weekly_deal campaign, found ${featuredCount}`);

  const nonWeekly = campaigns.filter((c) => c.placement !== 'homepage_weekly_deal');
  const maxNonWeekly = Math.max(...nonWeekly.map((c) => c.discountPercent));
  const tiedAtMax = nonWeekly.filter((c) => c.discountPercent === maxNonWeekly).length;
  if (tiedAtMax !== 1) problems.push(`Expected a unique highest non-weekly discount (Mega Deal), found ${tiedAtMax} campaigns tied at ${maxNonWeekly}%`);

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
    printPlan({ dbName: mongoose.connection.name, host: mongoose.connection.host, ...plan });

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
  buildDealsCoveragePlan,
  buildArrivalDayPlan,
  spreadWithinRange,
  pickEndDate,
  pickCampaignName,
  DEALS_FILTERS,
  CURATION_MARKER,
  REQUIRED_CONFIRM_VALUE,
  MEGA_DEAL_DISCOUNT,
  WEEKLY_DEAL_DISCOUNT,
  OVER40_VALUES,
};
