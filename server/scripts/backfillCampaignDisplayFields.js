#!/usr/bin/env node
'use strict';

/**
 * backfillCampaignDisplayFields.js — ONE-TIME PRODUCTION BACKFILL.
 *
 * Gives every campaign that is missing a customer-facing `title` a safe,
 * honest, generic Hebrew title derived ONLY from real, structural campaign
 * fields (isClearance / membershipOnly) — never from `name` (the internal/
 * admin identifier) and never an invented per-product marketing claim.
 * `description` is intentionally NOT backfilled — there's no safe way to
 * generate a truthful, product-specific description from structural fields
 * alone, so that field is left for an admin to fill in via the Admin UI at
 * their discretion.
 *
 * ─── Why this talks to the RAW MongoDB collection, never a Mongoose Model ──
 * This backfill is deliberately meant to run BEFORE the application has been
 * redeployed with the code that adds `title`/`description` to the Campaign
 * schema — that's the whole point of doing it as a separate, narrowly-scoped
 * step. That means the already-running backend container's own
 * server/models/Campaign.js is the OLD schema, with no `title` field.
 *
 * A real incident on this exact script proved why that matters: an earlier
 * version used `mongoose.model('Campaign').updateOne(...)`. Mongoose's
 * default `strict: true` schema option applies to update casting, not just
 * `save()` — any key in `$set` that isn't a declared schema path gets
 * stripped before the write is even sent. With `title` as the *only* key in
 * `$set`, stripping it left an empty update; depending on exactly how that
 * empty update got serialized, this manifested as either (a) Mongoose
 * short-circuiting entirely, returning a synthetic `{acknowledged:false}`
 * without ever calling the database, or (b) the driver sending `title` as a
 * literal `undefined`, which some BSON paths coerce to a stored `null`
 * instead of the intended string. Both were reproduced locally against a
 * schema copy matching the running production container. Either way: no
 * real title value ever persisted, even though nothing threw and the loop
 * completed.
 *
 * The fix is to never route this migration through a Mongoose Model at all.
 * `mongoose.connection.collection('campaigns')` is the underlying native
 * MongoDB driver collection — reads and writes through it are NOT cast or
 * filtered by any Mongoose schema, so they work correctly regardless of
 * whether the currently-loaded `Campaign` model (in this process, or in the
 * separately-running application process) knows about `title` yet. This is
 * exactly what makes it safe to run this backfill before redeploying.
 *
 * This script NEVER touches: `name`, discountPercent, products, startDate,
 * endDate, placement, isActive, isClearance, membershipOnly,
 * pointsMultiplier, vipEarlyAccessHours, or clearanceStockSnapshots. It only
 * ever writes `title` — and ONLY on a campaign that doesn't already have one
 * (idempotent; a campaign with any existing non-empty `title`, whether set
 * by an earlier run of this script or authored directly by an admin via the
 * Admin UI, is always left completely untouched, on every future run).
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
 *   - Re-checks each campaign's title is still empty AT WRITE TIME via the
 *     update's own filter (never just trusting the earlier plan), so a
 *     title an admin sets between dry-run and apply is never clobbered, and
 *     a campaign fixed by a concurrent/earlier partial run is correctly
 *     reported as skipped, not silently miscounted as newly modified.
 *   - Every reported count (matched / modified / skipped / failed) comes
 *     directly from the real MongoDB write result for that exact document —
 *     never inferred or assumed. If the number of real modifications doesn't
 *     match what was expected, the script exits non-zero rather than
 *     printing a misleading "success".
 *   - Post-write verification re-reads every target directly from the raw
 *     collection and checks BOTH that `title` now exactly equals the value
 *     that was planned for it AND that `name` is byte-for-byte unchanged —
 *     not merely "title is non-empty".
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
const COLLECTION_NAME = 'campaigns';

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

// The ONLY way this script ever touches Campaign documents — the native
// driver collection, never a Mongoose Model. See the file header for why.
function campaignsCollection() {
  return mongoose.connection.collection(COLLECTION_NAME);
}

// ─── Plan ───────────────────────────────────────────────────────────────────
async function buildPlan() {
  // Every campaign missing a title — not filtered to "currently active", so
  // a scheduled-but-not-yet-started campaign is also fixed before it ever
  // goes live and needs the frontend's shared generic fallback at all.
  const candidates = await campaignsCollection()
    .find(MISSING_TITLE_FILTER)
    .project({ name: 1, isActive: 1, discountPercent: 1, isClearance: 1, membershipOnly: 1 })
    .toArray();

  return candidates.map((c) => ({
    id:              c._id, // real ObjectId — used for exact-_id targeting on write
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
// Every count below comes directly from each document's own real MongoDB
// write result — never assumed, never derived from the plan alone.
async function applyPlan(plan) {
  const coll = campaignsCollection();
  const result = { planned: plan.length, matched: 0, modified: 0, skippedAlreadyFixed: 0, failed: [] };

  for (const c of plan) {
    try {
      // Re-check at write time: only matches if title is STILL missing.
      const res = await coll.updateOne(
        { _id: c.id, ...MISSING_TITLE_FILTER },
        { $set: { title: c.computedTitle } }
      );

      if (res.matchedCount === 0) {
        // Someone (an admin, or an earlier partial run) already set a real
        // title on this campaign between buildPlan() and now — correctly
        // left untouched, not a failure.
        result.skippedAlreadyFixed++;
        continue;
      }

      result.matched += res.matchedCount;

      if (res.modifiedCount > 0) {
        result.modified += res.modifiedCount;
      } else {
        // Matched the filter but the database reports nothing actually
        // changed — should never happen given the filter above, but this is
        // exactly the class of silent failure this rewrite exists to catch.
        // Treat it as a real, reported failure, never silent success.
        result.failed.push({ id: c.id.toString(), reason: 'matched but modifiedCount was 0 — write did not persist' });
      }
    } catch (err) {
      result.failed.push({ id: c.id.toString(), reason: err.message });
    }
  }

  return result;
}

// ─── Post-write verification ───────────────────────────────────────────────
// Reads straight from the raw collection (same as buildPlan/applyPlan) —
// never through a Mongoose Model, so this can never pass or fail based on
// whether some schema happens to declare `title`. Checks title is exactly
// the planned value (not merely "non-empty") and that `name` didn't change.
async function verifyApplied(plan) {
  const coll = campaignsCollection();
  const ids = plan.map((c) => c.id);
  const docs = await coll.find({ _id: { $in: ids } }).project({ name: 1, title: 1 }).toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const problems = [];
  for (const c of plan) {
    const doc = byId.get(String(c.id));
    if (!doc) {
      problems.push(`Campaign ${c.id} not found after write`);
      continue;
    }
    if (!doc.title || String(doc.title).trim() === '') {
      problems.push(`Campaign ${c.id} still has no title after write`);
      continue;
    }
    if (doc.title !== c.computedTitle) {
      problems.push(`Campaign ${c.id} title is "${doc.title}", expected "${c.computedTitle}"`);
    }
    if (doc.name !== c.internalName) {
      problems.push(`Campaign ${c.id} internal name changed unexpectedly: was "${c.internalName}", now "${doc.name}"`);
    }
  }
  return problems;
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
    const result = await applyPlan(plan);
    console.log(`Planned:  ${result.planned}`);
    console.log(`Matched:  ${result.matched}`);
    console.log(`Modified: ${result.modified}`);
    console.log(`Skipped (already had a title by write time): ${result.skippedAlreadyFixed}`);
    console.log(`Failed:   ${result.failed.length}`);
    if (result.failed.length > 0) {
      result.failed.forEach((f) => console.error(`  - ${f.id}: ${f.reason}`));
    }

    const expectedModified = result.planned - result.skippedAlreadyFixed;
    if (result.modified !== expectedModified || result.failed.length > 0) {
      console.error(`\nAPPLY DID NOT FULLY SUCCEED: expected ${expectedModified} real modification(s), got ${result.modified}, ${result.failed.length} failed.`);
      process.exitCode = 1;
      return;
    }

    const problems = await verifyApplied(plan);
    if (problems.length) {
      console.error('\nPOST-WRITE VERIFICATION FAILED:');
      problems.forEach((p) => console.error('  - ' + p));
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

module.exports = { computeSafeTitle, buildPlan, applyPlan, verifyApplied };
