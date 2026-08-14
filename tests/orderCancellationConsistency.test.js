'use strict';

// Regression coverage for the order-cancellation-consistency fix: the
// customer path (cancelOrder / PATCH /orders/:id/cancel) and the staff path
// (updateStatus / PATCH /orders/:id/status with status:'cancelled') must
// restore stock and reverse Club points identically — both now delegate to
// the same performCancellation() helper in order.service.js.

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
  await mongoose.model('MembershipPointsTransaction').createIndexes();
});

afterEach(clearAll);

// ── Helpers (mirrors tests/pointsAndVip.test.js conventions) ──────────────────
let _seq = 0;

async function registerAndLogin(overrides = {}) {
  _seq += 1;
  const email = overrides.email ?? `occ-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'OCC Test User',
    email,
    password: 'Password123!',
  });
  return { user: res.body.data.user, accessToken: res.body.data.accessToken, email };
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password });
  return res.body.data?.accessToken;
}

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name: `${role} User${suffix}`,
    email: `${role}${suffix}@occ-test.com`,
    password: 'Password123!',
    role,
  });
}

async function makeMember(userId, { points = 0, lifetimePoints = 0 } = {}) {
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
      'membership.points': points,
      'membership.lifetimePoints': lifetimePoints,
    },
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
    // name must be unique per call too — Product's pre-save hook regenerates
    // `slug` from `name` on every save, which would otherwise collide.
    name:        `OCC Test Product ${Date.now()}-${_seq}`,
    slug:        `occ-test-product-${Date.now()}-${_seq}`,
    sku:         `SKU-OCC-${Date.now()}-${_seq}`,
    brand:       'TestBrand',
    price:       1000,
    stock:       50,
    salesCount:  0,
    category:    cat._id,
    description: 'A product for order-cancellation-consistency testing',
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
    shippingMethod: 'store_pickup',
    ...body,
  });
}

async function payOrder(token, orderId) {
  const intentRes = await request(app).post(`${PAYMENTS}/create-intent`).set('Authorization', `Bearer ${token}`).send({ orderId });
  expect(intentRes.status).toBe(200);
  const { paymentIntentId } = intentRes.body.data;
  return request(app).post(`${PAYMENTS}/confirm`).set('Authorization', `Bearer ${token}`).send({ orderId, paymentIntentId });
}

async function staffToken(role, suffix) {
  _seq += 1;
  const staff = await createUserWithRole(role, `-tok-${Date.now()}-${suffix ?? _seq}`);
  return loginAs(staff.email);
}

// ══════════════════════════════════════════════════════════════════════════
// STOCK RESTORATION — both cancellation paths
// ══════════════════════════════════════════════════════════════════════════
describe('Order cancellation consistency — stock restoration', () => {
  it('customer cancellation (cancelOrder) restores stock and salesCount', async () => {
    const product = await seedProduct({ stock: 50, salesCount: 0 });
    const { accessToken } = await registerAndLogin();

    await addToCart(accessToken, product._id, 3);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;

    let fresh = await mongoose.model('Product').findById(product._id);
    expect(fresh.stock).toBe(47);       // 50 - 3
    expect(fresh.salesCount).toBe(3);

    const cancelRes = await request(app).patch(`${ORDERS}/${orderId}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.order.status).toBe('cancelled');

    fresh = await mongoose.model('Product').findById(product._id);
    expect(fresh.stock).toBe(50);       // fully restored
    expect(fresh.salesCount).toBe(0);   // fully undone
  });

  it('THE BUG: staff cancellation via updateStatus (PATCH /orders/:id/status) now ALSO restores stock and salesCount', async () => {
    const product = await seedProduct({ stock: 50, salesCount: 0 });
    const { accessToken } = await registerAndLogin();
    const adminToken = await staffToken('admin');

    await addToCart(accessToken, product._id, 5);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;

    let fresh = await mongoose.model('Product').findById(product._id);
    expect(fresh.stock).toBe(45); // 50 - 5

    const res = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled', note: 'ביטול על ידי מנהל' });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('cancelled');

    fresh = await mongoose.model('Product').findById(product._id);
    // Before the fix: this stayed at 45 (stock never restored). After: 50.
    expect(fresh.stock).toBe(50);
    expect(fresh.salesCount).toBe(0);
  });

  it('multi-item order: each line item restores its own correct quantity, on both paths', async () => {
    const productA = await seedProduct({ stock: 20, salesCount: 0 });
    const productB = await seedProduct({ stock: 30, salesCount: 0 });
    const { accessToken: custToken } = await registerAndLogin();
    const adminToken = await staffToken('admin', 'multi-admin');

    await addToCart(custToken, productA._id, 4);
    await addToCart(custToken, productB._id, 7);
    const orderRes = await createOrder(custToken);
    const orderId = orderRes.body.data.order._id;

    const res = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);

    const freshA = await mongoose.model('Product').findById(productA._id);
    const freshB = await mongoose.model('Product').findById(productB._id);
    expect(freshA.stock).toBe(20);
    expect(freshA.salesCount).toBe(0);
    expect(freshB.stock).toBe(30);
    expect(freshB.salesCount).toBe(0);
  });

  it('a PAID physical order (status confirmed) restores stock when cancelled by staff', async () => {
    const product = await seedProduct({ stock: 10, salesCount: 0 });
    const { accessToken } = await registerAndLogin();
    const adminToken = await staffToken('admin', 'paid-admin');

    await addToCart(accessToken, product._id, 2);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    const payRes = await payOrder(accessToken, orderId);
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.order.status).toBe('confirmed');

    const res = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);

    const fresh = await mongoose.model('Product').findById(product._id);
    expect(fresh.stock).toBe(10);
    expect(fresh.salesCount).toBe(0);
  });

  it('creates an InventoryMovement "returned" record for staff-path cancellation, matching the customer path', async () => {
    const product = await seedProduct({ stock: 10 });
    const { accessToken } = await registerAndLogin();
    const adminToken = await staffToken('admin', 'inv-admin');

    await addToCart(accessToken, product._id, 2);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;

    await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });

    // Non-fatal InventoryMovement writes are fire-and-forget in the service —
    // give them a tick to land before asserting.
    await new Promise((r) => setTimeout(r, 50));

    const InventoryMovement = mongoose.model('InventoryMovement');
    const movement = await InventoryMovement.findOne({ referenceId: orderId, type: 'returned' });
    expect(movement).not.toBeNull();
    expect(movement.quantity).toBe(2);
    expect(movement.reason).toBe('cancellation');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CLUB POINTS REVERSAL — both cancellation paths
