#!/usr/bin/env node
'use strict';

/**
 * backfillCampaignDisplayFields.js — ONE-TIME PRODUCTION BACKFILL.
 *
 * Gives every campaign that is missing a customer-facing `title` a safe,
 * honest, generic Hebrew title derived ONLY from real, structural campaign
 * fields (isClearance / membershipOnly) — never from `name` (the internal/
 * admin identifier, e.g. the "Production Curation 2026 — ..." marker some
 * production campaigns already carry, or an ad-hoc QA/staging label) and
 * never an invented per-product marketing claim. This is a data-quality
 * companion to the frontend fix (DealsPage.jsx / ClubPage.jsx / HomePage.jsx
 * already fall back to a safe generic label when `title` is absent, so this
 * script is NOT required for customer-facing safety — it exists to give
 * every campaign a real stored title instead of relying solely on that
 * shared fallback string for all of them at once).
 *
 * This script NEVER touches: `name`, discountPercent, products, startDate,
 * endDate, placement, isActive, isClearance, membershipOnly,
 * pointsMultiplier, vipEarlyAccessHours, or clearanceStockSnapshots. It only
 * ever writes `title` — and ONLY on a campaign that doesn't already have one
 * (idempotent; a campaign with any existing non-empty `title`, whether set
 * by an earlier run of this script or authored directly by an admin via the
 * Admin UI, is always left completely untouched, on every future run).
 * `description` is intentionally NOT backfilled — there's no safe way to
 * generate a truthful, product-specific description from structural fields
 * alone, so that field is left for an admin to fill in via the Admin UI
 * (server/validators/campaign.validator.js / AdminCampaignsPage.jsx) at
 * their discretion.
 *
 * Hard safety model (mirrors curateProductionStorefront.js exactly):
 *   - Refuses to run unless NODE_ENV === "production".
 *   - Refuses to run if the resolved Mongo URI/host is localhost/127.0.0.1.
 *   - Refuses to run without BACKFILL_CONFIRM=TECHVAULT_PRODUCTION set in
 *     the environment (never hardcoded, never stored in .env).
 *   - Refuses to mutate anything unless invoked with --apply. The default
 *     (no flag) and --dry-run print the exact list of affected campaigns —
 *     _id, internal name (read-only, for identification), and the title
 *     that would be written — and touch nothing.
 *   - Re-checks each campaign's title is still empty at write time (a
 *     narrower race-safe filter on the update itself), so a title an admin
 *     sets between dry-run and apply is never clobbered.
 *
 * Usage (must be run inside the production application context, e.g. via
 * `docker compose exec -T backend node server/scripts/backfillCampaignDisplayFields.js`):
 *   node server/scripts/backfillCampaignDisplayFields.js --dry-run
 *   node server/scripts/backfillCampaignDisplayFields.js --apply
 *
 * With no flag, or any unrecognized flag, the script prints usage and exits
 * non-zero without touching the database.
 */

const mongoose = require('mongoose');

const REQUIRED_CONFIRM_VALUE = 'TECHVAULT_PRODUCTION';

// Deliberately generic and true for ANY campaign matching the condition —
// no product-specific, category-specific, or discount-specific claim, so
// this can never overclaim regardless of which real campaign it lands on.
// An admin can always replace it with something more specific afterward via
// the Admin UI — this is a safe floor, not meant to be the final copy.
function computeSafeTitle(campaign) {
  if (campaign.isClearance)    return 'על מוצרים בחיסול מלאי';
  if (campaign.membershipOnly) return 'בלעדי לחברי מועדון VIP';
  return 'על מוצרים נבחרים';
}

