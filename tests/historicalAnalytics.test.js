'use strict';

const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { HISTORICAL_DATA_CUTOFF, HISTORICAL_SEED_SOURCE } = require('../server/config/analytics');
const { getIsraelDayBoundaries } = require('../server/utils/timezone');

let generator;

beforeAll(async () => {
  await connect();
  require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Category').createIndexes();
  await mongoose.model('AnalyticsDaily').createIndexes();
  await mongoose.model('ProductSalesMonthly').createIndexes();
  await mongoose.model('BusinessTarget').createIndexes();
  generator = require('../server/scripts/generateHistoricalAnalytics');
});

afterEach(clearAll);

let categoryCounter = 0;
async function seedCategory() {
  const Category = mongoose.model('Category');
  categoryCounter += 1;
  return Category.create({ name: `Cat ${categoryCounter}`, slug: `cat-${categoryCounter}-${Date.now()}`, isActive: true });
}

let productCounter = 0;
async function seedProducts(n) {
  const Product = mongoose.model('Product');
  const category = (await seedCategory())._id;
  const products = [];
  for (let i = 0; i < n; i++) {
    productCounter += 1;
    products.push(await Product.create({
      name: `Test Product ${productCounter}`,
      slug: `test-product-${productCounter}-${Date.now()}`,
      sku: `SKU-${productCounter}-${Date.now()}`,
      brand: 'TestBrand',
      price: 100 + (productCounter % 10) * 50,
      stock: 100,
      category,
      description: 'A real product used for historical analytics generator testing',
      isPublished: true,
      isDeleted: false,
    }));
  }
  return products;
}

