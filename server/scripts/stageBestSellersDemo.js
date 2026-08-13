#!/usr/bin/env node
'use strict';

/**
 * stageBestSellersDemo.js — LOCAL/DEV-ONLY visual QA helper. NEVER production.
 *
 * Populates the LOCAL dev database with real Orders (using existing, real
 * Product documents — never fake ones) dated across several real calendar
 * months, so BOTH Best Sellers rankings (overall/lifetime and current-month)
 * — and the Admin per-product monthly sales-history view — can be visually
 * reviewed with genuinely independent, verifiable numbers.
 *
 * Design (verified by hand — see the comment above DEMO_PLAN):
 *   OVERALL TOP 4:  Legacy Champion (87) > Steady Seller (55) >
 *                    Old Reliable (43) > Fading Star (40)
 *   MONTH TOP 4:    Rising Star (30) > Trending Now (22) >
 *                    Old Reliable (18) > Monthly Mover (15)
 *   "Old Reliable" deliberately appears in BOTH — a real product that is
 *   simultaneously a top-4 overall seller and a top-4 seller this month,
 *   demonstrating that duplication between sections is expected, not a bug.
 *   "Legacy Champion" is deliberately spread across 5 distinct real months
 *   (including last month) so the Admin sales-history chart/table and the
 *   current/previous-month/MoM% summary all have real, non-trivial data —
 *   run server/scripts/rebuildProductSalesMonthly.js afterward to
 *   materialize ProductSalesMonthly for the Admin view (the public Best
 *   Sellers page itself needs no rebuild — it reads live from Orders).
 *
 * Every order/user this script creates is tagged with the fixed marker
 * prefix below, so re-running safely resets only its own prior state
 * (never any other real order, and never the Clearance demo data staged
 * separately by stageClearanceDemo.js, nor the original single-month
 * best-sellers demo this replaces). It does not touch any Product
 * document — no stock/price/campaign field is modified.
 *
 * Never wired into seeds, startup, CI, or any deployment/production
 * workflow. Run manually only:
 *
 *   node server/scripts/stageBestSellersDemo.js
 *
 * Then, to populate the Admin sales-history view:
 *
 *   node server/scripts/rebuildProductSalesMonthly.js --from=YYYY-MM --to=YYYY-MM
 *   (exact range printed at the end of this script's own output)
 */

const mongoose = require('mongoose');

const MARKER = 'LOCAL-QA-BESTSELLERS';
const DEMO_BUYER_EMAIL = 'local-qa-bestsellers-buyer@techvault.local';

// Real, existing local products (different from both the Clearance demo
// and the original single-month Best Sellers demo this replaces).
const PRODUCTS = {
  legacyChampion: '6a25d9241fdf9b799de68c28', // Apple AirPods Pro (2nd Gen) — headsets
  steadySeller:   '6a1e2d767ee7bb66172afa19', // Sony WH-1000XM5 — headsets
  fadingStar:     '6a1e333ba8817c5b6d380d89', // Logitech G Pro X Superlight 2 — mice
  oldReliable:    '6a1e333ba8817c5b6d380e59', // Razer Naga V2 Pro — mice
  risingStar:     '6a1e35b633c8c5d6e6afc5b5', // Alienware AW3423DWF — monitors
  trendingNow:    '6a1e35b260a3a8e66b0ea283', // Keychron Q1 Pro — keyboards
  monthlyMover:   '6a1e3340cca93bb136ab9659', // HP ProDesk 400 G9 Desktop Mini i5 — desktops
};

// { productKey, quantity, monthsAgo } — monthsAgo: 0 = current month, 1 = last month, etc.
const ORDER_PLAN = [
  // Legacy Champion — spread across 5 real months (incl. last month), 0 this month.
  { productKey: 'legacyChampion', quantity: 15, monthsAgo: 5 },
  { productKey: 'legacyChampion', quantity: 22, monthsAgo: 4 },
  { productKey: 'legacyChampion', quantity: 18, monthsAgo: 3 },
  { productKey: 'legacyChampion', quantity: 20, monthsAgo: 2 },
  { productKey: 'legacyChampion', quantity: 12, monthsAgo: 1 },
  // Steady Seller — single old-month order.
  { productKey: 'steadySeller',   quantity: 55, monthsAgo: 4 },
  // Fading Star — single old-month order.
  { productKey: 'fadingStar',     quantity: 40, monthsAgo: 3 },
  // Old Reliable — old-month PLUS this-month, appears in both sections.
  { productKey: 'oldReliable',    quantity: 25, monthsAgo: 3 },
  { productKey: 'oldReliable',    quantity: 18, monthsAgo: 0 },
  // Rising Star / Trending Now / Monthly Mover — this month only.
  { productKey: 'risingStar',     quantity: 30, monthsAgo: 0 },
  { productKey: 'trendingNow',    quantity: 22, monthsAgo: 0 },
  { productKey: 'monthlyMover',   quantity: 15, monthsAgo: 0 },
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
  if (dbName === 'techvault' || /prod/i.test(dbName)) {
    throw new Error(`ABORT — connected database name "${dbName}" looks like production`);
  }
}

