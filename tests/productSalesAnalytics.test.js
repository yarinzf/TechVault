'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { generateAccessToken } = require('../server/utils/jwt');
const { rebuildProductSalesMonth } = require('../server/services/productSalesAnalytics.service');

let app;
const ADMIN_BASE = '/api/v1/admin/products';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('Category').createIndexes();
  await mongoose.model('User').createIndexes();
  await mongoose.model('ProductSalesMonthly').createIndexes();
});

afterEach(clearAll);

// ── Helpers (same conventions as tests/bestSellers.test.js) ────────────────────

let categoryCounter = 0;
async function seedCategory(overrides = {}) {
  const Category = mongoose.model('Category');
  categoryCounter += 1;
  return Category.create({
    name: overrides.name ?? `Test Category ${categoryCounter}`,
    slug: overrides.slug ?? `test-category-${categoryCounter}-${Date.now()}`,
    isActive: true,
  });
}

let productCounter = 0;
async function seedProduct(overrides = {}) {
  const Product = mongoose.model('Product');
  productCounter += 1;
  const category = overrides.category ?? (await seedCategory())._id;
  return Product.create({
    name:        overrides.name        ?? `Test Product ${productCounter}`,
    slug:        overrides.slug        ?? 'test-product-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    sku:         overrides.sku         ?? 'SKU-' + Date.now() + Math.random().toString(36).slice(2, 6),
    brand:       overrides.brand       ?? 'TestBrand',
    price:       overrides.price       ?? 100,
    stock:       overrides.stock       ?? 50,
    category,
    description: 'A real product used for sales-analytics testing',
    isPublished: overrides.isPublished ?? true,
    isDeleted:   overrides.isDeleted   ?? false,
  });
}

async function seedUser(overrides = {}) {
  const User = mongoose.model('User');
  return User.create({
    name:  overrides.name ?? 'Test Buyer',
    email: 'buyer-' + Date.now() + Math.random().toString(36).slice(2) + '@test.local',
    password: 'TestPassword123',
    role: overrides.role ?? 'user',
    isActive: true,
  });
}

async function adminToken() {
  const user = await seedUser({ role: 'admin' });
  return generateAccessToken({ id: user._id.toString() });
}

let orderCounter = 0;
async function seedOrder({ user, items, status = 'confirmed', paymentStatus = 'paid', createdAt = null }) {
  const Order = mongoose.model('Order');
  orderCounter += 1;
  const orderItems = items.map((it) => ({
    itemType:   'product',
    product:    it.product,
    name:       it.name ?? 'Item',
    sku:        it.sku ?? 'SKU-' + orderCounter,
    unitPrice:  it.unitPrice ?? 10,
    quantity:   it.quantity,
    totalPrice: (it.unitPrice ?? 10) * it.quantity,
  }));
  const subtotal = orderItems.reduce((s, it) => s + it.totalPrice, 0);

  const order = await Order.create({
    orderNumber: 'TEST-ORD-' + orderCounter + '-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    user: user._id,
    items: orderItems,
    shippingAddress: { street: '1 Test St', city: 'Testville', zip: '12345', country: 'Israel' },
    subtotal,
    taxAmount: 0,
    shippingCost: 0,
    total: subtotal,
    status,
    paymentStatus,
  });

  if (createdAt) {
    await mongoose.connection.collection('orders').updateOne({ _id: order._id }, { $set: { createdAt } });
  }
  return order;
}

function utcMonthMiddle(year, month) {
  return new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
}

// A fixed, known reference month far from "now" so tests never collide with
// whatever the real current month happens to be when the suite runs.
const REF_YEAR = 2024;
const REF_MONTH = 6; // June 2024

// ── rebuildProductSalesMonth ─────────────────────────────────────────────────

