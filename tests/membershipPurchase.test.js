'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH       = '/api/v1/auth';
const MEMBERSHIP = '/api/v1/membership';
const PAYMENTS   = '/api/v1/payments';
const ORDERS     = '/api/v1/orders';
const CART       = '/api/v1/cart';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  // Ensures the partial unique index on {user, membershipPendingLock} is
  // actually built before the concurrency tests rely on it.
  await mongoose.model('Order').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
async function registerAndLogin(overrides = {}) {
  _seq += 1;
  const email = overrides.email ?? `member-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'Test Member',
    email,
    password: 'Password123!',
  });
  return { user: res.body.data.user, accessToken: res.body.data.accessToken, email };
}

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User${suffix}`,
    email:    `${role}${suffix}@membership-purchase-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password });
  return res.body.data?.accessToken;
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
    name:        'Test Keyboard',
    slug:        `test-keyboard-${Date.now()}-${_seq}`,
    sku:         `SKU-${Date.now()}-${_seq}`,
    brand:       'TestBrand',
    price:       299,
    stock:       10,
    category:    cat._id,
    description: 'A great keyboard for testing',
    isPublished: true,
    isDeleted:   false,
    images:      [],
    ...overrides,
  });
}

// Pays for an order end-to-end via the mock provider (create-intent + confirm).
async function payOrder(token, orderId) {
  const intentRes = await request(app)
    .post(`${PAYMENTS}/create-intent`)
    .set('Authorization', `Bearer ${token}`)
    .send({ orderId });
  expect(intentRes.status).toBe(200);
  const { paymentIntentId } = intentRes.body.data;

  return request(app)
    .post(`${PAYMENTS}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({ orderId, paymentIntentId });
}

// ── 1/2/3/4: creation guardrails ────────────────────────────────────────────────

describe('POST /membership/checkout', () => {
  it('lets an authenticated non-member create a membership purchase order', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });

    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.items).toHaveLength(1);
    expect(order.items[0].itemType).toBe('membership');
    expect(order.total).toBe(20); // monthly plan price
    expect(order.status).toBe('pending_payment');
    expect(order.paymentStatus).toBe('unpaid');
  });

  it('uses the canonical plan price regardless of client-submitted pricing', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly', price: 1, membershipPrice: 1, total: 1, unitPrice: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.order.total).toBe(20);
    expect(res.body.data.order.items[0].unitPrice).toBe(20);
    expect(res.body.data.order.items[0].totalPrice).toBe(20);
  });

  it('creates an annual-plan order at the canonical ₪200 price', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'annual' });

    expect(res.status).toBe(201);
    expect(res.body.data.order.total).toBe(200);
    expect(res.body.data.order.items[0].metadata.membershipPlan).toBe('annual');
  });

  it('rejects a checkout request with no plan / an invalid plan', async () => {
    const { accessToken } = await registerAndLogin();
    const noPlan = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(noPlan.status).toBe(422);

    const badPlan = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'lifetime' });
    expect(badPlan.status).toBe(422);
  });

  it('rejects an unauthenticated (guest) purchase attempt', async () => {
    const res = await request(app).post(`${MEMBERSHIP}/checkout`).send({});
    expect(res.status).toBe(401);
  });

  it('allows an already-active member to start a renewal purchase (unlike the old lifetime model)', async () => {
    const User = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'membership.status': 'active', 'membership.plan': 'monthly',
        'membership.joinedAt': new Date(), 'membership.startedAt': new Date(),
        'membership.expiresAt': new Date(Date.now() + 20 * 86400000),
      },
    });

    const res = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });

    expect(res.status).toBe(201);
  });
});

// ── 5/6/7: payment → activation ─────────────────────────────────────────────────