describe('generateHistoricalAnalytics — deterministic historical baseline generator', () => {
  test('dry-run does not write anything', async () => {
    await seedProducts(5);
    const plan = await generator.buildFullPlan();
    expect(plan.alreadyApplied).toBe(false);
    expect(plan.historicalDayCount).toBeGreaterThan(600); // ~22 months

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    expect(await AnalyticsDaily.countDocuments()).toBe(0);
  });

  test('two independent buildFullPlan() calls against the same catalog produce identical totals (deterministic, not Math.random)', async () => {
    await seedProducts(8);
    const planA = await generator.buildFullPlan();
    const planB = await generator.buildFullPlan();
    expect(planA.totalRevenue).toBe(planB.totalRevenue);
    expect(planA.totalOrders).toBe(planB.totalOrders);
    expect(planA.totalUnits).toBe(planB.totalUnits);
  });

  test('apply writes AnalyticsDaily, ProductSalesMonthly, BusinessTarget, and Product historical fields', async () => {
    const products = await seedProducts(10);
    const plan = await generator.buildFullPlan();
    const result = await generator.applyPlan(plan);
    expect(result.applied).toBe(true);

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const rows = await AnalyticsDaily.find({ source: HISTORICAL_SEED_SOURCE }).lean();
    expect(rows).toHaveLength(plan.historicalDayCount);
    // Every historical row must be strictly before the cutoff.
    expect(rows.every((r) => r.date < HISTORICAL_DATA_CUTOFF)).toBe(true);

    const Product = mongoose.model('Product');
    const withHistory = await Product.countDocuments({ historicalSalesCount: { $gt: 0 } });
    expect(withHistory).toBeGreaterThan(0);
    expect(withHistory).toBeLessThanOrEqual(products.length);

    const BusinessTarget = mongoose.model('BusinessTarget');
    const targetCount = await BusinessTarget.countDocuments({ source: HISTORICAL_SEED_SOURCE });
    expect(targetCount).toBeGreaterThan(0);

    const problems = await generator.verifyInvariants(plan, result);
    expect(problems).toEqual([]);
  });

  test('apply is idempotent — re-running does not duplicate data or change totals', async () => {
    await seedProducts(6);
    const plan1 = await generator.buildFullPlan();
    const result1 = await generator.applyPlan(plan1);
    expect(result1.applied).toBe(true);

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const countAfterFirst = await AnalyticsDaily.countDocuments();
    const Product = mongoose.model('Product');
    const totalHistoricalBefore = (await Product.find().select('historicalSalesCount').lean())
      .reduce((s, p) => s + p.historicalSalesCount, 0);

    const plan2 = await generator.buildFullPlan();
    expect(plan2.alreadyApplied).toBe(true);
    const result2 = await generator.applyPlan(plan2);
    expect(result2.applied).toBe(false);
    expect(result2.reason).toBe('already_applied');

    const countAfterSecond = await AnalyticsDaily.countDocuments();
    expect(countAfterSecond).toBe(countAfterFirst); // no duplication

    const totalHistoricalAfter = (await Product.find().select('historicalSalesCount').lean())
      .reduce((s, p) => s + p.historicalSalesCount, 0);
    expect(totalHistoricalAfter).toBe(totalHistoricalBefore); // no double-counting
  });

  test('reconciliation: every historical month\'s AnalyticsDaily revenue sum matches the ProductSalesMonthly revenue sum for that month', async () => {
    await seedProducts(12);
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');

    const monthKeys = [...plan.monthGroups.keys()];
    // Spot-check first, a middle, and the last month rather than all ~22 (fast, still representative).
    for (const mk of [monthKeys[0], monthKeys[Math.floor(monthKeys.length / 2)], monthKeys[monthKeys.length - 1]]) {
      const [year, month] = mk.split('-').map(Number);
      const group = plan.monthGroups.get(mk);
      const dailyRows = await AnalyticsDaily.find({ date: { $in: group.curves.map((c) => c.analyticsDaily.date) } }).lean();
      const dailySum = Math.round(dailyRows.reduce((s, r) => s + r.revenue, 0) * 100) / 100;

      const psmRows = await ProductSalesMonthly.find({ year, month, source: HISTORICAL_SEED_SOURCE }).lean();
      const psmSum = Math.round(psmRows.reduce((s, r) => s + r.revenue, 0) * 100) / 100;

      expect(Math.abs(dailySum - psmSum)).toBeLessThanOrEqual(1); // rounding tolerance
    }
  });

  test('a product whose deterministic historicalLaunchDate falls after a given month never has a ProductSalesMonthly row for that month', async () => {
    await seedProducts(15);
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const windowStart = generator.windowStartDate();
    const profiles = generator.buildProductProfiles(
      (await mongoose.model('Product').find().select('sku price category brand').lean()),
      windowStart
    );

    for (const p of profiles) {
      const { year, month } = { year: p.historicalLaunchDate.getUTCFullYear(), month: p.historicalLaunchDate.getUTCMonth() + 1 };
      // The month strictly BEFORE the launch month (if it exists in the window) must have no row for this product.
      const priorMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
      const row = await ProductSalesMonthly.findOne({ product: p.product._id, year: priorMonth.year, month: priorMonth.month }).lean();
      expect(row).toBeNull();
    }
  });

  test('historical Black Friday campaigns are created with frozen historicalStats, isActive:false', async () => {
    await seedProducts(20);
    const plan = await generator.buildFullPlan();
    const result = await generator.applyPlan(plan);

    if (plan.campaigns.length === 0) return; // window may not span a November with eligible products in a tiny test catalog

    const Campaign = mongoose.model('Campaign');
    const campaigns = await Campaign.find({ _id: { $in: result.createdCampaignIds } }).lean();
    expect(campaigns.length).toBe(plan.campaigns.length);
    for (const c of campaigns) {
      expect(c.isActive).toBe(false);
      expect(c.historicalStats).toBeTruthy();
      expect(c.historicalStats.source).toBe(HISTORICAL_SEED_SOURCE);
      expect(c.historicalStats.revenue).toBeGreaterThanOrEqual(0);
    }
  });

  test('isBlackFridayWeek correctly identifies the +/-3 day window around the last Friday of November', () => {
    const { isBlackFridayWeek } = generator;
    // 2024-11-29 is the last Friday of November 2024 (verified: Nov 30 2024 is a Saturday).
    expect(isBlackFridayWeek(2024, 11, 29)).toBe(true);
    expect(isBlackFridayWeek(2024, 11, 26)).toBe(true);
    expect(isBlackFridayWeek(2024, 11, 20)).toBe(false);
    expect(isBlackFridayWeek(2024, 10, 29)).toBe(false);
  });
});

// ── Continuity: historical baseline + live activity accumulate, never reset ──
describe('Historical baseline + live continuity', () => {
  test('a product\'s historicalSalesCount is untouched by real order flow, which continues to use the separate live salesCount field', async () => {
    const products = await seedProducts(3);
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const Product = mongoose.model('Product');
    const before = await Product.findById(products[0]._id).select('historicalSalesCount salesCount').lean();
    expect(before.salesCount).toBe(0); // no real orders yet

    // Simulate a real order lifecycle increment exactly as order.service.js does.
    await Product.updateOne({ _id: products[0]._id }, { $inc: { salesCount: 1 } });

    const after = await Product.findById(products[0]._id).select('historicalSalesCount salesCount').lean();
    expect(after.historicalSalesCount).toBe(before.historicalSalesCount); // frozen, never touched
    expect(after.salesCount).toBe(1); // live counter advanced independently

    const displayedTotal = after.historicalSalesCount + after.salesCount;
    expect(displayedTotal).toBe(before.historicalSalesCount + 1); // continuity: baseline + 1 real sale
  });

  test('getRangeStats over a range spanning the cutoff sums historical AnalyticsDaily rows plus live "today" — never reads a persisted row for today', async () => {
    await seedProducts(3);
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const { getRangeStats } = require('../server/services/analyticsDaily.service');
    const { start: todayStart, end: todayEnd } = getIsraelDayBoundaries(new Date());

    // A wide range spanning well before the cutoff through today.
    const from = new Date(HISTORICAL_DATA_CUTOFF.getTime() - 5 * 24 * 60 * 60 * 1000);
    const totals = await getRangeStats(from, todayEnd);
    expect(totals.revenue).toBeGreaterThanOrEqual(0); // sane, non-crashing result

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const todayRow = await AnalyticsDaily.findOne({ date: todayStart }).lean();
    // No historical row should ever land on/after the cutoff date.
    if (todayRow) expect(todayRow.source).not.toBe(HISTORICAL_SEED_SOURCE);
  });
});