// Middle of the real calendar month N months before the current one (UTC) —
// matches getUtcMonthBoundaries in recommendation.service.js, so these
// orders land unambiguously inside (never right at the edge of) whichever
// month they're meant to demonstrate.
function monthsAgoMiddle(monthsAgo) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 15, 12, 0, 0));
}

// ── Pure staging logic — assumes a Mongoose connection is already open ─────
async function stageBestSellersDemo({ verbose = true } = {}) {
  const say = verbose ? console.log : () => {};
  const Product = require('../models/Product');
  const Order   = require('../models/Order');
  const User    = require('../models/User');

  say(`Connected DB: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  const escapedMarker = MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const deletedOrders = await Order.deleteMany({ orderNumber: { $regex: '^' + escapedMarker } });
  if (deletedOrders.deletedCount) say(`Removed ${deletedOrders.deletedCount} previously-staged demo order(s).`);
  await User.deleteOne({ email: DEMO_BUYER_EMAIL });

  const buyer = await User.create({
    name: 'Local QA Bestsellers Buyer',
    email: DEMO_BUYER_EMAIL,
    password: 'LocalQaOnly123',
    role: 'user',
    isActive: true,
  });

  const productDocs = {};
  for (const [key, id] of Object.entries(PRODUCTS)) {
    const product = await Product.findById(id).select('name price isPublished isDeleted').lean();
    if (!product) { say(`SKIP — product ${id} (${key}) not found locally`); continue; }
    if (!product.isPublished || product.isDeleted) { say(`SKIP — "${product.name}" (${key}) is unpublished/deleted`); continue; }
    productDocs[key] = product;
  }

  const results = [];
  let seq = 0;
  let minMonthsAgo = 0, maxMonthsAgo = 0;

  for (const item of ORDER_PLAN) {
    const product = productDocs[item.productKey];
    if (!product) continue;
    seq += 1;
    minMonthsAgo = Math.max(minMonthsAgo, item.monthsAgo);
    maxMonthsAgo = Math.min(maxMonthsAgo, 0);

    const unitPrice = product.price;
    const order = await Order.create({
      orderNumber: `${MARKER}-${seq}-${Date.now()}`,
      user: buyer._id,
      items: [{
        itemType: 'product',
        product: product._id,
        name: product.name,
        sku: `SKU-${product._id}`,
        image: '',
        unitPrice,
        quantity: item.quantity,
        totalPrice: unitPrice * item.quantity,
      }],
      shippingAddress: { street: '1 Local QA St', city: 'Testville', zip: '00000', country: 'Israel' },
      subtotal: unitPrice * item.quantity,
      taxAmount: 0,
      shippingCost: 0,
      total: unitPrice * item.quantity,
      status: 'confirmed',
      paymentStatus: 'paid',
      notes: 'LOCAL QA Best Sellers demo order — safe to delete, never touches Product.stock/price/campaigns.',
    });

    const createdAt = monthsAgoMiddle(item.monthsAgo);
    await mongoose.connection.collection('orders').updateOne({ _id: order._id }, { $set: { createdAt } });

    results.push({
      product: product.name, productKey: item.productKey,
      quantity: item.quantity, monthsAgo: item.monthsAgo,
      createdAt, orderNumber: order.orderNumber,
    });
  }

  const now = new Date();
  const rangeFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - minMonthsAgo, 1));
  const rangeTo   = now;

  return {
    results,
    rebuildRangeFrom: `${rangeFrom.getUTCFullYear()}-${String(rangeFrom.getUTCMonth() + 1).padStart(2, '0')}`,
    rebuildRangeTo:   `${rangeTo.getUTCFullYear()}-${String(rangeTo.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

// ── CLI wrapper ──────────────────────────────────────────────────────────────
async function runAsCli() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  assertLocalSafety();
  process.env.NODE_ENV = 'development';

  const { connectDB } = require('../config/db');
  await connectDB();
  try {
    assertConnectionIsLocal();
    const { results, rebuildRangeFrom, rebuildRangeTo } = await stageBestSellersDemo();

    console.log('\n=== Staged LOCAL best-sellers demo (kept in place — not cleaned up) ===');
    const byProduct = new Map();
    results.forEach((r) => {
      if (!byProduct.has(r.product)) byProduct.set(r.product, []);
      byProduct.get(r.product).push(r);
    });
    for (const [product, orders] of byProduct) {
      console.log(`\n${product}`);
      orders.forEach((o) => console.log(`  ${o.quantity} units, ${o.monthsAgo === 0 ? 'this month' : `${o.monthsAgo} month(s) ago`} (${o.createdAt.toISOString().slice(0, 10)})`));
    }

    console.log('\nTo populate the Admin sales-history view, run:');
    console.log(`  node server/scripts/rebuildProductSalesMonthly.js --from=${rebuildRangeFrom} --to=${rebuildRangeTo}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nstageBestSellersDemo failed:', err.message);
    process.exit(1);
  });
}

module.exports = stageBestSellersDemo;
