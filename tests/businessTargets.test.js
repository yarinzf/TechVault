'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll, waitFor } = require('./helpers/db');
const { getIsraelDayBoundaries } = require('../server/utils/timezone');
const { generateAccessToken } = require('../server/utils/jwt');
const targetService = require('../server/services/businessTarget.service');
const { computeLiveDayStats } = require('../server/services/analyticsDaily.service');

let app;
const TARGETS_BASE = '/api/v1/admin/targets';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Order').createIndexes();
  await mongoose.model('User').createIndexes();
  await mongoose.model('Category').createIndexes();
  await mongoose.model('Product').createIndexes();
  await mongoose.model('BusinessTarget').createIndexes();
  await mongoose.model('AuditLog').createIndexes();
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
    name: `Test Product ${productCounter}`,
    slug: `tp-${productCounter}-${Date.now()}`,
    sku: `SKU-${productCounter}-${Date.now()}`,
    price: 100, stock: 50, category,
    description: 'test', isPublished: true,
  });
}

let userCounter = 0;
async function seedUser() {
  const User = mongoose.model('User');
  userCounter += 1;
  return User.create({
    name: `Buyer ${userCounter}`,
    email: `buyer-${userCounter}-${Date.now()}@test.local`,
    password: 'TestPassword123', role: 'user', isActive: true,
  });
}

