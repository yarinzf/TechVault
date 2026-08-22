'use strict';

const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { HISTORICAL_DATA_CUTOFF, HISTORICAL_SEED_SOURCE } = require('../server/config/analytics');
const { getIsraelDayBoundaries, israelMidnightUtc } = require('../server/utils/timezone');

let generator, analyticsDailySvc, productSalesSvc;

beforeAll(async () => {
  await connect();
  require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Category').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('User').createIndexes();
  await mongoose.model('AnalyticsDaily').createIndexes();
  await mongoose.model('ProductSalesMonthly').createIndexes();
  generator          = require('../server/scripts/generateHistoricalAnalytics');
  analyticsDailySvc  = require('../server/services/analyticsDaily.service');
  productSalesSvc    = require('../server/services/productSalesAnalytics.service');
});

afterEach(clearAll);

let categoryCounter = 0;
async function seedCategory() {
  const Category = mongoose.model('Category');
  categoryCounter += 1;
  return Category.create({ name: `Cat ${categoryCounter}`, slug: `cat-${categoryCounter}-${Date.now()}`, isActive: true });
}

let productCounter = 0;
async function seedProduct() {
  const Product = mongoose.model('Product');
  productCounter += 1;
  const category = (await seedCategory())._id;
  return Product.create({
    name: `Boundary Product ${productCounter}`, slug: `boundary-product-${productCounter}-${Date.now()}`,
    sku: `SKU-BND-${productCounter}-${Date.now()}`, brand: 'TestBrand', price: 200, stock: 100, category,
    description: 'test', isPublished: true,
  });
}

let userCounter = 0;
async function seedUser() {
  const User = mongoose.model('User');
  userCounter += 1;
  return User.create({
    name: `Buyer ${userCounter}`, email: `buyer-${userCounter}-${Date.now()}@test.local`,
    password: 'TestPassword123', role: 'user', isActive: true,
  });
}

let orderCounter = 0;
async function seedPaidOrder({ user, product, unitPrice = 200, createdAt }) {
  const Order = mongoose.model('Order');
  orderCounter += 1;
  const order = await Order.create({
    orderNumber: `TEST-BND-${orderCounter}-${Date.now()}`,
    user: user._id,
    items: [{
      itemType: 'product', product: product._id, name: product.name, sku: product.sku,
      unitPrice, quantity: 1, totalPrice: unitPrice,
    }],
    shippingAddress: { street: '1 Test St', city: 'Testville', zip: '12345', country: 'Israel' },
    subtotal: unitPrice, taxAmount: 0, shippingCost: 0, total: unitPrice,
    status: 'confirmed', paymentStatus: 'paid',
  });
  if (createdAt) {
    await mongoose.connection.collection('orders').updateOne({ _id: order._id }, { $set: { createdAt } });
  }
  return order;
}

// The exact boundary instants the brief asks for, expressed as real UTC
// instants: 2026-08-21 23:59:00 Israel time and 2026-08-22 00:00:00 Israel
// time. August is Israel Daylight Time (UTC+3).
const AUG_21_2359_ISRAEL = new Date('2026-08-21T20:59:00.000Z'); // 23:59 Israel
const AUG_22_0000_ISRAEL = new Date('2026-08-21T21:00:00.000Z'); // 00:00 Israel — exactly HISTORICAL_DATA_CUTOFF