describe('Membership purchase → payment → activation', () => {
  it('does not activate membership while the order is unpaid', async () => {
    const { accessToken } = await registerAndLogin();
    await request(app).post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.data.user.membership.status).toBe('none');
  });

  it('activates membership after successful payment, sets joinedAt, and completes the order without warehouse fulfillment', async () => {
    const { accessToken } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;

    const payRes = await payOrder(accessToken, orderId);
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.order.paymentStatus).toBe('paid');
    // Step 11: digital/service order skips confirmed→processing→shipped entirely.
    expect(payRes.body.data.order.status).toBe('delivered');

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.data.user.membership.status).toBe('active');
    expect(me.body.data.user.membership.joinedAt).not.toBeNull();
  });

  it('does not decrement any product inventory for a membership purchase', async () => {
    const product = await seedProduct({ stock: 7 });
    const { accessToken } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const Product = mongoose.model('Product');
    const fresh = await Product.findById(product._id);
    expect(fresh.stock).toBe(7);
  });

  it('does not reset existing points/lifetimePoints on activation', async () => {
    const User = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();
    await User.findByIdAndUpdate(user._id, {
      $set: { 'membership.points': 75, 'membership.lifetimePoints': 120 },
    });

    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const fresh = await User.findById(user._id);
    expect(fresh.membership.status).toBe('active');
    expect(fresh.membership.points).toBe(75);
    expect(fresh.membership.lifetimePoints).toBe(120);
  });
});

// ── 8/12/13: activation-service-level correctness ───────────────────────────────

describe('membershipService — idempotency, ownership, and validation', () => {
  it('is idempotent — a second activation call is a safe no-op', async () => {
    const membershipService = require('../server/services/membership.service');
    const User = mongoose.model('User');
    const { user, accessToken } = await registerAndLogin();

    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;
    await payOrder(accessToken, orderId); // first activation happens here

    const afterFirst = await User.findById(user._id);
    const joinedAtFirst = afterFirst.membership.joinedAt.getTime();

    // Explicit second call — must not throw, must not change joinedAt.
    const result = await membershipService.activateMembershipForOrder({
      userId: user._id, orderId,
    });
    expect(result.membership.status).toBe('active');
    expect(result.membership.joinedAt.getTime()).toBe(joinedAtFirst);
  });

  it('rejects activation when the order belongs to a different user', async () => {
    const membershipService = require('../server/services/membership.service');
    const owner   = await registerAndLogin({ email: 'owner@example.com' });
    const attacker = await registerAndLogin({ email: 'attacker@example.com' });

    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;
    await payOrder(owner.accessToken, orderId);

    await expect(
      membershipService.activateMembershipForOrder({ userId: attacker.user._id, orderId })
    ).rejects.toMatchObject({ code: 'ORDER_USER_MISMATCH' });

    const User = mongoose.model('User');
    const attackerFresh = await User.findById(attacker.user._id);
    expect(attackerFresh.membership.status).toBe('none');
  });

  it('rejects an invalid membership item status/type at the model level', async () => {
    const Order = mongoose.model('Order');
    const { user } = await registerAndLogin();

    await expect(Order.create({
      orderNumber: `ORD-BADTYPE-${Date.now()}`,
      user: user._id,
      items: [{
        itemType:   'platinum', // not a valid ORDER_ITEM_TYPES value
        name:       'TechVault Club Membership',
        sku:        'MEMBERSHIP-LIFETIME',
        unitPrice:  50,
        quantity:   1,
        totalPrice: 50,
      }],
      subtotal: 50, taxAmount: 0, shippingCost: 0, total: 50,
    })).rejects.toThrow();
  });

  it('rejects a membership item missing required snapshot fields', async () => {
    const Order = mongoose.model('Order');
    const { user } = await registerAndLogin();

    await expect(Order.create({
      orderNumber: `ORD-BADITEM-${Date.now()}`,
      user: user._id,
      items: [{ itemType: 'membership', quantity: 1 }], // missing name/sku/unitPrice/totalPrice
      subtotal: 50, taxAmount: 0, shippingCost: 0, total: 50,
    })).rejects.toThrow();
  });
});

// ── 14: existing physical-order flow is unaffected by the payment.controller.js changes ──

