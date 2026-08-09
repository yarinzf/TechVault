'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH     = '/api/v1/auth';
const ORDERS   = '/api/v1/orders';
const CART     = '/api/v1/cart';
const PAYMENTS = '/api/v1/payments';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Order').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _seq = 0;

async function registerAndLogin(overrides = {}) {
  _seq += 1;
  const email = overrides.email ?? `os-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'Order Stats User',
    email,
    password: 'Password123!',
  });
  return { user: res.body.data.user, accessToken: res.body.data.accessToken, email };
}

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name: `${role} User${suffix}`,
    email: `${role}${suffix}@order-stats-test.com`,
    password: 'Password123!',
    role,
  });
}

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
    name:        'Order Stats Test Keyboard',
    slug:        `os-test-keyboard-${Date.now()}-${_seq}`,
    sku:         `SKU-OS-${Date.now()}-${_seq}`,
    brand:       'TestBrand',
    price:       100,
    stock:       500,
    category:    cat._id,
    description: 'A great keyboard for order-stats testing',
    isPublished: true,
    isDeleted:   false,
    images:      [],
    ...overrides,
  });
}

async function addToCart(token, productId, quantity = 1) {
  return request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`).send({ productId, quantity });
}

async function createOrder(token, body = {}) {
  return request(app).post(ORDERS).set('Authorization', `Bearer ${token}`).send({
    shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' },
    ...body,
  });
}

async function payOrder(token, orderId) {
  const intentRes = await request(app).post(`${PAYMENTS}/create-intent`).set('Authorization', `Bearer ${token}`).send({ orderId });
  expect(intentRes.status).toBe(200);
  const { paymentIntentId } = intentRes.body.data;
  return request(app).post(`${PAYMENTS}/confirm`).set('Authorization', `Bearer ${token}`).send({ orderId, paymentIntentId });
}