// ─── Safety guards (identical pattern to curateProductionStorefront.js) ────
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
  if (process.env.BACKFILL_CONFIRM !== REQUIRED_CONFIRM_VALUE) {
    errors.push(`BACKFILL_CONFIRM must equal exactly "${REQUIRED_CONFIRM_VALUE}"`);
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

const MISSING_TITLE_FILTER = { $or: [{ title: { $exists: false } }, { title: null }, { title: '' }] };

// ─── Plan ───────────────────────────────────────────────────────────────────
async function buildPlan() {
  const Campaign = mongoose.model('Campaign');
  // Every campaign missing a title — not filtered to "currently active", so
  // a scheduled-but-not-yet-started campaign is also fixed before it ever
  // goes live and needs the frontend's shared generic fallback at all.
  const candidates = await Campaign.find(MISSING_TITLE_FILTER)
    .select('_id name isActive discountPercent isClearance membershipOnly startDate endDate')
    .lean();

  return candidates.map((c) => ({
    id:              String(c._id),
    internalName:    c.name,
    isActive:        c.isActive,
    discountPercent: c.discountPercent,
    isClearance:     c.isClearance ?? false,
    membershipOnly:  c.membershipOnly ?? false,
    computedTitle:   computeSafeTitle(c),
  }));
}

function printPlan(plan, dbName, host) {
  console.log(`\nConnected to: ${host} / db "${dbName}"`);
  console.log(`Campaigns missing a customer-facing title: ${plan.length}\n`);
  if (plan.length === 0) {
    console.log('Nothing to do — every campaign already has a title.');
    return;
  }
  plan.forEach((c, i) => {
    console.log(`${i + 1}. _id=${c.id}  active=${c.isActive}  discount=${c.discountPercent}%  clearance=${c.isClearance}  vipOnly=${c.membershipOnly}`);
    console.log(`   internal name (admin-only, UNCHANGED by this script): "${c.internalName}"`);
    console.log(`   -> will SET title: "${c.computedTitle}"`);
  });
}

// ─── Apply ──────────────────────────────────────────────────────────────────
async function applyPlan(plan) {
  const Campaign = mongoose.model('Campaign');
  let updated = 0;
  for (const c of plan) {
    // Re-check the title is still empty at write time — never overwrite a
    // title an admin set between the dry-run and this apply.
    const res = await Campaign.updateOne(
      { _id: c.id, ...MISSING_TITLE_FILTER },
      { $set: { title: c.computedTitle } }
    );
    if (res.modifiedCount > 0) updated++;
  }
  return { updated };
}

async function runAsCli() {
  const args = process.argv.slice(2);
  const mode = args.includes('--apply') ? 'apply' : args.includes('--dry-run') ? 'dry-run' : null;

  if (!mode) {
    console.error('Usage: node server/scripts/backfillCampaignDisplayFields.js --dry-run | --apply');
    console.error('No flag was provided — refusing to run.');
    process.exit(1);
  }

  assertProductionSafety();

  const { connectDB } = require('../config/db');
  require('../models/Campaign');
  await connectDB();
  assertConnectionIsNotLocal();

  try {
    const plan = await buildPlan();
    printPlan(plan, mongoose.connection.name, mongoose.connection.host);

    if (mode === 'dry-run') {
      console.log('\nDRY RUN ONLY — no data was modified.');
      return;
    }

    if (plan.length === 0) {
      console.log('\nNothing to apply.');
      return;
    }

    console.log('\nApplying plan...');
    const { updated } = await applyPlan(plan);
    console.log(`Campaigns updated: ${updated}/${plan.length}`);

    const stillMissing = await mongoose.model('Campaign').countDocuments({
      _id: { $in: plan.map((c) => c.id) },
      ...MISSING_TITLE_FILTER,
    });
    if (stillMissing > 0) {
      console.error(`\nPOST-WRITE VERIFICATION FAILED: ${stillMissing} campaign(s) still missing a title.`);
      process.exitCode = 1;
      return;
    }

    console.log('\nPost-write verification passed. Backfill applied successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nBackfill failed:', err.message);
    process.exit(1);
  });
}

module.exports = { computeSafeTitle, buildPlan, applyPlan };
