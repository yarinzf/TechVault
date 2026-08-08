#!/usr/bin/env node
'use strict';

/**
 * rebuildProductSalesMonthly.js — reusable maintenance tooling (committed,
 * production-safe code), NOT a local-only QA script.
 *
 * Recomputes ProductSalesMonthly rows directly from real Order/OrderItem
 * history for one month or an inclusive date range. Orders remain the sole
 * source of truth — this script is how the materialized monthly analytics
 * table gets (re)built or reconciled after the fact (e.g. after a batch of
 * orders were cancelled/refunded and the cached numbers need to catch up).
 * Safe to run repeatedly for the same month(s) — see
 * productSalesAnalytics.service.js#rebuildProductSalesMonth for exactly
 * how the upsert-then-remove-stale-rows reconciliation works.
 *
 * Deliberately NOT wired into server startup, seeds, CI, or deployment —
 * always a conscious, manual (or later, admin/cron-triggered) action.
 *
 * CLI usage:
 *   node server/scripts/rebuildProductSalesMonthly.js --month=2026-08
 *   node server/scripts/rebuildProductSalesMonthly.js --from=2026-05 --to=2026-08
 *   node server/scripts/rebuildProductSalesMonthly.js --month=2026-08 --dry-run
 *
 * With no --month/--from+--to, defaults to the current calendar month.
 * Targets whichever database NODE_ENV/MONGO_URI currently resolve to (the
 * same connectDB() every other maintenance script in this repo uses) — it
 * is intentionally NOT restricted to local-only, since a legitimate future
 * use is running it against production. This session only ever ran it
 * against local dev.
 */

const mongoose = require('mongoose');
const { rebuildProductSalesMonth, rebuildProductSalesRange } = require('../services/productSalesAnalytics.service');

function parseYearMonth(value, flagName) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!m) throw new Error(`Invalid ${flagName} value "${value}" — expected YYYY-MM`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid ${flagName} value "${value}" — month must be 1-12`);
  return { year, month };
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    args[m[1]] = m[2] ?? true;
  }
  return args;
}

async function runAsCli() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });

  const args = parseArgs(process.argv.slice(2));
  const dryRun = args['dry-run'] === true;

  let fromYear, fromMonth, toYear, toMonth;
  if (args.month) {
    ({ year: fromYear, month: fromMonth } = parseYearMonth(args.month, '--month'));
    toYear = fromYear; toMonth = fromMonth;
  } else if (args.from && args.to) {
    ({ year: fromYear, month: fromMonth } = parseYearMonth(args.from, '--from'));
    ({ year: toYear, month: toMonth } = parseYearMonth(args.to, '--to'));
  } else {
    const now = new Date();
    fromYear = toYear = now.getUTCFullYear();
    fromMonth = toMonth = now.getUTCMonth() + 1;
  }

  const { connectDB } = require('../config/db');
  await connectDB();
  try {
    console.log(`Connected DB: ${mongoose.connection.name} @ ${mongoose.connection.host}`);
    console.log(`Rebuilding ProductSalesMonthly for ${fromYear}-${String(fromMonth).padStart(2, '0')} through ${toYear}-${String(toMonth).padStart(2, '0')}${dryRun ? ' (DRY RUN — no writes)' : ''}\n`);

    const results = fromYear === toYear && fromMonth === toMonth
      ? [await rebuildProductSalesMonth(fromYear, fromMonth, { dryRun })]
      : await rebuildProductSalesRange(fromYear, fromMonth, toYear, toMonth, { dryRun });

    for (const r of results) {
      console.log(`${r.year}-${String(r.month).padStart(2, '0')}: ${r.productsWithSales} product(s) with real sales, ${r.staleRecordsRemoved} stale record(s) removed`);
      r.rows.forEach((row) => console.log(`  product ${row.product}: unitsSold=${row.unitsSold} orderCount=${row.orderCount} revenue=${row.revenue}`));
    }

    console.log(dryRun ? '\nDRY RUN — no data was written.' : '\nRebuild complete.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nrebuildProductSalesMonthly failed:', err.message);
    process.exit(1);
  });
}

module.exports = { rebuildProductSalesMonth, rebuildProductSalesRange };
