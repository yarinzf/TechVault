'use strict';

const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { HISTORICAL_DATA_CUTOFF } = require('../server/config/analytics');
const { getIsraelMonthBoundaries, getIsraelDateParts, toIsraelDateKey } = require('../server/utils/timezone');

let adminService, analyticsService, reportService, generator;

beforeAll(async () => {
  await connect();
  require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Category').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('User').createIndexes();
  await mongoose.model('AnalyticsDaily').createIndexes();
  await mongoose.model('ProductSalesMonthly').createIndexes();
  await mongoose.model('BusinessTarget').createIndexes();
  adminService     = require('../server/services/admin.service');
  analyticsService = require('../server/services/analytics.service');
  reportService     = require('../server/services/report.service');
  generator         = require('../server/scripts/generateHistoricalAnalytics');
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
      name: `Reconcile Product ${productCounter}`,
      slug: `reconcile-product-${productCounter}-${Date.now()}`,
      sku: `SKU-RC-${productCounter}-${Date.now()}`,
      brand: 'TestBrand', price: 150 + (productCounter % 5) * 40, stock: 200, category,
      description: 'test', isPublished: true,
    }));
  }
  return products;
}

async function seedHistoricalBaseline() {
  await seedProducts(10);
  const plan = await generator.buildFullPlan();
  await generator.applyPlan(plan);
  return plan;
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
async function seedPaidOrder({ user, product, unitPrice = 200 }) {
  const Order = mongoose.model('Order');
  orderCounter += 1;
  return Order.create({
    orderNumber: `TEST-RC-${orderCounter}-${Date.now()}`,
    user: user._id,
    items: [{
      itemType: 'product', product: product._id, name: product.name, sku: product.sku,
      unitPrice, quantity: 1, totalPrice: unitPrice,
    }],
    shippingAddress: { street: '1 Test St', city: 'Testville', zip: '12345', country: 'Israel' },
    subtotal: unitPrice, taxAmount: 0, shippingCost: 0, total: unitPrice,
    status: 'confirmed', paymentStatus: 'paid',
  });
}

// A fixed range spanning well before the cutoff through "now" — always
// crosses the historical/live boundary, exactly the scenario the user
// flagged as a blocker (Dashboard/Analytics showing historical revenue,
// Reports exporting a different/empty number for the same range).
function fullHistoricalPlusLiveRange() {
  return { dateFrom: '2024-01-01', dateTo: new Date().toISOString().slice(0, 10) };
}

describe('Reports/Analytics/Dashboard reconciliation — same date range, same totals', () => {
  test('Dashboard all-time revenue.total equals Sales Report all-time summary.gross', async () => {
    await seedHistoricalBaseline();

    const dashboard = await adminService.getDashboard();
    const salesReport = await reportService.getSalesReport({});

    expect(dashboard.revenue.total).toBe(salesReport.summary.gross);
    expect(dashboard.revenue.total).toBeGreaterThan(0); // sanity: historical baseline actually produced real numbers
  });

  test('Analytics Overview revenue.gross equals Sales Report summary.gross for the SAME explicit range', async () => {
    await seedHistoricalBaseline();
    const range = fullHistoricalPlusLiveRange();

    const overview = await analyticsService.getOverview(range);
    const salesReport = await reportService.getSalesReport(range);

    expect(overview.revenue.gross).toBe(salesReport.summary.gross);
    expect(overview.revenue.ordersCount).toBe(salesReport.summary.ordersCount);
  });

  test('Analytics Revenue Analytics summary equals Sales Report summary for the SAME range', async () => {
    await seedHistoricalBaseline();
    const range = fullHistoricalPlusLiveRange();

    const revenueAnalytics = await analyticsService.getRevenueAnalytics(range);
    const salesReport = await reportService.getSalesReport(range);

    expect(revenueAnalytics.summary.gross).toBe(salesReport.summary.gross);
    expect(revenueAnalytics.summary.net).toBe(salesReport.summary.net);
    expect(revenueAnalytics.summary.refunded).toBe(salesReport.summary.refunded);
    expect(revenueAnalytics.summary.ordersCount).toBe(salesReport.summary.ordersCount);
  });

  test('Dashboard SalesChart series (admin.service.getRevenue) day-bucketed total equals Sales Report day-bucketed total', async () => {
    await seedHistoricalBaseline();
    const range = { ...fullHistoricalPlusLiveRange(), period: 'day' };

    const chartSeries = await adminService.getRevenue(range);
    const salesReport = await reportService.getSalesReport(range);

    const chartTotal  = chartSeries.reduce((s, r) => s + r.revenue, 0);
    const reportTotal = salesReport.rows.reduce((s, r) => s + r.revenue, 0);
    expect(Math.round(chartTotal * 100) / 100).toBe(Math.round(reportTotal * 100) / 100);
    expect(chartSeries.length).toBe(salesReport.rows.length);
  });

  test('Dashboard month-bucketed series equals Sales Report month-bucketed series exactly, row for row', async () => {
    await seedHistoricalBaseline();
    const range = { ...fullHistoricalPlusLiveRange(), period: 'month' };

    const chartSeries = await adminService.getRevenue(range);
    const salesReport = await reportService.getSalesReport(range);

    expect(chartSeries.length).toBe(salesReport.rows.length);
    for (let i = 0; i < chartSeries.length; i++) {
      expect(chartSeries[i].period).toBe(salesReport.rows[i].period);
      expect(chartSeries[i].revenue).toBe(salesReport.rows[i].revenue);
      expect(chartSeries[i].orders).toBe(salesReport.rows[i].orders);
    }
  });

  test('Top Products (admin.service) and Product Analytics topSelling (analytics.service) agree on the #1 product for the same range', async () => {
    await seedHistoricalBaseline();
    const range = fullHistoricalPlusLiveRange();

    const [topProducts, productAnalytics] = await Promise.all([
      adminService.getTopProducts({ limit: 5, ...range }),
      analyticsService.getProductAnalytics(range),
    ]);

    expect(topProducts.length).toBeGreaterThan(0);
    expect(productAnalytics.topSelling.length).toBeGreaterThan(0);
    expect(String(topProducts[0].product)).toBe(String(productAnalytics.topSelling[0].product));
    expect(topProducts[0].revenue).toBe(productAnalytics.topSelling[0].revenue);
  });

  test('a real live order placed today changes Dashboard, Analytics, AND Reports identically — never just one of them', async () => {
    await seedHistoricalBaseline();
    const Product = mongoose.model('Product');
    const product = await Product.findOne().sort({ createdAt: 1 }).lean();
    const buyer = await seedUser();

    const before = await reportService.getSalesReport({});
    await seedPaidOrder({ user: buyer, product, unitPrice: 999 });
    const after = await reportService.getSalesReport({});

    expect(Math.round((after.summary.gross - before.summary.gross) * 100) / 100).toBe(999);

    const dashboard = await adminService.getDashboard();
    expect(dashboard.revenue.total).toBe(after.summary.gross);

    // getOverview's own resolveRange (unchanged, pre-existing behavior)
    // defaults an empty query to the last 30 days, not "all time" — so an
    // explicit wide range is required to compare it against the "all time"
    // getSalesReport({}) call above on equal terms.
    const overview = await analyticsService.getOverview(fullHistoricalPlusLiveRange());
    const salesReportSameRange = await reportService.getSalesReport(fullHistoricalPlusLiveRange());
    expect(overview.revenue.gross).toBe(salesReportSameRange.summary.gross);
  });

  test('Orders Report summary.total is flagged with historicalNote when the range overlaps the historical window, and its real row list can legitimately be shorter than summary.total', async () => {
    await seedHistoricalBaseline();
    const range = fullHistoricalPlusLiveRange();

    const ordersReport = await reportService.getOrdersReport(range);
    expect(ordersReport.historicalNote).toBeTruthy();
    // No fake historical Order rows exist — real itemized rows can be fewer
    // than the reconciled summary total for a range reaching into the
    // seeded window; this must be explicit, not silently misleading.
    expect(ordersReport.rows.length).toBeLessThanOrEqual(ordersReport.summary.total);
  });

  test('a range entirely AFTER the cutoff (no historical component) needs no historicalNote', async () => {
    await seedHistoricalBaseline();
    const buyer = await seedUser();
    const Product = mongoose.model('Product');
    const product = await Product.findOne().lean();
    await seedPaidOrder({ user: buyer, product, unitPrice: 500 });

    // Israel calendar "today" — NOT toISOString().slice(0,10), which gives
    // the UTC date and can legitimately differ from the Israel date (e.g.
    // late evening UTC is already "tomorrow" in Israel, UTC+2/+3).
    const todayStr = toIsraelDateKey(new Date());
    const ordersReport = await reportService.getOrdersReport({ dateFrom: todayStr, dateTo: todayStr });
    expect(ordersReport.historicalNote).toBeNull();
    expect(ordersReport.summary.total).toBe(ordersReport.rows.length); // fully real, no gap
  });
});