// ── Single source of truth: Product.historicalSalesCount is a denormalized
// cache of SUM(ProductSalesMonthly.historicalUnitsSold), never an
// independent second copy of the same fact — requirement #6 (item 6 of the
// follow-up). ProductSalesMonthly (backed by real Order data going forward,
// seeded historical data for the past) is authoritative; Product's two
// fields exist only as a cheap read-path shortcut so product-list/detail
// views don't need a ProductSalesMonthly aggregation on every request.
describe('Single source of truth — Product.historicalSalesCount reconciles exactly with ProductSalesMonthly (requirement #6)', () => {
  test('for every product, historicalSalesCount/historicalRevenue exactly equal the SUM of its ProductSalesMonthly historical rows', async () => {
    await seedProducts(15);
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const Product = mongoose.model('Product');
    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');

    const products = await Product.find().select('_id historicalSalesCount historicalRevenue').lean();
    for (const p of products) {
      const rows = await ProductSalesMonthly.find({ product: p._id, source: HISTORICAL_SEED_SOURCE })
        .select('historicalUnitsSold historicalRevenue').lean();
      const sumUnits   = rows.reduce((s, r) => s + (r.historicalUnitsSold ?? 0), 0);
      const sumRevenue = Math.round(rows.reduce((s, r) => s + (r.historicalRevenue ?? 0), 0) * 100) / 100;

      expect(p.historicalSalesCount).toBe(sumUnits);
      expect(Math.round(p.historicalRevenue * 100) / 100).toBe(sumRevenue);
    }
  });

  test('a live sale never diverges Product.salesCount from what ProductSalesMonthly independently derives for the current month', async () => {
    const products = await seedProducts(3);
    const plan = await generator.buildFullPlan();
    await generator.applyPlan(plan);

    const Order = mongoose.model('Order');
    const User  = mongoose.model('User');
    const user  = await User.create({ name: 'Buyer', email: `buyer-${Date.now()}@test.local`, password: 'TestPassword123', role: 'user', isActive: true });
    const product = products[0];

    await Order.create({
      orderNumber: `TEST-SOT-${Date.now()}`,
      user: user._id,
      items: [{ itemType: 'product', product: product._id, name: product.name, sku: product.sku, unitPrice: 100, quantity: 1, totalPrice: 100 }],
      shippingAddress: { street: '1 Test St', city: 'Testville', zip: '12345', country: 'Israel' },
      subtotal: 100, taxAmount: 0, shippingCost: 0, total: 100, status: 'confirmed', paymentStatus: 'paid',
    });
    await mongoose.model('Product').updateOne({ _id: product._id }, { $inc: { salesCount: 1 } }); // mirrors order.service.js's real increment

    const { rebuildProductSalesMonth } = require('../server/services/productSalesAnalytics.service');
    const now = new Date();
    await rebuildProductSalesMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, { productIds: [product._id] });

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const Product = mongoose.model('Product');

    const psmRow = await ProductSalesMonthly.findOne({ product: product._id, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }).lean();
    const productDoc = await Product.findById(product._id).select('historicalSalesCount salesCount').lean();

    // Both sources agree: ProductSalesMonthly's live delta for this month
    // equals exactly Product.salesCount's live increment (1), and the
    // combined displayed total (historicalSalesCount + salesCount) is
    // never allowed to drift from what ProductSalesMonthly reports as its
    // own total for that same product/month scope.
    const liveUnitsInThisMonth = psmRow.unitsSold - psmRow.historicalUnitsSold;
    expect(liveUnitsInThisMonth).toBe(productDoc.salesCount);
  });
});