describe('Historical cutoff boundary — zero overlap, zero gap (requirement #5)', () => {
  test('HISTORICAL_DATA_CUTOFF is exactly Israel midnight beginning 2026-08-22', () => {
    expect(HISTORICAL_DATA_CUTOFF.getTime()).toBe(israelMidnightUtc(2026, 8, 22).getTime());
    expect(HISTORICAL_DATA_CUTOFF.getTime()).toBe(AUG_22_0000_ISRAEL.getTime());
  });

  test('the historical generator never produces an AnalyticsDaily row on or after the cutoff', async () => {
    await seedProduct();
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const onOrAfterCutoff = await AnalyticsDaily.countDocuments({
      source: HISTORICAL_SEED_SOURCE,
      date: { $gte: HISTORICAL_DATA_CUTOFF },
    });
    expect(onOrAfterCutoff).toBe(0);

    // The LAST historical row is exactly 2026-08-21 (Israel) — the day
    // immediately before the cutoff — never later, never earlier by more
    // than the configured window.
    const lastRow = await AnalyticsDaily.findOne({ source: HISTORICAL_SEED_SOURCE }).sort({ date: -1 }).lean();
    expect(lastRow.date.getTime()).toBe(israelMidnightUtc(2026, 8, 21).getTime());
  });

  test('21 Aug 23:59 Israel time: a real order at this instant does NOT alter the seeded historical Aug 21 AnalyticsDaily row (pre-cutoff real activity is never merged into the historical narrative)', async () => {
    await seedProduct();
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const aug21Row = await AnalyticsDaily.findOne({ date: israelMidnightUtc(2026, 8, 21) }).lean();
    expect(aug21Row).toBeTruthy();
    expect(aug21Row.source).toBe(HISTORICAL_SEED_SOURCE);
    const revenueBefore = aug21Row.revenue;

    const user = await seedUser();
    const product = await seedProduct();
    await seedPaidOrder({ user, product, unitPrice: 12345, createdAt: AUG_21_2359_ISRAEL });

    const aug21RowAfter = await AnalyticsDaily.findOne({ date: israelMidnightUtc(2026, 8, 21) }).lean();
    expect(aug21RowAfter.revenue).toBe(revenueBefore); // completely unchanged — see analytics-architecture.md
  });

  test('22 Aug 00:00 Israel time (exactly the cutoff instant): a real order here IS live and is counted in "today" live computation', async () => {
    await seedProduct();
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const user = await seedUser();
    const product = await seedProduct();
    await seedPaidOrder({ user, product, unitPrice: 777, createdAt: AUG_22_0000_ISRAEL });

    const { start, end } = getIsraelDayBoundaries(AUG_22_0000_ISRAEL);
    expect(start.getTime()).toBe(HISTORICAL_DATA_CUTOFF.getTime());
    const liveStats = await analyticsDailySvc.computeLiveDayStats(start, end);
    expect(liveStats.revenue).toBe(777);
  });

  test('one millisecond before the cutoff is historical-eligible; the cutoff instant itself is live — no shared millisecond', async () => {
    const justBefore = new Date(HISTORICAL_DATA_CUTOFF.getTime() - 1);
    const { start: justBeforeDayStart } = getIsraelDayBoundaries(justBefore);
    const { start: cutoffDayStart } = getIsraelDayBoundaries(HISTORICAL_DATA_CUTOFF);
    expect(justBeforeDayStart.getTime()).toBeLessThan(HISTORICAL_DATA_CUTOFF.getTime());
    expect(cutoffDayStart.getTime()).toBe(HISTORICAL_DATA_CUTOFF.getTime());
    expect(justBeforeDayStart.getTime()).not.toBe(cutoffDayStart.getTime());
  });

  test('August 2026 ProductSalesMonthly: historical Aug 1-21 baseline + real Aug 22+ live orders accumulate exactly once (regression guard for the additive-rebuild fix)', async () => {
    const product = await seedProduct();
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const rowBefore = await ProductSalesMonthly.findOne({ product: product._id, year: 2026, month: 8 }).lean();

    // Not every product necessarily has historical August sales (the
    // generator's popularity-weighted allocation can legitimately give a
    // product zero sales in a given month) — skip gracefully if so, the
    // real assertion below still exercises the additive-vs-destructive
    // rebuild path either way (0 + real = real, not a fabricated erasure).
    const historicalBaseline = rowBefore?.historicalUnitsSold ?? 0;

    const user = await seedUser();
    await seedPaidOrder({ user, product, unitPrice: 200, createdAt: AUG_22_0000_ISRAEL });

    await productSalesSvc.rebuildProductSalesMonth(2026, 8, { productIds: [product._id] });
    const rowAfterOnce = await ProductSalesMonthly.findOne({ product: product._id, year: 2026, month: 8 }).lean();
    expect(rowAfterOnce.unitsSold).toBe(historicalBaseline + 1);
    expect(rowAfterOnce.historicalUnitsSold).toBe(historicalBaseline); // frozen, untouched

    // Simulates a retried/duplicate webhook delivery for the SAME real
    // order — re-running the rebuild must NOT double-count it (item #7).
    await productSalesSvc.rebuildProductSalesMonth(2026, 8, { productIds: [product._id] });
    const rowAfterTwice = await ProductSalesMonthly.findOne({ product: product._id, year: 2026, month: 8 }).lean();
    expect(rowAfterTwice.unitsSold).toBe(historicalBaseline + 1); // still +1, not +2
  });

  test('a product with ZERO historical August sales still correctly accumulates a real live order (no historical row required for the mechanism to work)', async () => {
    await seedProduct(); // unrelated product, absorbs some of the historical allocation
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    // A brand-new product created AFTER the historical seed ran — no
    // historicalUnitsSold row exists for it at all yet.
    const freshProduct = await seedProduct();
    const user = await seedUser();
    await seedPaidOrder({ user, product: freshProduct, unitPrice: 200, createdAt: AUG_22_0000_ISRAEL });

    await productSalesSvc.rebuildProductSalesMonth(2026, 8, { productIds: [freshProduct._id] });
    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: freshProduct._id, year: 2026, month: 8 }).lean();
    expect(row.unitsSold).toBe(1);
    expect(row.historicalUnitsSold).toBe(0);
  });

  test('a cancelled real order in the cutoff month resets the live delta to zero WITHOUT erasing the historical baseline for that product/month', async () => {
    const product = await seedProduct();
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const rowBefore = await ProductSalesMonthly.findOne({ product: product._id, year: 2026, month: 8 }).lean();
    const historicalBaseline = rowBefore?.historicalUnitsSold ?? 0;

    const user = await seedUser();
    const order = await seedPaidOrder({ user, product, unitPrice: 200, createdAt: AUG_22_0000_ISRAEL });
    await productSalesSvc.rebuildProductSalesMonth(2026, 8, { productIds: [product._id] });

    await mongoose.model('Order').updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
    await productSalesSvc.rebuildProductSalesMonth(2026, 8, { productIds: [product._id] });

    const rowAfter = await ProductSalesMonthly.findOne({ product: product._id, year: 2026, month: 8 }).lean();
    expect(rowAfter.unitsSold).toBe(historicalBaseline); // live delta reset to 0, historical preserved
    expect(rowAfter.historicalUnitsSold).toBe(historicalBaseline); // never touched
  });
});
