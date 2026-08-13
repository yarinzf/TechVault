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
  const email = overrides.email ?? `deliv-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'Delivery Test User',
    email,
    password: 'Password123!',
  });
  return { user: res.body.data.user, accessToken: res.body.data.accessToken };
}

// Creates a real user with the given role and a real, validly-signed access
// token for it — mirrors the exact pattern already used by
// tests/pointsAndVip.test.js's own adminToken()/createUserWithRole() helpers.
async function tokenForRole(role) {
  _seq += 1;
  const User = mongoose.model('User');
  const user = await User.create({
    name:  `${role} User ${_seq}`,
    email: `${role}-${Date.now()}-${_seq}@deliv-test.com`,
    password: 'Password123!',
    role,
  });
  const jwt = require('../server/utils/jwt');
  return { user, accessToken: jwt.generateAccessToken({ id: user._id }) };
}

async function makeMember(userId) {
  const User = mongoose.model('User');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 86400000);
  await User.findByIdAndUpdate(userId, {
    $set: {
      'membership.status': 'active',
      'membership.plan': 'monthly',
      'membership.joinedAt': now,
      'membership.startedAt': now,
      'membership.expiresAt': expiresAt,
    },
  });
}

async function seedProduct(overrides = {}) {
  const Product  = mongoose.model('Product');
  const Category = mongoose.model('Category');
  const cat = await Category.findOneAndUpdate(
    { slug: 'monitors' },
    { $setOnInsert: { name: 'Monitors', slug: 'monitors', isActive: true } },
    { upsert: true, new: true }
  );
  _seq += 1;
  const unique = `${Date.now()}-${_seq}-${Math.random().toString(36).slice(2, 8)}`;
  return Product.create({
    name:        overrides.name ?? `Delivery Test Monitor ${unique}`,
    slug:        overrides.slug ?? `deliv-test-monitor-${unique}`,
    sku:         overrides.sku  ?? `SKU-DELIV-${unique}`,
    brand:       'TestBrand',
    price:       overrides.price ?? 1000,
    stock:       overrides.stock ?? 50,
    category:    cat._id,
    description: 'A great monitor for delivery-transition testing',
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
    shippingMethod: 'store_pickup',
    ...body,
  });
}

async function payOrder(token, orderId) {
  const intentRes = await request(app).post(`${PAYMENTS}/create-intent`).set('Authorization', `Bearer ${token}`).send({ orderId });
  const { paymentIntentId } = intentRes.body.data;
  return request(app).post(`${PAYMENTS}/confirm`).set('Authorization', `Bearer ${token}`).send({ orderId, paymentIntentId });
}

// Real HTTP calls, real endpoint — PATCH /orders/:id/status — using an
// admin token for the two fulfillment steps that precede the transition
// under test, exactly mirroring what a real staff user would do.
async function advanceToShipped(orderId, adminAccessToken) {
  await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${adminAccessToken}`).send({ status: 'processing' });
  await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${adminAccessToken}`).send({ status: 'shipped' });
}

async function buyAndShip(price = 1000, { member = false } = {}) {
  const product = await seedProduct({ price });
  const { accessToken, user } = await registerAndLogin();
  if (member) await makeMember(user._id);
  await addToCart(accessToken, product._id, 1);
  const orderRes = await createOrder(accessToken);
  const orderId = orderRes.body.data.order._id;
  await payOrder(accessToken, orderId);

  const { accessToken: adminAccessToken } = await tokenForRole('admin');
  await advanceToShipped(orderId, adminAccessToken);

  return { orderId, buyerAccessToken: accessToken, buyerId: user._id };
}

// ══════════════════════════════════════════════════════════════════════════
// New Admin Orders action: shipped -> delivered, via the real
// PATCH /orders/:id/status endpoint (the same one AdminOrdersPage's new
// "סמן כנמסר" button now calls through admin.service.js#updateOrderStatus).
// ══════════════════════════════════════════════════════════════════════════
describe('Order delivery transition (shipped → delivered) — role authorization', () => {
  it('admin can transition shipped → delivered', async () => {
    const { orderId } = await buyAndShip();
    const { accessToken } = await tokenForRole('admin');

    const res = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${accessToken}`).send({ status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('delivered');
  });

  it('superadmin can transition shipped → delivered', async () => {
    const { orderId } = await buyAndShip();
    const { accessToken } = await tokenForRole('superadmin');

    const res = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${accessToken}`).send({ status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('delivered');
  });

  it('warehouse CANNOT transition shipped → delivered (fulfillment-only role, unchanged)', async () => {
    const { orderId } = await buyAndShip();
    const { accessToken } = await tokenForRole('warehouse');

    const res = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${accessToken}`).send({ status: 'delivered' });

    expect(res.status).toBe(403);
    const Order = mongoose.model('Order');
    const stillShipped = await Order.findById(orderId);
    expect(stillShipped.status).toBe('shipped'); // unchanged — the attempt was rejected, not silently accepted
  });

  it('a customer CANNOT transition their own order to delivered', async () => {
    const { orderId, buyerAccessToken } = await buyAndShip();

    const res = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${buyerAccessToken}`).send({ status: 'delivered' });

    expect(res.status).toBe(403);
    const Order = mongoose.model('Order');
    const stillShipped = await Order.findById(orderId);
    expect(stillShipped.status).toBe('shipped');
  });
});

describe('Order delivery transition — real points realization (unchanged backend rule, exercised via the new admin action)', () => {
  it('an active Club-member order receives its earned points the moment an admin marks it delivered via the real endpoint', async () => {
    const { orderId, buyerId } = await buyAndShip(1000, { member: true });
    const { accessToken } = await tokenForRole('admin');

    const before = await mongoose.model('User').findById(buyerId);
    expect(before.membership.points).toBe(0); // shipped, not yet delivered — no earning yet

    const res = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${accessToken}`).send({ status: 'delivered' });
    expect(res.status).toBe(200);

    const after = await mongoose.model('User').findById(buyerId);
    expect(after.membership.points).toBe(50); // 1000 * 5%

    const Tx = mongoose.model('MembershipPointsTransaction');
    const earnTx = await Tx.findOne({ order: orderId, type: 'earn' });
    expect(earnTx).not.toBeNull();
    expect(earnTx.points).toBe(50);

    const Order = mongoose.model('Order');
    const order = await Order.findById(orderId);
    expect(order.pointsEarnedRealized).toBe(true);
  });

  it('repeating the delivered operation never double-awards points', async () => {
    const { orderId, buyerId } = await buyAndShip(1000, { member: true });
    const { accessToken: adminToken } = await tokenForRole('admin');

    const first = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'delivered' });
    expect(first.status).toBe(200);

    // A second real request from a regular admin is rejected outright by the
    // status state machine itself (delivered -> delivered is not an allowed
    // transition for a non-superadmin) — proving the real admin UI path
    // cannot even attempt a double-realization under normal use.
    const second = await request(app).patch(`${ORDERS}/${orderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'delivered' });
    expect(second.status).toBe(400);

    const afterRejectedRetry = await mongoose.model('User').findById(buyerId);
    expect(afterRejectedRetry.membership.points).toBe(50);

    // Belt-and-suspenders: the underlying realization function itself is
    // also idempotent regardless of the state-machine gate above (mirrors
    // tests/pointsAndVip.test.js's own "idempotent earning" coverage).
    const pointsService = require('../server/services/points.service');
    const Order = mongoose.model('Order');
    const order = await Order.findById(orderId);
    await pointsService.realizeEarnedPoints(order);

    const afterDirectRetry = await mongoose.model('User').findById(buyerId);
    expect(afterDirectRetry.membership.points).toBe(50);

    const Tx = mongoose.model('MembershipPointsTransaction');
    const earnCount = await Tx.countDocuments({ order: orderId, type: 'earn' });
    expect(earnCount).toBe(1);
  });
});