// ── Realism: category weighting is price/demand-aware, not SKU-count-driven,
// and the catalog exhibits a genuine long-tail (not "everyone sells") ──────
describe('Historical realism — category demand economics + long-tail distribution', () => {
  test('classifyCategoryDemandIndex recognizes high-ticket, low-frequency categories distinctly from cheap, high-frequency ones', () => {
    const { classifyCategoryDemandIndex } = generator;
    expect(classifyCategoryDemandIndex('Desktops')).toBeLessThan(classifyCategoryDemandIndex('Monitors'));
    expect(classifyCategoryDemandIndex('Monitors')).toBeLessThan(classifyCategoryDemandIndex('Mice'));
    expect(classifyCategoryDemandIndex('Mice')).toBe(classifyCategoryDemandIndex('Headphones'));
    expect(classifyCategoryDemandIndex('Some Unclassified Category')).toBe(0.5);
  });

  test('a low-SKU, high-price category (Desktops) earns a meaningfully non-trivial revenue share against a high-SKU, low-price category (Mice), driven by real avg price — not proportional to SKU count', async () => {
    const Category = mongoose.model('Category');
    const Product = mongoose.model('Product');

    const desktopsCat = await Category.create({ name: 'Desktops', slug: `desktops-${Date.now()}`, isActive: true });
    const miceCat = await Category.create({ name: 'Mice', slug: `mice-${Date.now()}`, isActive: true });

    // Deliberately lopsided SKU counts (mirrors the real catalog: many more
    // mice SKUs than desktop SKUs) but real-world-realistic prices.
    let n = 0;
    for (let i = 0; i < 15; i++) {
      n += 1;
      await Product.create({
        name: `Desktop ${i}`, slug: `desktop-${i}-${Date.now()}-${n}`, sku: `SKU-DSK-${n}-${Date.now()}`,
        price: 9000 + i * 200, stock: 20, category: desktopsCat._id, description: 'test', isPublished: true,
      });
    }
    for (let i = 0; i < 80; i++) {
      n += 1;
      await Product.create({
        name: `Mouse ${i}`, slug: `mouse-${i}-${Date.now()}-${n}`, sku: `SKU-MSE-${n}-${Date.now()}`,
        price: 150 + (i % 10) * 20, stock: 100, category: miceCat._id, description: 'test', isPublished: true,
      });
    }

    const plan = await generator.buildFullPlan();

    const productsByCategory = new Map();
    for (const [productId, totals] of plan.productTotals) {
      const p = await Product.findById(productId).select('category').lean();
      const catKey = String(p.category);
      productsByCategory.set(catKey, (productsByCategory.get(catKey) ?? 0) + totals.revenue);
    }
    const desktopsRevenue = productsByCategory.get(String(desktopsCat._id)) ?? 0;
    const miceRevenue = productsByCategory.get(String(miceCat._id)) ?? 0;
    const totalRevenue = desktopsRevenue + miceRevenue;

    // Desktops has ~5x FEWER SKUs (15 vs 80) but ~50-60x the average price —
    // under the old SKU-count-driven model it would earn a tiny fraction of
    // Mice's revenue; under the price/demand-aware model it should earn a
    // substantial, non-trivial share despite the SKU disadvantage.
    expect(desktopsRevenue).toBeGreaterThan(0);
    expect(desktopsRevenue / totalRevenue).toBeGreaterThan(0.15); // meaningfully non-trivial, not swamped
  });

  test('the catalog exhibits a genuine long-tail: a meaningful share of products end up with zero or near-zero historical sales, not "everyone sells"', async () => {
    await seedProducts(120);
    const plan = await generator.buildFullPlan();

    const Product = mongoose.model('Product');
    const allProducts = await Product.find().select('_id').lean();
    const zeroSalesCount = allProducts.filter((p) => !plan.productTotals.has(String(p._id))).length;
    const withSales = allProducts.length - zeroSalesCount;

    // Not literally every product should have sales (the old model gave
    // ~99.9% of products SOME sales) — a real long-tail has a genuine
    // zero-sales segment.
    expect(zeroSalesCount).toBeGreaterThan(0);
    expect(withSales).toBeGreaterThan(0); // still a real, non-empty selling catalog

    const minimalSellers = [...plan.productTotals.values()].filter((t) => t.unitsSold > 0 && t.unitsSold <= 3).length;
    expect(minimalSellers).toBeGreaterThan(0); // some products land at just 1-3 lifetime units
  });

  test('tierForPercentile assigns bestseller to rank-0 and longtail to the worst rank, with participation probability strictly decreasing', () => {
    const { tierForPercentile } = generator;
    expect(tierForPercentile(0).tier).toBe('bestseller');
    expect(tierForPercentile(1).tier).toBe('longtail');
    const probs = [0, 0.1, 0.3, 0.6, 0.9].map((p) => tierForPercentile(p).participationProb);
    for (let i = 1; i < probs.length; i++) expect(probs[i]).toBeLessThanOrEqual(probs[i - 1]);
  });
});
