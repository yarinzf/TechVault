'use strict';

// Integration coverage for the campaign-analytics-honesty fix:
//   - forward-looking campaign attribution persisted on Order items at
//     checkout (server/services/order.service.js + campaign.service.js#
//     getActiveDiscountAttributionMap)
//   - real, server-derived campaign analytics
//     (server/services/campaignAnalytics.service.js,
//     GET /api/v1/admin/campaigns/:id/analytics)

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { generateAccessToken } = require('../server/utils/jwt');

let app;
const AUTH     = '/api/v1/auth';
const ORDERS   = '/api/v1/orders';
const CART     = '/api/v1/cart';
const PAYMENTS = '/api/v1/payments';
const ADMIN    = '/api/v1/admin';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('Campaign').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _seq = 0;

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name: `${role} User${suffix}`, email: `${role}${suffix}@campanalytics-test.com`,
    password: 'Password123!', role,
  });
}

async function roleToken(role, suffix) {
  const user = await createUserWithRole(role, suffix);
  return generateAccessToken({ id: user._id.toString() });
}

async function registerAndLogin(suffix) {
  _seq += 1;
  const email = `customer-${suffix}-${Date.now()}-${_seq}@campanalytics-test.com`;
  const res = await request(app).post(`${AUTH}/register`).send({ name: 'Customer', email, password: 'Password123!' });
  return { accessToken: res.body.data.accessToken, userId: res.body.data.user._id };
}

const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function seedProduct(overrides = {}) {
  const Product  = mongoose.model('Product');
  const Category = mongoose.model('Category');
  const cat = await Category.findOneAndUpdate(
    { slug: 'keyboards' },
    { $setOnInsert: { name: 'Keyboards', slug: 'keyboards', isActive: true } },
    { upsert: true, new: true }
  );
  _seq += 1;
  return Product.create({
    name: overrides.name ?? `CA Test Product ${Date.now()}-${_seq}`,
    slug: `ca-test-product-${Date.now()}-${_seq}`,
    sku:  overrides.sku ?? `SKU-CA-${Date.now()}-${_seq}`,
    brand: 'TestBrand', price: overrides.price ?? 1000, stock: overrides.stock ?? 50,
    category: cat._id, description: 'Campaign analytics test product',
    isPublished: true, isDeleted: false, images: [],
  });
}

async function createCampaign(overrides = {}) {
  const Campaign = mongoose.model('Campaign');
  return Campaign.create({
    name: overrides.name ?? 'CA Test Campaign',
    title: overrides.title,
    discountPercent: overrides.discountPercent ?? 20,
    startDate: overrides.startDate ?? inDays(-1),
    endDate:   overrides.endDate   ?? inDays(6),
    isActive:  overrides.isActive  ?? true,
    products:  overrides.products  ?? [],
  });
}

// Directly constructs a paid/unpaid Order document — used for analytics
// aggregation tests, where precise control over paymentStatus/attribution
// combinations across many cases matters more than re-exercising the real
// checkout flow every time (that write path has its own dedicated tests
// below, using the real cart→order→payment flow).
async function insertOrder({ userId, items, paymentStatus = 'paid', status = 'confirmed', createdAt }) {
  const Order = mongoose.model('Order');
  const subtotal = items.reduce((s, it) => s + it.totalPrice, 0);
  _seq += 1;
  const order = await Order.create({
    orderNumber: `TV-CA-${Date.now()}-${_seq}`,
    user: userId,
    items,
    shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' },
    subtotal, taxAmount: 0, total: subtotal,
    shippingMethod: 'store_pickup', shippingCost: 0,
    status, paymentStatus,
  });
  if (createdAt) {
    await mongoose.connection.collection('orders').updateOne({ _id: order._id }, { $set: { createdAt } });
  }
  return order;
}

function itemFor(product, { quantity = 1, campaign = null } = {}) {
  const unitPrice = campaign
    ? Math.round(product.price * (1 - campaign.discountPercent / 100) * 100) / 100
    : product.price;
  return {
    itemType: 'product', product: product._id, name: product.name, sku: product.sku,
    unitPrice, quantity, totalPrice: unitPrice * quantity,
    campaignId:              campaign?._id ?? null,
    campaignTitle:           campaign ? (campaign.title ?? campaign.name) : null,
    campaignDiscountPercent: campaign?.discountPercent ?? null,
  };
}

const ANALYTICS = (id) => `${ADMIN}/campaigns/${id}/analytics`;