let orderCounter = 0;
async function seedPaidOrder({ user, product, unitPrice = 100, createdAt }) {
  const Order = mongoose.model('Order');
  orderCounter += 1;
  const order = await Order.create({
    orderNumber: `TEST-ORD-${orderCounter}-${Date.now()}`,
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

describe('Israel timezone day-boundary correctness (requirement #22)', () => {
  test('a payment at 00:15 Israel time (summer, UTC+3) belongs to the correct Israeli calendar date, not the previous UTC date', async () => {
    const user = await seedUser();
    const product = await seedProduct();
    // 2026-08-22 00:15 Israel time == 2026-08-21 21:15 UTC (UTC+3 in August).
    const paymentInstant = new Date('2026-08-21T21:15:00.000Z');
    await seedPaidOrder({ user, product, unitPrice: 250, createdAt: paymentInstant });

    const { start: aug22Start, end: aug22End } = getIsraelDayBoundaries(new Date('2026-08-22T10:00:00Z'));
    const aug22Stats = await computeLiveDayStats(aug22Start, aug22End);
    expect(aug22Stats.revenue).toBe(250); // counted on Aug 22 Israel time

    const { start: aug21Start, end: aug21End } = getIsraelDayBoundaries(new Date('2026-08-21T10:00:00Z'));
    const aug21Stats = await computeLiveDayStats(aug21Start, aug21End);
    expect(aug21Stats.revenue).toBe(0); // NOT counted on Aug 21, even though 21:15 UTC is still "Aug 21" in UTC terms
  });

  test('a payment at 23:50 Israel time (winter, UTC+2) still belongs to that same Israeli calendar date', async () => {
    const user = await seedUser();
    const product = await seedProduct();
    // 2026-01-15 23:50 Israel time == 2026-01-15 21:50 UTC (UTC+2 in January).
    const paymentInstant = new Date('2026-01-15T21:50:00.000Z');
    await seedPaidOrder({ user, product, unitPrice: 180, createdAt: paymentInstant });

    const { start, end } = getIsraelDayBoundaries(new Date('2026-01-15T10:00:00Z'));
    const stats = await computeLiveDayStats(start, end);
    expect(stats.revenue).toBe(180);
  });
});

describe('Business targets — persisted, independent actual computation (requirement #2/#17)', () => {
  test('a target set via upsertTarget for a future day is queryable and independent of actual performance', async () => {
    const futureDay = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const target = await targetService.upsertTarget(
      { metric: 'daily_revenue', periodType: 'day', periodStart: futureDay, targetValue: 38000 },
      new mongoose.Types.ObjectId()
    );
    expect(target.targetValue).toBe(38000);
    expect(target.source).toBe('admin_set');

    const progress = await targetService.getTargetProgress('daily_revenue', 'day', target.periodStart);
    expect(progress.target).toBe(38000);
    expect(progress.actual).toBe(0); // no orders yet — target and actual are independent
    expect(progress.progressPercent).toBe(0);
  });

  test('target progress recalculates automatically as real paid orders accumulate — target itself never changes (matches the Aug 22 example exactly)', async () => {
    const user = await seedUser();
    const product = await seedProduct();
    const today = new Date();
    const { start: todayStart } = getIsraelDayBoundaries(today);

    await targetService.upsertTarget(
      { metric: 'daily_revenue', periodType: 'day', periodStart: todayStart, targetValue: 38000 },
      new mongoose.Types.ObjectId()
    );

    await seedPaidOrder({ user, product, unitPrice: 24700 });
    let progress = await targetService.getTargetProgress('daily_revenue', 'day', todayStart);
    expect(progress.target).toBe(38000);
    expect(progress.actual).toBe(24700);
    expect(progress.progressPercent).toBeCloseTo(65.0, 0);

    // A new paid order arrives — target remains ₪38,000, actual recalculates.
    await seedPaidOrder({ user, product, unitPrice: 1800 });
    progress = await targetService.getTargetProgress('daily_revenue', 'day', todayStart);
    expect(progress.target).toBe(38000); // unchanged
    expect(progress.actual).toBe(26500); // 24700 + 1800
  });

  test('cannot create or edit a target for a period that has already closed', async () => {
    const pastDay = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await expect(
      targetService.upsertTarget(
        { metric: 'daily_revenue', periodType: 'day', periodStart: pastDay, targetValue: 10000 },
        new mongoose.Types.ObjectId()
      )
    ).rejects.toThrow(/already closed/);
  });

  test('a target with no actual data yet returns actual: 0, not a fabricated or crashing value', async () => {
    const futureDay = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const progress = await targetService.getTargetProgress('daily_orders', 'day', futureDay);
    expect(progress.target).toBeNull(); // no target set at all
    expect(progress.actual).toBe(0);
    expect(progress.progressPercent).toBeNull(); // never a fabricated percentage against nothing
  });
});

// ── API-level: RBAC enforcement + audit logging (requirement #3) ──────────

let apiUserCounter = 0;
async function seedUserForApi(role) {
  const User = mongoose.model('User');
  apiUserCounter += 1;
  const user = await User.create({
    name: `${role} ${apiUserCounter}`, email: `${role}-${apiUserCounter}-${Date.now()}@test.local`,
    password: 'TestPassword123', role, isActive: true,
  });
  return { user, token: generateAccessToken({ id: user._id.toString() }) };
}

describe('POST/GET /admin/targets — RBAC + audit (requirement #3)', () => {
  test('unauthenticated requests are rejected', async () => {
    const getRes = await request(app).get(`${TARGETS_BASE}/goals`);
    expect([401, 403]).toContain(getRes.status);
    const postRes = await request(app).post(TARGETS_BASE).send({});
    expect([401, 403]).toContain(postRes.status);
  });

  test('a plain customer (role: user) is rejected', async () => {
    const { token } = await seedUserForApi('user');
    const res = await request(app).get(`${TARGETS_BASE}/goals`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('warehouse role is rejected — target management is business-analytics scoped (ADMIN_ROLES), not fulfillment', async () => {
    const { token } = await seedUserForApi('warehouse');
    const res = await request(app).post(TARGETS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ metric: 'daily_revenue', periodType: 'day', periodStart: new Date().toISOString(), targetValue: 10000 });
    expect(res.status).toBe(403);
  });

  test('admin can set a target via the real API, and it is recorded in the audit log', async () => {
    const { user: admin, token } = await seedUserForApi('admin');
    const res = await request(app).post(TARGETS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ metric: 'daily_revenue', periodType: 'day', periodStart: new Date().toISOString(), targetValue: 42000 });

    expect(res.status).toBe(200);
    expect(res.body.data.target.targetValue).toBe(42000);

    // audit.log() is intentionally fire-and-forget (non-fatal logging, same
    // convention as settings.service.js/campaign.controller.js) — poll for
    // its write to land rather than trusting a fixed delay, since a delay
    // long enough on a fast dev machine is not guaranteed to be long enough
    // on a slower/loaded CI runner.
    const AuditLog = mongoose.model('AuditLog');
    const entry = await waitFor(() =>
      AuditLog.findOne({ action: 'business_target.set', actorId: admin._id }).lean()
    );
    expect(entry).toBeTruthy();
    expect(entry.after.targetValue).toBe(42000);
  });

  test('superadmin can also set targets (ADMIN_ROLES includes superadmin)', async () => {
    const { token } = await seedUserForApi('superadmin');
    const res = await request(app).post(TARGETS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ metric: 'monthly_orders', periodType: 'month', periodStart: new Date().toISOString(), targetValue: 500 });
    expect(res.status).toBe(200);
  });

  test('GET /admin/targets/goals returns real progress via the real HTTP route (admin)', async () => {
    const { token } = await seedUserForApi('admin');
    const res = await request(app).get(`${TARGETS_BASE}/goals`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.daily)).toBe(true);
    expect(Array.isArray(res.body.data.monthly)).toBe(true);
  });

  test('the real API rejects setting a target for an already-closed period, matching the service-layer guard', async () => {
    const { token } = await seedUserForApi('admin');
    const pastDay = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app).post(TARGETS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ metric: 'daily_revenue', periodType: 'day', periodStart: pastDay, targetValue: 10000 });
    expect(res.status).toBe(409);
  });
});