describe('Regression: physical product orders are unaffected', () => {
  it('a normal paid product order is auto-confirmed (not delivered) and clears the cart', async () => {
    const product = await seedProduct({ stock: 5 });
    const { accessToken } = await registerAndLogin();

    await request(app)
      .post(`${CART}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId: product._id, quantity: 1 });

    const orderRes = await request(app)
      .post(ORDERS)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' } });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.order._id;

    const payRes = await payOrder(accessToken, orderId);
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.order.status).toBe('confirmed'); // NOT 'delivered'

    const Product = mongoose.model('Product');
    const fresh = await Product.findById(product._id);
    expect(fresh.stock).toBe(4); // still decremented normally

    const cartRes = await request(app).get(CART).set('Authorization', `Bearer ${accessToken}`);
    expect(cartRes.body.data.cart?.items ?? cartRes.body.data.items ?? []).toHaveLength(0);
  });
});

// ── Hardening: duplicate-purchase race condition ────────────────────────────────

describe('Concurrent POST /membership/checkout requests (race condition)', () => {
  it('two simultaneous requests for the same non-member resolve to exactly one payable order', async () => {
    const { accessToken, user } = await registerAndLogin();

    const [res1, res2] = await Promise.all([
      request(app).post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' }),
      request(app).post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(String(res1.body.data.order._id)).toBe(String(res2.body.data.order._id));

    const Order = mongoose.model('Order');
    const totalOrders = await Order.countDocuments({ user: user._id });
    expect(totalOrders).toBe(1); // no duplicate order row was ever created

    const lockedOrders = await Order.countDocuments({ user: user._id, membershipPendingLock: 'pending' });
    expect(lockedOrders).toBe(1);
  });

  it('a higher-concurrency burst (5 parallel requests) still yields exactly one pending order', async () => {
    const { accessToken, user } = await registerAndLogin();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' }))
    );

    results.forEach(r => expect(r.status).toBe(201));
    const distinctOrderIds = new Set(results.map(r => String(r.body.data.order._id)));
    expect(distinctOrderIds.size).toBe(1);

    const Order = mongoose.model('Order');
    const totalOrders = await Order.countDocuments({ user: user._id });
    expect(totalOrders).toBe(1);
  });
});

// ── Hardening: shipping-address invariant (model/service level) ────────────────

describe('Order shipping-address invariant', () => {
  it('rejects a physical-item order with no shipping address, even bypassing the public Joi route', async () => {
    const Order = mongoose.model('Order');
    const { user } = await registerAndLogin();
    const product = await seedProduct();

    await expect(Order.create({
      orderNumber: `ORD-NOADDR-${Date.now()}`,
      user: user._id,
      items: [{
        itemType: 'product', product: product._id, name: 'Test Keyboard', sku: product.sku,
        unitPrice: 10, quantity: 1, totalPrice: 10,
      }],
      subtotal: 10, taxAmount: 0, shippingCost: 0, total: 10,
      // shippingAddress intentionally omitted
    })).rejects.toThrow();
  });

  it('rejects a physical-item order with a partial shipping address (missing country)', async () => {
    const Order = mongoose.model('Order');
    const { user } = await registerAndLogin();
    const product = await seedProduct();

    await expect(Order.create({
      orderNumber: `ORD-PARTIALADDR-${Date.now()}`,
      user: user._id,
      items: [{
        itemType: 'product', product: product._id, name: 'Test Keyboard', sku: product.sku,
        unitPrice: 10, quantity: 1, totalPrice: 10,
      }],
      shippingAddress: { street: '1 Main St', city: 'Tel Aviv' }, // no country
      subtotal: 10, taxAmount: 0, shippingCost: 0, total: 10,
    })).rejects.toThrow();
  });

  it('allows a membership-only order with no shipping address', async () => {
    const Order = mongoose.model('Order');
    const { user } = await registerAndLogin();

    const order = await Order.create({
      orderNumber: `ORD-MEMBNOADDR-${Date.now()}`,
      user: user._id,
      items: [{
        itemType: 'membership', name: 'TechVault Club Membership — Monthly', sku: 'MEMBERSHIP-MONTHLY',
        unitPrice: 20, quantity: 1, totalPrice: 20, metadata: { membershipPlan: 'monthly' },
      }],
      subtotal: 20, taxAmount: 0, shippingCost: 0, total: 20,
    });

    expect(order._id).toBeDefined();
    expect(order.shippingAddress?.street).toBeUndefined();
  });
});

// ── Hardening: real failed-payment path ─────────────────────────────────────────

describe('A real declined payment (mock provider test-card mechanism)', () => {
  it('leaves membership status "none" and joinedAt null — order stays unpaid', async () => {
    const { accessToken, user } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;

    // 4000 0000 0000 0002 is the mock provider's built-in decline card
    // (see MOCK_DECLINE_CARDS in payment.service.js) — the same one the
    // real checkout UI's "test decline card" button uses.
    const intentRes = await request(app)
      .post(`${PAYMENTS}/create-intent`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ orderId, cardNumber: '4000 0000 0000 0002', cardHolder: 'Test User', expiry: '12/30', cvv: '123' });

    expect(intentRes.status).toBeGreaterThanOrEqual(400);

    const User  = mongoose.model('User');
    const Order = mongoose.model('Order');
    const freshUser  = await User.findById(user._id);
    const freshOrder = await Order.findById(orderId);

    expect(freshUser.membership.status).toBe('none');
    expect(freshUser.membership.joinedAt).toBeNull();
    expect(freshOrder.paymentStatus).toBe('unpaid');
    expect(freshOrder.status).toBe('pending_payment');
  });
});

// ── Hardening: explicit warehouse-fulfillment exclusion ─────────────────────────

describe('Warehouse fulfillment queue exclusion (real listing endpoint)', () => {
  it('a completed membership-only order does not appear in the actionable (confirmed) warehouse queue', async () => {
    await createUserWithRole('warehouse', '-excl');
    const warehouseToken = await loginAs('warehouse-excl@membership-purchase-test.com');

    const { accessToken } = await registerAndLogin({ email: 'wh-exclusion-member@example.com' });
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;
    const payRes = await payOrder(accessToken, orderId);
    expect(payRes.body.data.order.status).toBe('delivered');

    const confirmedQueue = await request(app)
      .get(`${ORDERS}/all?status=confirmed`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(confirmedQueue.status).toBe(200);
    const confirmedIds = confirmedQueue.body.data.orders.map(o => String(o._id));
    expect(confirmedIds).not.toContain(String(orderId));

    const processingQueue = await request(app)
      .get(`${ORDERS}/all?status=processing`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    const processingIds = processingQueue.body.data.orders.map(o => String(o._id));
    expect(processingIds).not.toContain(String(orderId));
  });

  it('a physical order DOES appear in the actionable (confirmed) warehouse queue, unaffected', async () => {
    await createUserWithRole('warehouse', '-incl');
    const warehouseToken = await loginAs('warehouse-incl@membership-purchase-test.com');

    const product = await seedProduct({ stock: 5 });
    const { accessToken } = await registerAndLogin({ email: 'wh-inclusion-buyer@example.com' });

    await request(app)
      .post(`${CART}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId: product._id, quantity: 1 });

    const orderRes = await request(app)
      .post(ORDERS)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' } });
    const orderId = orderRes.body.data.order._id;
    const payRes = await payOrder(accessToken, orderId);
    expect(payRes.body.data.order.status).toBe('confirmed');

    const confirmedQueue = await request(app)
      .get(`${ORDERS}/all?status=confirmed`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    const confirmedIds = confirmedQueue.body.data.orders.map(o => String(o._id));
    expect(confirmedIds).toContain(String(orderId));
  });
});