// ══════════════════════════════════════════════════════════════════════════
describe('Order cancellation consistency — Club points reversal', () => {
  it('customer cancellation reverses reserved points (baseline, already-existing behavior)', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 300 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    const orderId = orderRes.body.data.order._id;

    let fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(100); // reserved

    const cancelRes = await request(app).patch(`${ORDERS}/${orderId}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(cancelRes.status).toBe(200);

    fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(300);
  });

  it('THE BUG: staff cancellation via updateStatus performs the SAME points reversal as customer cancellation', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 300 });
    const adminToken = await staffToken('admin', 'points-admin');

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    const orderId = orderRes.body.data.order._id;

    let fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(100); // reserved

    const res = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);

    fresh = await mongoose.model('User').findById(user._id);
    // Before the fix: stayed at 100 (points never returned). After: 300.
    expect(fresh.membership.points).toBe(300);

    const Order = mongoose.model('Order');
    const freshOrder = await Order.findById(orderId);
    expect(freshOrder.pointsRedeemedReversed).toBe(true);
  });

  it('an order with NO redeemed points cancels cleanly via the staff path (no-op reversal, no crash)', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 300 }); // member, but redeems nothing
    const adminToken = await staffToken('admin', 'nopoints-admin');

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken); // no pointsToRedeem
    const orderId = orderRes.body.data.order._id;

    const res = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(300); // untouched — nothing to reverse
  });
});

// ══════════════════════════════════════════════════════════════════════════
// IDEMPOTENCY — cannot double-restore stock or double-reverse points
// ══════════════════════════════════════════════════════════════════════════
describe('Order cancellation consistency — idempotency', () => {
  it('cancelling the same order twice via the customer path never double-restores stock (second attempt is rejected)', async () => {
    const product = await seedProduct({ stock: 10 });
    const { accessToken } = await registerAndLogin();

    await addToCart(accessToken, product._id, 3);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;

    const first = await request(app).patch(`${ORDERS}/${orderId}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(first.status).toBe(200);

    const second = await request(app).patch(`${ORDERS}/${orderId}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(second.status).toBe(400);
    expect(second.body.error?.code ?? second.body.code).toBe('ORDER_ALREADY_CANCELLED');

    const fresh = await mongoose.model('Product').findById(product._id);
    expect(fresh.stock).toBe(10); // restored exactly once, not twice
  });

  it('a superadmin force-recancelling an already-cancelled order (bypasses ALLOWED_TRANSITIONS) cannot double-restore stock or points', async () => {
    const product = await seedProduct({ stock: 10, price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 300 });
    const superToken = await staffToken('superadmin', 'force-super');

    await addToCart(accessToken, product._id, 3);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    const orderId = orderRes.body.data.order._id;

    // First cancellation — succeeds normally, restores stock + points.
    const first = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'cancelled' });
    expect(first.status).toBe(200);

    let freshProduct = await mongoose.model('Product').findById(product._id);
    let freshUser = await mongoose.model('User').findById(user._id);
    expect(freshProduct.stock).toBe(10);
    expect(freshUser.membership.points).toBe(300);

    // Second attempt — superadmin's "force any transition" bypass means
    // ALLOWED_TRANSITIONS['cancelled'] (empty array) is NOT what blocks this;
    // performCancellation's own internal guard must reject it instead.
    const second = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'cancelled' });
    expect(second.status).toBe(400);
    expect(second.body.error?.code ?? second.body.code).toBe('ORDER_ALREADY_CANCELLED');

    freshProduct = await mongoose.model('Product').findById(product._id);
    freshUser = await mongoose.model('User').findById(user._id);
    expect(freshProduct.stock).toBe(10);        // still exactly restored once
    expect(freshUser.membership.points).toBe(300); // still exactly restored once
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTHORIZATION — must not be broadened by this fix
// ══════════════════════════════════════════════════════════════════════════
describe('Order cancellation consistency — authorization unchanged', () => {
  it('Warehouse is NOT authorized to cancel an order via the status-update path (still FORBIDDEN)', async () => {
    const product = await seedProduct({ stock: 10 });
    const { accessToken } = await registerAndLogin();
    const warehouseToken = await staffToken('warehouse', 'wh-forbid');

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;

    const res = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(403);

    // Confirm nothing happened — order untouched, stock untouched.
    const freshOrder = await mongoose.model('Order').findById(orderId);
    expect(freshOrder.status).not.toBe('cancelled');
    const freshProduct = await mongoose.model('Product').findById(product._id);
    expect(freshProduct.stock).toBe(9);
  });

  it('a delivered order cannot be cancelled through either path (invalid transition still rejected)', async () => {
    const product = await seedProduct({ stock: 10 });
    const { accessToken } = await registerAndLogin();
    const adminToken = await staffToken('admin', 'delivered-admin');

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);

    const orderService = require('../server/services/order.service');
    const actor = { _id: (await mongoose.model('User').findOne({ email: /delivered-admin/ }))._id, role: 'admin' };
    await orderService.updateStatus(orderId, 'processing', actor);
    await orderService.updateStatus(orderId, 'shipped', actor);
    await orderService.updateStatus(orderId, 'delivered', actor);

    // Customer path: rejected by cancelOrder's own ALLOWED_TRANSITIONS check.
    const custCancel = await request(app).patch(`${ORDERS}/${orderId}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(custCancel.status).toBe(400);
    expect(custCancel.body.error?.code ?? custCancel.body.code).toBe('INVALID_STATUS_TRANSITION');

    // Staff (non-superadmin) path: rejected by updateStatus's own ALLOWED_TRANSITIONS check.
    const staffCancel = await request(app)
      .patch(`${ORDERS}/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });
    expect(staffCancel.status).toBe(400);
    expect(staffCancel.body.error?.code ?? staffCancel.body.code).toBe('INVALID_STATUS_TRANSITION');

    const fresh = await mongoose.model('Product').findById(product._id);
    expect(fresh.stock).toBe(9); // never restored — order was never actually cancelled
  });
});