describe('rebuildProductSalesMonth — rebuilding ProductSalesMonthly from real Orders', () => {
  test('creates a correct row: unitsSold aggregated across multiple orders', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Rebuild Units Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 3 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 2 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row).toBeDefined();
    expect(row.unitsSold).toBe(5);
  });

  test('orderCount counts DISTINCT qualifying orders, not line items — matches the task example exactly', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Order Count Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 2 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 3 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row.unitsSold).toBe(5);
    expect(row.orderCount).toBe(2);
  });

  test('a single order for multiple units still counts as orderCount 1', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Single Order Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 7 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row.unitsSold).toBe(7);
    expect(row.orderCount).toBe(1);
  });

  test('revenue uses the real, historical OrderItem.totalPrice — not the product current price', async () => {
    const buyer = await seedUser();
    // Product's CURRENT price is 999, but the historical order locked in 50/unit (e.g. a past campaign).
    const product = await seedProduct({ name: 'Historical Revenue Product', price: 999 });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 4, unitPrice: 50 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row.revenue).toBe(200); // 4 * 50 (historical), never 4 * 999 (current)
  });

  test('rerunning the rebuild for the same month is idempotent', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Idempotent Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 6 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);
    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);
    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const rows = await ProductSalesMonthly.find({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(rows).toHaveLength(1); // no duplicates
    expect(rows[0].unitsSold).toBe(6);
  });

  test('a cancelled order is removed from the rebuilt analytics (reconciliation, not just additive)', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Cancelled Reconcile Product' });
    const order = await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 8 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);
    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    let row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row.unitsSold).toBe(8);

    // The order gets cancelled after the fact.
    await mongoose.model('Order').updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row).toBeNull(); // stale record removed entirely, not left at a phantom positive value
  });

  test('a refunded order is excluded the same way a cancelled order is', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Refunded Reconcile Product' });
    const order = await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 5 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });
    await mongoose.model('Order').updateOne({ _id: order._id }, { $set: { status: 'refunded', paymentStatus: 'refunded' } });

    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row).toBeNull();
  });

  test('multiple months for the same product remain separate rows', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Multi Month Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 3 }], createdAt: utcMonthMiddle(REF_YEAR, 5) });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 9 }], createdAt: utcMonthMiddle(REF_YEAR, 6) });

    await rebuildProductSalesMonth(REF_YEAR, 5);
    await rebuildProductSalesMonth(REF_YEAR, 6);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const may = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: 5 }).lean();
    const june = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: 6 }).lean();
    expect(may.unitsSold).toBe(3);
    expect(june.unitsSold).toBe(9);
  });

  test('one product can have many monthly records across a real multi-month history', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Long History Product' });
    for (let m = 1; m <= 6; m++) {
      await seedOrder({ user: buyer, items: [{ product: product._id, quantity: m }], createdAt: utcMonthMiddle(REF_YEAR, m) });
      await rebuildProductSalesMonth(REF_YEAR, m);
    }
    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const rows = await ProductSalesMonthly.find({ product: product._id, year: REF_YEAR }).sort({ month: 1 }).lean();
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.unitsSold)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('the unique compound index rejects a raw duplicate (product, year, month) insert', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Unique Index Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 1 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });
    await rebuildProductSalesMonth(REF_YEAR, REF_MONTH);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    await expect(
      ProductSalesMonthly.collection.insertOne({
        product: product._id, year: REF_YEAR, month: REF_MONTH,
        unitsSold: 999, orderCount: 1, revenue: 0, createdAt: new Date(), updatedAt: new Date(),
      })
    ).rejects.toThrow();
  });

  test('dry-run does not write anything', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Dry Run Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 4 }], createdAt: utcMonthMiddle(REF_YEAR, REF_MONTH) });

    const result = await rebuildProductSalesMonth(REF_YEAR, REF_MONTH, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].unitsSold).toBe(4);

    const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
    const row = await ProductSalesMonthly.findOne({ product: product._id, year: REF_YEAR, month: REF_MONTH }).lean();
    expect(row).toBeNull(); // nothing was actually persisted
  });
});

// ── Admin sales-history endpoint ────────────────────────────────────────────

describe('GET /api/v1/admin/products/:productId/sales-history', () => {
  test('requires authentication/authorization', async () => {
    const product = await seedProduct();
    const res = await request(app).get(`${ADMIN_BASE}/${product._id}/sales-history`);
    expect([401, 403]).toContain(res.status);
  });

  test('a non-admin authenticated user is rejected', async () => {
    const user = await seedUser({ role: 'user' });
    const token = generateAccessToken({ id: user._id.toString() });
    const product = await seedProduct();
    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('summary reflects real totalUnitsSold derived from Orders directly (works even without a prior rebuild)', async () => {
    const token = await adminToken();
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Live Total Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 12 }] }); // real "now" order, no rebuild run

    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalUnitsSold).toBe(12);
  });

  test('current vs previous month, with a positive month-over-month change', async () => {
    const token = await adminToken();
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'MoM Positive Product' });
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;

    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 10 }], createdAt: utcMonthMiddle(prevY, prevM) });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 20 }] }); // this month (real now)
    await rebuildProductSalesMonth(prevY, prevM);
    await rebuildProductSalesMonth(y, m);

    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.currentMonth.unitsSold).toBe(20);
    expect(res.body.data.previousMonth.unitsSold).toBe(10);
    expect(res.body.data.monthOverMonthPercent).toBe(100); // (20-10)/10 * 100
  });

  test('a negative month-over-month change is reported correctly', async () => {
    const token = await adminToken();
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'MoM Negative Product' });
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;

    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 20 }], createdAt: utcMonthMiddle(prevY, prevM) });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 5 }] }); // this month
    await rebuildProductSalesMonth(prevY, prevM);
    await rebuildProductSalesMonth(y, m);

    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.currentMonth.unitsSold).toBe(5);
    expect(res.body.data.previousMonth.unitsSold).toBe(20);
    expect(res.body.data.monthOverMonthPercent).toBe(-75); // (5-20)/20 * 100
  });

  test('a zero previous month is handled safely — monthOverMonthPercent is null, never a divide-by-zero crash or a fabricated number', async () => {
    const token = await adminToken();
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Zero Previous Month Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 9 }] }); // only this month, nothing rebuilt for previous month
    const now = new Date();
    await rebuildProductSalesMonth(now.getUTCFullYear(), now.getUTCMonth() + 1); // materialize current month only — previous month stays absent (0)

    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.currentMonth.unitsSold).toBe(9);
    expect(res.body.data.previousMonth.unitsSold).toBe(0);
    expect(res.body.data.monthOverMonthPercent).toBeNull();
  });

  test('a product with no sales history at all returns a truthful zeroed response, not a crash', async () => {
    const token = await adminToken();
    const product = await seedProduct({ name: 'Never Sold Product' });

    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalUnitsSold).toBe(0);
    expect(res.body.data.history.every((h) => h.unitsSold === 0)).toBe(true);
  });

  test('history is ordered chronologically and covers the requested number of months', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    const res = await request(app)
      .get(`${ADMIN_BASE}/${product._id}/sales-history?months=6`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.history).toHaveLength(6);
    for (let i = 1; i < res.body.data.history.length; i++) {
      const prev = res.body.data.history[i - 1];
      const cur  = res.body.data.history[i];
      const prevIdx = prev.year * 12 + prev.month;
      const curIdx  = cur.year * 12 + cur.month;
      expect(curIdx).toBe(prevIdx + 1); // strictly increasing, one month at a time
    }
  });
});