async function getStats(token) {
  const res = await request(app).get(`${ORDERS}/stats`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

// ══════════════════════════════════════════════════════════════════════════
// GET /orders/stats — authoritative account order stats
// ══════════════════════════════════════════════════════════════════════════
describe('GET /orders/stats — server-authoritative Total Spent / order count', () => {
  it('returns zero for a brand-new account with no orders', async () => {
    const { accessToken } = await registerAndLogin();
    const stats = await getStats(accessToken);
    expect(stats).toEqual({ totalOrders: 0, totalPaidSpend: 0 });
  });

  it('sums multiple paid orders correctly', async () => {
    const product = await seedProduct({ price: 100 });
    const { accessToken } = await registerAndLogin();

    for (let i = 0; i < 3; i++) {
      await addToCart(accessToken, product._id, 1);
      const orderRes = await createOrder(accessToken);
      await payOrder(accessToken, orderRes.body.data.order._id);
    }

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(3);
    expect(stats.totalPaidSpend).toBe(300);
  });

  it('excludes an unpaid (never-confirmed) order from totalPaidSpend but still counts it in totalOrders', async () => {
    const product = await seedProduct({ price: 150 });
    const { accessToken } = await registerAndLogin();

    await addToCart(accessToken, product._id, 1);
    await createOrder(accessToken); // never paid

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(1);
    expect(stats.totalPaidSpend).toBe(0);
  });

  it('a paid order that is later cancelled (no refund issued) still counts as real spend', async () => {
    // Mirrors the real architecture: cancelOrder never touches paymentStatus —
    // cancellation without a matching refund does not return the customer's
    // money, so it must remain part of Total Spent until actually refunded.
    const product = await seedProduct({ price: 200 });
    const { accessToken } = await registerAndLogin();

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);

    const Order = mongoose.model('Order');
    await Order.updateOne({ _id: orderId }, { $set: { status: 'cancelled' } });

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(1);
    expect(stats.totalPaidSpend).toBe(200);
  });

  it('a fully refunded order nets to zero spend', async () => {
    const product = await seedProduct({ price: 250 });
    const { accessToken, user } = await registerAndLogin();

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);

    const refundService = require('../server/services/refund.service');
    const admin = await createUserWithRole('admin', `-refund-${Date.now()}`);
    await refundService.refundOrder(orderId, { amount: 250, reason: 'test full refund' }, { _id: admin._id, role: 'admin' });

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(1);
    expect(stats.totalPaidSpend).toBe(0);
  });

  it('a partially refunded order counts only the retained (non-refunded) portion', async () => {
    const product = await seedProduct({ price: 400, stock: 500 });
    const { accessToken } = await registerAndLogin();

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);

    const refundService = require('../server/services/refund.service');
    const admin = await createUserWithRole('admin', `-partial-${Date.now()}`);
    await refundService.refundOrder(orderId, { amount: 150, reason: 'test partial refund' }, { _id: admin._id, role: 'admin' });

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(1);
    expect(stats.totalPaidSpend).toBe(250); // 400 - 150
  });

  it('excludes membership (Club) purchase orders from totalPaidSpend — merchandise spend only', async () => {
    const { accessToken } = await registerAndLogin();

    const checkoutRes = await request(app)
      .post('/api/v1/membership/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    expect(checkoutRes.status).toBe(201);
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(1); // membership order still counted as a real order
    expect(stats.totalPaidSpend).toBe(0); // but excluded from merchandise spend
  });

  it('is computed server-side, not limited by any frontend pagination — proven with 120 paid orders', async () => {
    const product = await seedProduct({ price: 10, stock: 1000 });
    const { accessToken } = await registerAndLogin();

    const ORDER_COUNT = 120;
    for (let i = 0; i < ORDER_COUNT; i++) {
      await addToCart(accessToken, product._id, 1);
      const orderRes = await createOrder(accessToken);
      await payOrder(accessToken, orderRes.body.data.order._id);
    }

    const stats = await getStats(accessToken);
    expect(stats.totalOrders).toBe(ORDER_COUNT);
    expect(stats.totalPaidSpend).toBe(ORDER_COUNT * 10); // 1200 — would be capped at 100*10=1000 by the old listMine(limit:100)-based calculation
  }, 60000);

  it('never trusts a client-supplied amount — the endpoint takes no request body/query input at all', async () => {
    const { accessToken } = await registerAndLogin();
    // Attempt to smuggle a fake total via query string — must be ignored entirely.
    const res = await request(app)
      .get(`${ORDERS}/stats?totalPaidSpend=999999&totalOrders=999`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ totalOrders: 0, totalPaidSpend: 0 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GET /orders?status=... — single and comma-separated multi-status filtering
// (powers the Orders page's "preparing" filter tab, which spans several
// real fulfillment statuses at once) — server-side, not a client-side
// filter over a single fetched page.
// ══════════════════════════════════════════════════════════════════════════
describe('GET /orders?status= — single and multi-status server-side filtering', () => {
  it('a single status value filters exactly as before (unchanged behavior)', async () => {
    const product = await seedProduct({ price: 50 });
    const { accessToken } = await registerAndLogin();

    await addToCart(accessToken, product._id, 1);
    const paidOrder = await createOrder(accessToken);
    await payOrder(accessToken, paidOrder.body.data.order._id);

    await addToCart(accessToken, product._id, 1);
    await createOrder(accessToken); // stays pending_payment

    const res = await request(app)
      .get(`${ORDERS}?status=confirmed`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0].status).toBe('confirmed');
  });

  it('a comma-separated status list matches any of the given statuses, server-side', async () => {
    const product = await seedProduct({ price: 50, stock: 10 });
    const { accessToken } = await registerAndLogin();

    // One confirmed (paid), one still pending_payment, one cancelled.
    await addToCart(accessToken, product._id, 1);
    const confirmedRes = await createOrder(accessToken);
    await payOrder(accessToken, confirmedRes.body.data.order._id);

    await addToCart(accessToken, product._id, 1);
    await createOrder(accessToken); // pending_payment

    await addToCart(accessToken, product._id, 1);
    const toCancelRes = await createOrder(accessToken);
    await request(app).patch(`${ORDERS}/${toCancelRes.body.data.order._id}/cancel`).set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`${ORDERS}?status=pending_payment,confirmed`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(2);
    const statuses = res.body.data.orders.map(o => o.status).sort();
    expect(statuses).toEqual(['confirmed', 'pending_payment']);
    // The cancelled order must not appear in this bucket.
    expect(res.body.data.orders.some(o => o.status === 'cancelled')).toBe(false);
  });

  it('supports real pagination via page/limit — proven with more than one page of real orders', async () => {
    const product = await seedProduct({ price: 20, stock: 200 });
    const { accessToken, user } = await registerAndLogin();
    const Cart = mongoose.model('Cart');

    // Order creation deliberately does NOT clear the cart (only a
    // confirmed payment does) — reset it explicitly between iterations so
    // each of the 25 orders is a fresh, guaranteed-succeeding single item,
    // rather than an ever-growing cart whose accumulating quantity would
    // eventually exceed stock and silently fail past a certain point.
    for (let i = 0; i < 25; i++) {
      await Cart.deleteMany({ user: user._id });
      await addToCart(accessToken, product._id, 1);
      const res = await createOrder(accessToken);
      expect(res.status).toBe(201);
    }

    const page1 = await request(app).get(`${ORDERS}?limit=20&page=1`).set('Authorization', `Bearer ${accessToken}`);
    expect(page1.body.data.orders).toHaveLength(20);
    expect(page1.body.meta.total).toBe(25);
    expect(page1.body.meta.pages).toBe(2);

    const page2 = await request(app).get(`${ORDERS}?limit=20&page=2`).set('Authorization', `Bearer ${accessToken}`);
    expect(page2.body.data.orders).toHaveLength(5);

    // No overlap between the two pages.
    const ids1 = new Set(page1.body.data.orders.map(o => o._id));
    const ids2 = page2.body.data.orders.map(o => o._id);
    expect(ids2.every(id => !ids1.has(id))).toBe(true);
  }, 30000);
});