// ══════════════════════════════════════════════════════════════════════════
// ATTRIBUTION — real checkout write path
// ══════════════════════════════════════════════════════════════════════════
describe('Campaign attribution — persisted on the Order item at real checkout', () => {
  it('a product covered by an active campaign gets campaignId/campaignTitle/campaignDiscountPercent persisted on the order item', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ title: 'קמפיין קיץ', discountPercent: 20, products: [product._id] });
    const { accessToken } = await registerAndLogin('attr1');

    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${accessToken}`).send({ productId: product._id, quantity: 2 });
    const orderRes = await request(app).post(ORDERS).set('Authorization', `Bearer ${accessToken}`).send({
      shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' },
      shippingMethod: 'store_pickup',
    });
    expect(orderRes.status).toBe(201);

    const Order = mongoose.model('Order');
    const fresh = await Order.findById(orderRes.body.data.order._id);
    const item = fresh.items[0];
    expect(item.campaignId.toString()).toBe(campaign._id.toString());
    expect(item.campaignTitle).toBe('קמפיין קיץ');
    expect(item.campaignDiscountPercent).toBe(20);
    expect(item.unitPrice).toBe(800); // 1000 * (1 - 20%)
  });

  it('a product with NO active campaign gets null attribution (not a fabricated guess)', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken } = await registerAndLogin('attr2');

    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${accessToken}`).send({ productId: product._id, quantity: 1 });
    const orderRes = await request(app).post(ORDERS).set('Authorization', `Bearer ${accessToken}`).send({
      shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' },
      shippingMethod: 'store_pickup',
    });
    expect(orderRes.status).toBe(201);

    const Order = mongoose.model('Order');
    const fresh = await Order.findById(orderRes.body.data.order._id);
    const item = fresh.items[0];
    expect(item.campaignId).toBeNull();
    expect(item.campaignTitle).toBeNull();
    expect(item.campaignDiscountPercent).toBeNull();
    expect(item.unitPrice).toBe(500); // untouched — no discount applied
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS — authorization
// ══════════════════════════════════════════════════════════════════════════
describe('Campaign analytics — authorization', () => {
  it('Admin can retrieve campaign analytics', async () => {
    const campaign = await createCampaign();
    const token = await roleToken('admin', '-auth1');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Super Admin can retrieve campaign analytics', async () => {
    const campaign = await createCampaign();
    const token = await roleToken('superadmin', '-auth2');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Warehouse cannot retrieve campaign analytics', async () => {
    const campaign = await createCampaign();
    const token = await roleToken('warehouse', '-auth3');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('Customer cannot retrieve campaign analytics (and unauthenticated is rejected)', async () => {
    const campaign = await createCampaign();
    const unauth = await request(app).get(ANALYTICS(campaign._id));
    expect(unauth.status).toBe(401);

    const { accessToken } = await registerAndLogin('auth4');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS — calculation correctness
// ══════════════════════════════════════════════════════════════════════════
describe('Campaign analytics — calculation correctness', () => {
  it('an unpaid order does not count', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc1');
    await insertOrder({ userId, items: [itemFor(product, { campaign })], paymentStatus: 'unpaid' });

    const token = await roleToken('admin', '-calc1');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(0);
    expect(res.body.data.analytics.summary.revenue).toBe(0);
  });

  it('a paid, campaign-attributed order counts, with correct units and revenue', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ discountPercent: 20, products: [product._id] });
    const { userId } = await registerAndLogin('calc2');
    await insertOrder({ userId, items: [itemFor(product, { quantity: 3, campaign })], paymentStatus: 'paid' });

    const token = await roleToken('admin', '-calc2');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    const { summary } = res.body.data.analytics;
    expect(summary.attributedOrders).toBe(1);
    expect(summary.unitsSold).toBe(3);
    expect(summary.revenue).toBe(2400); // 800 (discounted unit) * 3
  });

  it('multiple products in the same order aggregate correctly', async () => {
    const productA = await seedProduct({ price: 1000 });
    const productB = await seedProduct({ price: 500 });
    const campaign = await createCampaign({ discountPercent: 10, products: [productA._id, productB._id] });
    const { userId } = await registerAndLogin('calc3');
    await insertOrder({
      userId,
      items: [itemFor(productA, { quantity: 2, campaign }), itemFor(productB, { quantity: 1, campaign })],
      paymentStatus: 'paid',
    });

    const token = await roleToken('admin', '-calc3');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    const { summary, products } = res.body.data.analytics;
    expect(summary.attributedOrders).toBe(1);
    expect(summary.unitsSold).toBe(3); // 2 + 1
    expect(summary.revenue).toBe(1800 + 450); // (900*2) + (450*1)
    expect(products).toHaveLength(2);
  });

  it('a different campaign does not contaminate this campaign\'s analytics', async () => {
    const product   = await seedProduct({ price: 1000 });
    const campaignA = await createCampaign({ name: 'Campaign A', products: [product._id] });
    const campaignB = await createCampaign({ name: 'Campaign B', products: [product._id] });
    const { userId } = await registerAndLogin('calc4');
    await insertOrder({ userId, items: [itemFor(product, { campaign: campaignB })], paymentStatus: 'paid' });

    const token = await roleToken('admin', '-calc4');
    const res = await request(app).get(ANALYTICS(campaignA._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(0);
  });

  it('a non-campaign order (no attribution) does not count toward any campaign', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc5');
    await insertOrder({ userId, items: [itemFor(product)], paymentStatus: 'paid' }); // no campaign passed

    const token = await roleToken('admin', '-calc5');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(0);
  });

  it('a legacy order with no attribution field at all is excluded, not guessed retroactively', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc6');
    // Simulates a pre-migration order item — no campaignId/campaignTitle/
    // campaignDiscountPercent keys at all (not even null), via a raw insert
    // that bypasses Mongoose's own schema defaults.
    const collection = mongoose.connection.collection('orders');
    await collection.insertOne({
      orderNumber: `LEGACY-${Date.now()}`, user: new mongoose.Types.ObjectId(userId),
      items: [{
        itemType: 'product', product: product._id, name: product.name, sku: product.sku,
        unitPrice: 1000, quantity: 1, totalPrice: 1000,
      }],
      shippingAddress: { street: 'x', city: 'x', zip: 'x', country: 'IL' },
      subtotal: 1000, taxAmount: 0, total: 1000,
      status: 'confirmed', paymentStatus: 'paid',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const token = await roleToken('admin', '-calc6');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(0);
  });

  it('a fully refunded order is excluded from attributed revenue', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc7');
    await insertOrder({ userId, items: [itemFor(product, { campaign })], paymentStatus: 'refunded' });

    const token = await roleToken('admin', '-calc7');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(0);
    expect(res.body.data.analytics.summary.revenue).toBe(0);
  });

  it('a partially refunded order is excluded too (no per-item refund allocation exists)', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc8');
    await insertOrder({ userId, items: [itemFor(product, { campaign })], paymentStatus: 'partially_refunded' });

    const token = await roleToken('admin', '-calc8');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(0);
  });

  it('a cancelled-but-still-paid order STILL counts — matches the existing totalPaidSpend precedent', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc9');
    await insertOrder({ userId, items: [itemFor(product, { campaign })], paymentStatus: 'paid', status: 'cancelled' });

    const token = await roleToken('admin', '-calc9');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.attributedOrders).toBe(1);
  });

  it('time-series data is generated from real orders, grouped by real order date', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ products: [product._id] });
    const { userId } = await registerAndLogin('calc10');
    const day1 = new Date('2026-01-10T12:00:00.000Z');
    const day2 = new Date('2026-01-11T12:00:00.000Z');
    await insertOrder({ userId, items: [itemFor(product, { campaign })], paymentStatus: 'paid', createdAt: day1 });
    await insertOrder({ userId, items: [itemFor(product, { campaign })], paymentStatus: 'paid', createdAt: day2 });

    const token = await roleToken('admin', '-calc10');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    const { timeSeries } = res.body.data.analytics;
    expect(timeSeries).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-01-10', orders: 1 }),
      expect.objectContaining({ date: '2026-01-11', orders: 1 }),
    ]));
  });

  it('an empty campaign (no attributed sales at all) returns genuine zero/empty analytics, not an error', async () => {
    const campaign = await createCampaign();
    const token = await roleToken('admin', '-calc11');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.analytics.summary).toEqual({
      attributedOrders: 0, unitsSold: 0, revenue: 0, discountGenerated: 0,
    });
    expect(res.body.data.analytics.timeSeries).toEqual([]);
    expect(res.body.data.analytics.products).toEqual([]);
  });

  it('discount generated is reconstructed honestly from the persisted price snapshot', async () => {
    const product  = await seedProduct({ price: 1000 });
    const campaign = await createCampaign({ discountPercent: 20, products: [product._id] });
    const { userId } = await registerAndLogin('calc12');
    // unitPrice 800 = 1000 * (1 - 20%) — discount per unit = 200, x2 units = 400
    await insertOrder({ userId, items: [itemFor(product, { quantity: 2, campaign })], paymentStatus: 'paid' });

    const token = await roleToken('admin', '-calc12');
    const res = await request(app).get(ANALYTICS(campaign._id)).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.analytics.summary.discountGenerated).toBe(400);
  });

  it('returns 404 for a nonexistent campaign', async () => {
    const token = await roleToken('admin', '-calc13');
    const res = await request(app).get(ANALYTICS(new mongoose.Types.ObjectId())).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
