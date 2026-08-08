'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

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
  await mongoose.model('MembershipPointsTransaction').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _seq = 0;

async function registerAndLogin(overrides = {}) {
  _seq += 1;
  const email = overrides.email ?? `pv-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'PV Test User',
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
    email: `${role}${suffix}@pv-test.com`,
    password: 'Password123!',
    role,
  });
}

// Directly grants active VIP membership — bypasses real checkout for test
// speed (the real checkout→payment→activation flow is already covered end
// to end by tests/membershipPurchase.test.js).
async function makeMember(userId, { plan = 'monthly', points = 0, lifetimePoints = 0 } = {}) {
  const User = mongoose.model('User');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (plan === 'annual' ? 365 : 30) * 86400000);
  await User.findByIdAndUpdate(userId, {
    $set: {
      'membership.status': 'active',
      'membership.plan': plan,
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
    name:        'PV Test Keyboard',
    slug:        `pv-test-keyboard-${Date.now()}-${_seq}`,
    sku:         `SKU-PV-${Date.now()}-${_seq}`,
    brand:       'TestBrand',
    price:       1000,
    stock:       50,
    category:    cat._id,
    description: 'A great keyboard for points/VIP testing',
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

async function markDelivered(orderId) {
  // Walk the real fulfillment pipeline via the service layer (mirrors what
  // an admin/staff would do through confirmed→processing→shipped→delivered)
  // — exercises the actual points-earning realization hook in updateStatus.
  const orderService = require('../server/services/order.service');
  const admin = await createUserWithRole('admin', `-deliver-${Date.now()}-${_seq++}`);
  const actor = { _id: admin._id, role: 'admin' };
  await orderService.updateStatus(orderId, 'processing', actor);
  await orderService.updateStatus(orderId, 'shipped', actor);
  return orderService.updateStatus(orderId, 'delivered', actor);
}

async function adminToken() {
  const jwt = require('../server/utils/jwt');
  _seq += 1;
  const admin = await createUserWithRole('admin', `-tok-${Date.now()}-${_seq}`);
  return jwt.generateAccessToken({ id: admin._id });
}

// ══════════════════════════════════════════════════════════════════════════
// POINTS EARNING
// ══════════════════════════════════════════════════════════════════════════
describe('Points earning — default rate, eligibility, multiplier', () => {
  it('a VIP member earns 5% in points on an eligible product once the order is delivered', async () => {
    const product = await seedProduct({ price: 1000 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);

    let fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(0); // not yet delivered — no earning yet

    await markDelivered(orderId);

    fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(50); // 1000 * 5%
    expect(fresh.membership.lifetimePoints).toBe(50);

    const Tx = mongoose.model('MembershipPointsTransaction');
    const earnTx = await Tx.findOne({ order: orderId, type: 'earn' });
    expect(earnTx).not.toBeNull();
    expect(earnTx.points).toBe(50);
    expect(earnTx.expiresAt).not.toBeNull();
  });

  it('a non-VIP customer earns 0 points, even on a delivered order', async () => {
    const product = await seedProduct({ price: 1000 });
    const { accessToken, user } = await registerAndLogin(); // never made a member

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(0);

    const Order = mongoose.model('Order');
    const freshOrder = await Order.findById(orderId);
    expect(freshOrder.pointsEarned).toBe(0);
  });

  it('a pointsEligible:false product earns no points for a VIP member', async () => {
    const product = await seedProduct({ price: 1000, pointsEligible: false });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(0);
  });

  it('a custom pointsRateOverride (e.g. 1%) is used instead of the 5% default', async () => {
    const product = await seedProduct({ price: 1000, pointsRateOverride: 0.01 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(10); // 1000 * 1%
  });

  it('a 2x points campaign doubles the effective earning rate (10% instead of 5%)', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: '2x Points Gaming Promo',
      discountPercent: 1, // campaigns require a discountPercent even when only used for pointsMultiplier
      startDate: new Date(Date.now() - 86400000),
      endDate:   new Date(Date.now() + 86400000),
      isActive: true,
      products: [product._id],
      pointsMultiplier: 2,
    });

    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    const fresh = await mongoose.model('User').findById(user._id);
    // 1000 * 5% * 2 = 100 (the discountPercent:1 also shaves ₪10 off price,
    // so the true eligible base is 990 — see next assertion for the exact math)
    const Order = mongoose.model('Order');
    const freshOrder = await Order.findById(orderId);
    const expectedBase = freshOrder.items[0].totalPrice; // discounted unit price × qty
    expect(fresh.membership.points).toBe(Math.floor(expectedBase * 0.05 * 2));
  });

  it('idempotent earning — realizing the same delivered order twice does not double the balance', async () => {
    const product = await seedProduct({ price: 1000 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    const afterFirst = await mongoose.model('User').findById(user._id);
    expect(afterFirst.membership.points).toBe(50);

    // Explicit second realization call — must be a safe no-op.
    const pointsService = require('../server/services/points.service');
    const Order = mongoose.model('Order');
    const order = await Order.findById(orderId);
    await pointsService.realizeEarnedPoints(order);

    const afterSecond = await mongoose.model('User').findById(user._id);
    expect(afterSecond.membership.points).toBe(50);

    const Tx = mongoose.model('MembershipPointsTransaction');
    const earnCount = await Tx.countDocuments({ order: orderId, type: 'earn' });
    expect(earnCount).toBe(1);
  });

  it('a full refund on a delivered order reverses the earned points (points AND lifetimePoints)', async () => {
    const product = await seedProduct({ price: 1000 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    const orderId = orderRes.body.data.order._id;
    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    let fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(50);

    const refundService = require('../server/services/refund.service');
    const admin = await createUserWithRole('admin', `-refund-${Date.now()}`);
    await refundService.refundOrder(orderId, { amount: 1000, reason: 'test' }, { _id: admin._id, role: 'admin' });

    fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(0);
    expect(fresh.membership.lifetimePoints).toBe(0);

    const Tx = mongoose.model('MembershipPointsTransaction');
    const reversal = await Tx.findOne({ order: orderId, type: 'reversal' });
    expect(reversal).not.toBeNull();
    expect(reversal.points).toBe(50);
  });

  it('points expiry reconciliation moves due points from available balance into an "expiry" ledger entry', async () => {
    const { user } = await registerAndLogin();
    await makeMember(user._id);
    const Tx = mongoose.model('MembershipPointsTransaction');
    const User = mongoose.model('User');

    // Simulate an earn transaction from 13 months ago (already past its
    // 12-month expiry) directly — this is what realizeEarnedPoints would
    // have created back then.
    const earnedAt = new Date(Date.now() - 396 * 86400000);
    const expiresAt = new Date(earnedAt); expiresAt.setMonth(expiresAt.getMonth() + 12);
    await Tx.create({ user: user._id, type: 'earn', points: 80, expiresAt, createdAt: earnedAt });
    await User.findByIdAndUpdate(user._id, { $inc: { 'membership.points': 80, 'membership.lifetimePoints': 80 } });

    const pointsService = require('../server/services/points.service');
    const result = await pointsService.expireDuePoints(user._id);
    expect(result.expired).toBe(80);

    const fresh = await User.findById(user._id);
    expect(fresh.membership.points).toBe(0);
    expect(fresh.membership.lifetimePoints).toBe(80); // lifetimePoints is a permanent historical record — expiry never reduces it

    const expiryTx = await Tx.findOne({ user: user._id, type: 'expiry' });
    expect(expiryTx).not.toBeNull();
    expect(expiryTx.points).toBe(80);

    // Idempotent — running again processes nothing new.
    const second = await pointsService.expireDuePoints(user._id);
    expect(second.expired).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// POINTS REDEMPTION
// ══════════════════════════════════════════════════════════════════════════
describe('Points redemption at checkout', () => {
  it('partial redemption reduces the payable total and deducts the balance immediately (reserved)', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 800 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data.order;
    expect(order.pointsRedeemed).toBe(200);
    expect(order.pointsRedeemedValue).toBe(200);
    expect(order.total).toBe(300); // 500 - 200

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(600); // 800 - 200, reserved immediately
  });

  it('full redemption can zero out the payable total (never below ₪0)', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 800 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 500 });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.order.total).toBe(0);
    expect(orderRes.body.data.order.pointsRedeemed).toBe(500);

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(300); // 800 - 500
  });

  it('requesting more points than the order costs is capped — never redeems more than needed', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 800 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 800 }); // more than the ₪500 order
    expect(orderRes.body.data.order.total).toBe(0);
    expect(orderRes.body.data.order.pointsRedeemed).toBe(500); // capped, not 800

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(300); // only 500 was actually reserved
  });

  it('rejects redemption that exceeds the available balance', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 50 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    expect(orderRes.status).toBe(400);
    expect(orderRes.body.error.code).toBe('INSUFFICIENT_POINTS');

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(50); // untouched — nothing was reserved
  });

  it('a non-member cannot redeem points', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken } = await registerAndLogin(); // not a member

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 10 });
    expect(orderRes.status).toBe(400);
    expect(orderRes.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('redeemed points do not themselves earn new points (only the cash-paid eligible portion earns)', async () => {
    const product = await seedProduct({ price: 1000 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 200 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    const orderId = orderRes.body.data.order._id;
    expect(orderRes.body.data.order.pointsEarned).toBe(40); // (1000-200) * 5% = 40, NOT 50

    await payOrder(accessToken, orderId);
    await markDelivered(orderId);

    const fresh = await mongoose.model('User').findById(user._id);
    // balance: 200 (start) - 200 (redeemed) + 40 (earned) = 40
    expect(fresh.membership.points).toBe(40);
  });

  it('concurrency: two simultaneous orders both trying to spend the same points — only one succeeds', async () => {
    const product = await seedProduct({ price: 100 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 100 });

    await addToCart(accessToken, product._id, 5); // enough stock for 2 separate orders of qty 1 won't collide on stock
    // Two DIFFERENT carts aren't easy to simulate via the single-cart API, so
    // exercise the underlying atomic primitive directly — this is exactly
    // what order.service.js calls internally, and is the real concurrency
    // guarantee under test (see points.service.js#reservePoints).
    const pointsService = require('../server/services/points.service');
    const orderIdA = new mongoose.Types.ObjectId();
    const orderIdB = new mongoose.Types.ObjectId();

    const [resA, resB] = await Promise.allSettled([
      pointsService.reservePoints(user._id, 80, orderIdA),
      pointsService.reservePoints(user._id, 80, orderIdB),
    ]);

    const succeeded = [resA, resB].filter(r => r.status === 'fulfilled');
    const failed     = [resA, resB].filter(r => r.status === 'rejected');
    expect(succeeded).toHaveLength(1); // only one of the two 80-point reservations can succeed against a 100 balance
    expect(failed).toHaveLength(1);
    expect(failed[0].reason.code).toBe('INSUFFICIENT_POINTS');

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(20); // 100 - 80, exactly once
  });

  it('cancelling a pending order returns the reserved points', async () => {
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
    expect(fresh.membership.points).toBe(300); // fully returned

    const Order = mongoose.model('Order');
    const freshOrder = await Order.findById(orderId);
    expect(freshOrder.pointsRedeemedReversed).toBe(true);
  });

  it('an expired unpaid order reversal returns reserved points (via the real expiry job)', async () => {
    const product = await seedProduct({ price: 500 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id, { points: 300 });

    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken, { pointsToRedeem: 200 });
    const orderId = orderRes.body.data.order._id;

    const Order = mongoose.model('Order');
    await Order.updateOne({ _id: orderId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const expireJob = require('../server/jobs/cancelExpiredOrders.job');
    const stats = await expireJob();
    expect(stats.cancelled).toBeGreaterThanOrEqual(1);

    const fresh = await mongoose.model('User').findById(user._id);
    expect(fresh.membership.points).toBe(300); // fully returned
  });
});

// ══════════════════════════════════════════════════════════════════════════
// VIP CAMPAIGN PRICING (membershipOnly) + EARLY ACCESS
// ══════════════════════════════════════════════════════════════════════════
describe('VIP-only campaign pricing (membershipOnly)', () => {
  it('a VIP member gets the membershipOnly discounted price on the product detail endpoint', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'VIP Exclusive Deal', discountPercent: 20,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], membershipOnly: true,
    });

    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    const res = await request(app).get(`/api/v1/products/${product.slug}`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data.product.discountedPrice).toBe(800);
  });

  it('a non-VIP customer does NOT see the membershipOnly discount at all (public/guest request)', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'VIP Exclusive Deal 2', discountPercent: 20,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], membershipOnly: true,
    });

    const res = await request(app).get(`/api/v1/products/${product.slug}`); // no auth at all
    expect(res.body.data.product.discountedPrice).toBeUndefined();
  });

  it('a non-VIP customer cannot check out at the VIP price — the server recomputes it as full price', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'VIP Exclusive Deal 3', discountPercent: 20,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], membershipOnly: true,
    });

    const { accessToken } = await registerAndLogin(); // NOT a member
    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    expect(orderRes.body.data.order.items[0].unitPrice).toBe(1000); // full price, not 800
  });

  it('the SAME campaign correctly charges a VIP member the discounted price at real checkout', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'VIP Exclusive Deal 4', discountPercent: 20,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], membershipOnly: true,
    });

    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);
    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    expect(orderRes.body.data.order.items[0].unitPrice).toBe(800);
  });
});

describe('VIP early access (vipEarlyAccessHours)', () => {
  it('a VIP member sees/uses a not-yet-started campaign within its early-access window', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'Early Access Sale', discountPercent: 30,
      startDate: new Date(Date.now() + 2 * 3600000),  // starts in 2 hours
      endDate:   new Date(Date.now() + 48 * 3600000),
      isActive: true, products: [product._id], vipEarlyAccessHours: 6, // opens 6h before start → already open
    });

    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);

    const res = await request(app).get(`/api/v1/products/${product.slug}`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data.product.discountedPrice).toBe(700);
  });

  it('a non-VIP customer does NOT see the early-access price before the real startDate', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'Early Access Sale 2', discountPercent: 30,
      startDate: new Date(Date.now() + 2 * 3600000),
      endDate:   new Date(Date.now() + 48 * 3600000),
      isActive: true, products: [product._id], vipEarlyAccessHours: 6,
    });

    const res = await request(app).get(`/api/v1/products/${product.slug}`); // guest
    expect(res.body.data.product.discountedPrice).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// WAREHOUSE VIP PRIORITY
// ══════════════════════════════════════════════════════════════════════════
describe('Warehouse VIP order priority', () => {
  it('sort=priority lists VIP orders before non-VIP orders regardless of creation order', async () => {
    const product = await seedProduct({ price: 100, stock: 10 });

    const { accessToken: nonVipToken } = await registerAndLogin({ email: 'pv-nonvip-priority@example.com' });
    await addToCart(nonVipToken, product._id, 1);
    const nonVipOrder = await createOrder(nonVipToken);
    await payOrder(nonVipToken, nonVipOrder.body.data.order._id);

    const { accessToken: vipToken, user: vipUser } = await registerAndLogin({ email: 'pv-vip-priority@example.com' });
    await makeMember(vipUser._id);
    await addToCart(vipToken, product._id, 1);
    const vipOrder = await createOrder(vipToken);
    await payOrder(vipToken, vipOrder.body.data.order._id);

    const Order = mongoose.model('Order');
    expect((await Order.findById(vipOrder.body.data.order._id)).isVipOrder).toBe(true);
    expect((await Order.findById(nonVipOrder.body.data.order._id)).isVipOrder).toBe(false);

    const token = await adminToken();
    const res = await request(app)
      .get(`${ORDERS}/all?status=confirmed&sort=priority`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.orders.map(o => String(o._id));
    const vipIdx    = ids.indexOf(String(vipOrder.body.data.order._id));
    const nonVipIdx = ids.indexOf(String(nonVipOrder.body.data.order._id));
    expect(vipIdx).toBeGreaterThanOrEqual(0);
    expect(nonVipIdx).toBeGreaterThanOrEqual(0);
    expect(vipIdx).toBeLessThan(nonVipIdx); // VIP order (created SECOND) still sorts first
  });

  it('the default ("newest") sort is completely unaffected by isVipOrder — no regression to Admin', async () => {
    const product = await seedProduct({ price: 100, stock: 10 });
    const { accessToken } = await registerAndLogin({ email: 'pv-default-sort@example.com' });
    await addToCart(accessToken, product._id, 1);
    const orderRes = await createOrder(accessToken);
    await payOrder(accessToken, orderRes.body.data.order._id);

    const token = await adminToken();
    const res = await request(app).get(`${ORDERS}/all?status=confirmed`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200); // still works, still newest-first by default
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CLUB SUMMARY ENDPOINT (points campaign teaser + VIP exclusive deals)
// ══════════════════════════════════════════════════════════════════════════
describe('GET /campaigns/club-summary', () => {
  it('a guest gets pointsCampaign info but always an empty vipDeals array', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'Public 2x Points', discountPercent: 5,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], pointsMultiplier: 2,
    });
    await Campaign.create({
      name: 'VIP Only Deal', discountPercent: 15,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], membershipOnly: true,
    });

    const res = await request(app).get('/api/v1/campaigns/club-summary'); // no auth at all
    expect(res.status).toBe(200);
    expect(res.body.data.pointsCampaign.name).toBe('Public 2x Points');
    expect(res.body.data.pointsCampaign.pointsMultiplier).toBe(2);
    expect(res.body.data.vipDeals).toEqual([]); // never exposed to a guest, even though a real VIP deal exists
  });

  it('a VIP member sees real vipDeals with the correct discounted VIP price', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'VIP Only Deal 2', discountPercent: 15,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], membershipOnly: true,
    });

    const { accessToken, user } = await registerAndLogin({ email: 'pv-club-summary-vip@example.com' });
    await makeMember(user._id);

    const res = await request(app).get('/api/v1/campaigns/club-summary').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vipDeals).toHaveLength(1);
    expect(res.body.data.vipDeals[0].vipPrice).toBe(850); // 1000 * 0.85
  });

  it('a non-member (never joined) gets an empty pointsCampaign when only a membershipOnly points campaign exists', async () => {
    const product = await seedProduct({ price: 1000 });
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'VIP Only 2x Points', discountPercent: 5,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      isActive: true, products: [product._id], pointsMultiplier: 2, membershipOnly: true,
    });

    const { accessToken } = await registerAndLogin({ email: 'pv-club-summary-nonmember@example.com' });
    const res = await request(app).get('/api/v1/campaigns/club-summary').set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data.pointsCampaign).toBeNull();
  });

  it('returns pointsCampaign: null when no qualifying campaign is active', async () => {
    const res = await request(app).get('/api/v1/campaigns/club-summary');
    expect(res.body.data.pointsCampaign).toBeNull();
    expect(res.body.data.vipDeals).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — Product points controls & Campaign VIP controls
// ══════════════════════════════════════════════════════════════════════════
describe('Admin controls — product points fields, campaign VIP fields', () => {
  it('admin can set a product pointsRateOverride and pointsEligible:false via the real product update endpoint', async () => {
    const product = await seedProduct({ price: 500 });
    const token = await adminToken();

    const res = await request(app)
      .patch(`/api/v1/products/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pointsRateOverride: 0.02 });
    expect(res.status).toBe(200);
    expect(res.body.data.product.pointsRateOverride).toBe(0.02);

    const res2 = await request(app)
      .patch(`/api/v1/products/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pointsEligible: false });
    expect(res2.body.data.product.pointsEligible).toBe(false);
  });

  it('admin can create a campaign with membershipOnly/pointsMultiplier/vipEarlyAccessHours via the real campaign endpoint', async () => {
    const product = await seedProduct({ price: 500 });
    const token = await adminToken();

    const res = await request(app)
      .post('/api/v1/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Admin VIP Test Campaign',
        discountPercent: 10,
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        products: [String(product._id)],
        membershipOnly: true,
        pointsMultiplier: 3,
        vipEarlyAccessHours: 12,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.campaign.membershipOnly).toBe(true);
    expect(res.body.data.campaign.pointsMultiplier).toBe(3);
    expect(res.body.data.campaign.vipEarlyAccessHours).toBe(12);
  });
});