// ── Hardening: paid-but-not-activated recovery ──────────────────────────────────

describe('Paid-but-not-activated recovery (crash-recovery replay)', () => {
  it('a legitimate /payments/confirm replay repairs a stuck paid-but-inactive membership order', async () => {
    const Order = mongoose.model('Order');
    const User  = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();

    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;

    // Reproduce the crash scenario directly: payment succeeded and was
    // durably persisted (paid + delivered), but the process died before the
    // activation call completed. There is no public endpoint that can cause
    // this — it's simulated here purely to prove the replay path repairs it.
    await Order.findByIdAndUpdate(orderId, { $set: { paymentStatus: 'paid', status: 'delivered' } });

    const stuckUser = await User.findById(user._id);
    expect(stuckUser.membership.status).toBe('none'); // the exact stuck state described in the brief

    // Legitimate retry: the client (or a replayed Stripe webhook) calls the
    // real confirm endpoint again for the same order. paymentIntentId is
    // irrelevant — the endpoint's existing "already paid" idempotency guard
    // short-circuits straight into the repair path before it's ever used.
    const replayRes = await request(app)
      .post(`${PAYMENTS}/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ orderId, paymentIntentId: 'replayed_intent_id' });

    expect(replayRes.status).toBe(200);

    const repairedUser = await User.findById(user._id);
    expect(repairedUser.membership.status).toBe('active');
    expect(repairedUser.membership.joinedAt).not.toBeNull();
  });

  it('a replayed Stripe-style webhook call also repairs the same stuck state (idempotent, no double side effects)', async () => {
    const membershipService = require('../server/services/membership.service');
    const Order = mongoose.model('Order');
    const User  = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();

    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ plan: 'monthly' });
    const orderId = checkoutRes.body.data.order._id;

    await Order.findByIdAndUpdate(orderId, { $set: { paymentStatus: 'paid', status: 'delivered' } });

    // Direct service-level replay (equivalent to what the webhook handler
    // does internally for an already-paid order) — call twice to prove no
    // duplicate side effects occur on top of the repair.
    await membershipService.activateMembershipForOrder({ userId: user._id, orderId });
    const afterFirst = await User.findById(user._id);
    const joinedAtFirst = afterFirst.membership.joinedAt.getTime();

    await membershipService.activateMembershipForOrder({ userId: user._id, orderId });
    const afterSecond = await User.findById(user._id);

    expect(afterSecond.membership.status).toBe('active');
    expect(afterSecond.membership.joinedAt.getTime()).toBe(joinedAtFirst);
  });
});

// ── New: monthly/annual TERM model — activation, expiration, renewal ───────────

describe('Membership TERM model (monthly/annual, no auto-renewal)', () => {
  it('activates a monthly plan with expiresAt exactly one real calendar month out (not a fixed 30-day window)', async () => {
    const { accessToken } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    const m = me.body.data.user.membership;
    expect(m.status).toBe('active');
    expect(m.plan).toBe('monthly');

    // Calendar-accurate: exactly "the same day next month" where that day
    // exists, otherwise clamped to the destination month's last real day —
    // never a fixed 30-day window and never an overflow into a third month.
    // Uses the real production helper (not hand-rolled date math) so this
    // test stays correct even if it happens to run on a month-end day.
    const { addCalendarTerm } = require('../server/config/membership');
    const expected = addCalendarTerm(new Date(m.startedAt), 'monthly');
    expect(new Date(m.expiresAt).toISOString()).toBe(expected.toISOString());
  });

  it('activates an annual plan with expiresAt exactly one real calendar year out (not a fixed 365-day window)', async () => {
    const { accessToken } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'annual' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    const m = me.body.data.user.membership;
    expect(m.status).toBe('active');
    expect(m.plan).toBe('annual');

    const { addCalendarTerm } = require('../server/config/membership');
    const expected = addCalendarTerm(new Date(m.startedAt), 'annual');
    expect(new Date(m.expiresAt).toISOString()).toBe(expected.toISOString());
  });

  it('a normal same-day renewal: Aug 8, 2026 + 1 month → Sep 8, 2026 (no clamp needed)', () => {
    const { addCalendarTerm } = require('../server/config/membership');
    const result = addCalendarTerm(new Date('2026-08-08T00:00:00.000Z'), 'monthly');
    expect(result.toISOString()).toBe('2026-09-08T00:00:00.000Z');
  });

  it('calendar month-end clamp: Jan 31, 2026 + 1 month lands on Feb 28, 2026 (Feb has no 31st, non-leap)', () => {
    const { addCalendarTerm } = require('../server/config/membership');
    const result = addCalendarTerm(new Date('2026-01-31T00:00:00.000Z'), 'monthly');
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('calendar month-end clamp: Jan 31, 2028 + 1 month lands on Feb 29, 2028 (leap year — clamped, not overflowed)', () => {
    const { addCalendarTerm } = require('../server/config/membership');
    const result = addCalendarTerm(new Date('2028-01-31T00:00:00.000Z'), 'monthly');
    expect(result.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('calendar leap-year clamp: Feb 29, 2028 + 1 year lands on Feb 28, 2029 (2029 is not a leap year)', () => {
    const { addCalendarTerm } = require('../server/config/membership');
    const result = addCalendarTerm(new Date('2028-02-29T00:00:00.000Z'), 'annual');
    expect(result.toISOString()).toBe('2029-02-28T00:00:00.000Z');
  });

  it('calendar year-end rollover: Dec 31, 2026 + 1 month lands on Jan 31, 2027 (no clamp — January has 31 days)', () => {
    const { addCalendarTerm } = require('../server/config/membership');
    const result = addCalendarTerm(new Date('2026-12-31T00:00:00.000Z'), 'monthly');
    expect(result.toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });

  it('an expired member (expiresAt in the past) is reported as status "expired" and is NOT VIP', async () => {
    const User = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();
    const past = new Date(Date.now() - 86400000); // yesterday
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'membership.status': 'active',
        'membership.plan': 'monthly',
        'membership.joinedAt': new Date(Date.now() - 40 * 86400000),
        'membership.startedAt': new Date(Date.now() - 40 * 86400000),
        'membership.expiresAt': past,
      },
    });

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.data.user.membership.status).toBe('expired');

    const { isMembershipActive } = require('../server/models/User');
    const fresh = await User.findById(user._id);
    expect(isMembershipActive(fresh.membership)).toBe(false);
  });

  it('an expired member CAN purchase again (not blocked by ALREADY_MEMBER)', async () => {
    const User = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'membership.status': 'active', 'membership.plan': 'monthly',
        'membership.expiresAt': new Date(Date.now() - 86400000),
      },
    });

    const res = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'annual' });
    expect(res.status).toBe(201);
  });

  it('renewing BEFORE expiry extends the term from the current expiresAt (does not lose paid time)', async () => {
    const User = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();

    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);
    const afterFirst = await User.findById(user._id);
    const firstExpiry = afterFirst.membership.expiresAt.getTime();

    // Renew immediately (still active, well before expiry)
    const renewRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    expect(renewRes.status).toBe(201);
    await payOrder(accessToken, renewRes.body.data.order._id);

    const afterRenew = await User.findById(user._id);
    // ~60 days from the ORIGINAL start, not just ~30 days from renewal time
    expect(afterRenew.membership.expiresAt.getTime()).toBeGreaterThan(firstExpiry + 25 * 86400000);
  });

  it('a legacy record (active status, no expiresAt) is NOT treated as permanently active — the old grandfather rule is retired', async () => {
    const User = mongoose.model('User');
    const { accessToken, user } = await registerAndLogin();
    await User.findByIdAndUpdate(user._id, {
      $set: { 'membership.status': 'active', 'membership.joinedAt': new Date() },
      // expiresAt intentionally left unset — simulates a pre-existing local
      // dev record created before the plan/expiresAt fields existed. A real
      // membership always requires a real expiresAt now — see
      // isMembershipActive on the User model and
      // server/scripts/normalizeLegacyMembership.js for the local/dev
      // normalization path for records in this exact shape.
    });

    const { isMembershipActive } = require('../server/models/User');
    const fresh = await User.findById(user._id);
    expect(isMembershipActive(fresh.membership)).toBe(false);

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.data.user.membership.status).toBe('expired');
  });

  it('normalizeLegacyMembership grants a real calendar-dated annual term to a legacy no-expiresAt record', async () => {
    const User = mongoose.model('User');
    const { user } = await registerAndLogin();
    const joinedAt = new Date('2026-02-01T00:00:00.000Z');
    await User.findByIdAndUpdate(user._id, {
      $set: { 'membership.status': 'active', 'membership.joinedAt': joinedAt },
    });

    const normalizeLegacyMembership = require('../server/scripts/normalizeLegacyMembership');
    const results = await normalizeLegacyMembership({ dryRun: false, verbose: false });
    expect(results.some(r => String(r.email) === String(user.email))).toBe(true);

    const { isMembershipActive } = require('../server/models/User');
    const fresh = await User.findById(user._id);
    expect(fresh.membership.plan).toBe('annual');
    expect(fresh.membership.startedAt.toISOString()).toBe(joinedAt.toISOString());
    expect(fresh.membership.expiresAt.toISOString()).toBe(new Date('2027-02-01T00:00:00.000Z').toISOString());
    expect(isMembershipActive(fresh.membership)).toBe(true);

    // Idempotent — a second run touches nothing further for this user.
    const second = await normalizeLegacyMembership({ dryRun: false, verbose: false });
    expect(second.some(r => String(r.email) === String(user.email))).toBe(false);
  });
});

// ── Auto-renew cancellation semantics (state-only — no real recurring billing
// exists yet; see the Club/VIP recurring-billing audit report) ────────────────
describe('POST /membership/cancel — cancel-at-period-end (Netflix-style, not immediate)', () => {
  it('a real purchase defaults to autoRenew:true, cancelAtPeriodEnd:false', async () => {
    const { accessToken, user } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const User = mongoose.model('User');
    const fresh = await User.findById(user._id);
    expect(fresh.membership.autoRenew).toBe(true);
    expect(fresh.membership.cancelAtPeriodEnd).toBe(false);
    expect(fresh.membership.cancelledAt).toBeNull();
  });

  it('cancelling disables autoRenew and sets cancelAtPeriodEnd, but does NOT change expiresAt or deactivate the member', async () => {
    const { accessToken, user } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const User = mongoose.model('User');
    const before = await User.findById(user._id);
    const expiresAtBefore = before.membership.expiresAt.toISOString();

    const cancelRes = await request(app).post(`${MEMBERSHIP}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(cancelRes.status).toBe(200);

    const after = await User.findById(user._id);
    expect(after.membership.autoRenew).toBe(false);
    expect(after.membership.cancelAtPeriodEnd).toBe(true);
    expect(after.membership.cancelledAt).not.toBeNull();
    expect(after.membership.expiresAt.toISOString()).toBe(expiresAtBefore); // untouched
    expect(after.membership.status).toBe('active'); // still active — VIP benefits continue

    const { isMembershipActive } = require('../server/models/User');
    expect(isMembershipActive(after.membership)).toBe(true);
  });

  it('is idempotent — cancelling twice keeps the original cancelledAt timestamp', async () => {
    const { accessToken, user } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    await request(app).post(`${MEMBERSHIP}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    const User = mongoose.model('User');
    const firstCancelledAt = (await User.findById(user._id)).membership.cancelledAt.toISOString();

    await new Promise(r => setTimeout(r, 10));
    const second = await request(app).post(`${MEMBERSHIP}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(second.status).toBe(200);
    const secondCancelledAt = (await User.findById(user._id)).membership.cancelledAt.toISOString();
    expect(secondCancelledAt).toBe(firstCancelledAt);
  });

  it('rejects cancellation for a user with no active membership', async () => {
    const { accessToken } = await registerAndLogin(); // never purchased
    const res = await request(app).post(`${MEMBERSHIP}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('rejects cancellation for an already-expired membership', async () => {
    const { accessToken, user } = await registerAndLogin();
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'membership.status': 'active', 'membership.plan': 'monthly',
        'membership.expiresAt': new Date(Date.now() - 86400000), // yesterday
      },
    });
    const res = await request(app).post(`${MEMBERSHIP}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('a fresh renewal purchase after cancellation resets autoRenew:true and clears cancelAtPeriodEnd', async () => {
    const { accessToken, user } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);
    await request(app).post(`${MEMBERSHIP}/cancel`).set('Authorization', `Bearer ${accessToken}`);

    const User = mongoose.model('User');
    expect((await User.findById(user._id)).membership.cancelAtPeriodEnd).toBe(true);

    // Customer decides to renew again before expiry — a fresh real purchase
    // represents a new opt-in under the target auto-renew model.
    const renewRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'monthly' });
    await payOrder(accessToken, renewRes.body.data.order._id);

    const fresh = await User.findById(user._id);
    expect(fresh.membership.autoRenew).toBe(true);
    expect(fresh.membership.cancelAtPeriodEnd).toBe(false);
    expect(fresh.membership.cancelledAt).toBeNull();
  });

  it('membership.providerCustomerId/providerSubscriptionId stay null — no real Stripe Customer/Subscription is ever created by this flow', async () => {
    const { accessToken, user } = await registerAndLogin();
    const checkoutRes = await request(app)
      .post(`${MEMBERSHIP}/checkout`).set('Authorization', `Bearer ${accessToken}`).send({ plan: 'annual' });
    await payOrder(accessToken, checkoutRes.body.data.order._id);

    const User = mongoose.model('User');
    const fresh = await User.findById(user._id);
    expect(fresh.membership.providerCustomerId).toBeNull();
    expect(fresh.membership.providerSubscriptionId).toBeNull();
  });
});
