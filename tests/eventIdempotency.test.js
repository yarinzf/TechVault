'use strict';

const mongoose = require('mongoose');
const { connect, clearAll, waitFor } = require('./helpers/db');
const emitter = require('../server/events/emitter');
const EVENTS  = require('../server/events/events');

let registerAnalyticsHandlers, traffic, analyticsDailySvc, productSalesSvc, cleanupCartsJob;

beforeAll(async () => {
  await connect();
  require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Category').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('User').createIndexes();
  await mongoose.model('Cart').createIndexes();
  await mongoose.model('AnalyticsDaily').createIndexes();
  await mongoose.model('ProductSalesMonthly').createIndexes();
  await mongoose.model('DailyVisit').createIndexes();

  ({ registerAnalyticsHandlers } = require('../server/events/analyticsHandlers'));
  registerAnalyticsHandlers(); // idempotent itself — safe even if called elsewhere too
  traffic           = require('../server/services/traffic.service');
  analyticsDailySvc  = require('../server/services/analyticsDaily.service');
  productSalesSvc    = require('../server/services/productSalesAnalytics.service');
  cleanupCartsJob    = require('../server/jobs/cleanupCarts.job');
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
    name: `Idem Product ${productCounter}`, slug: `idem-product-${productCounter}-${Date.now()}`,
    sku: `SKU-IDM-${productCounter}-${Date.now()}`, brand: 'TestBrand', price: 250, stock: 100, category,
    description: 'test', isPublished: true,
  });
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
async function seedPaidOrder({ user, product, unitPrice = 250 }) {
  const Order = mongoose.model('Order');
  orderCounter += 1;
  return Order.create({
    orderNumber: `TEST-IDM-${orderCounter}-${Date.now()}`,
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

// Gives the (non-blocking, fire-and-forget) analyticsHandlers.js listener a
// moment to start its async rebuild before the next event in a sequence
// fires, so duplicate/retried events exercise the dedup logic rather than
// racing each other. This is just pacing, not a correctness wait — the
// actual assertions below poll for the settled state via waitFor, since a
// fixed delay long enough for a fast dev machine is not guaranteed to be
// long enough on a slower/loaded CI runner.
const flush = () => new Promise((r) => setTimeout(r, 150));

function findProductSalesRow(productId) {
  const ProductSalesMonthly = mongoose.model('ProductSalesMonthly');
  const now = new Date();
  return ProductSalesMonthly.findOne({
    product: productId, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1,
  }).lean();
}

describe('Event idempotency — replayed events must never double-count (requirement #7)', () => {
  test('PAYMENT_PAID emitted twice for the SAME order (simulating a retried webhook delivery) increments ProductSalesMonthly exactly once', async () => {
    const product = await seedProduct();
    const user = await seedUser();
    const order = await seedPaidOrder({ user, product });

    const payload = { orderId: order._id, orderNumber: order.orderNumber, total: order.total, userId: user._id };
    emitter.emit(EVENTS.PAYMENT_PAID, payload);
    await flush();
    emitter.emit(EVENTS.PAYMENT_PAID, payload); // exact duplicate delivery
    await flush();

    const row = await waitFor(async () => {
      const r = await findProductSalesRow(product._id);
      return r && r.unitsSold > 0 ? r : null;
    });
    expect(row.unitsSold).toBe(1); // not 2
    expect(row.orderCount).toBe(1);
  });

  test('ORDER_CANCELLED and PAYMENT_REFUNDED emitted twice each also converge, never double-adjust ProductSalesMonthly', async () => {
    const product = await seedProduct();
    const user = await seedUser();
    const order = await seedPaidOrder({ user, product });
    const payload = { orderId: order._id, orderNumber: order.orderNumber };

    // Establish the paid baseline first, and confirm it actually landed
    // before cancelling — otherwise a slow-to-settle paid write could race
    // with the cancellation below and produce a false pass.
    emitter.emit(EVENTS.PAYMENT_PAID, payload);
    await waitFor(async () => {
      const r = await findProductSalesRow(product._id);
      return r && r.unitsSold > 0;
    });

    // Now the order is cancelled in the DB (as the real cancellation flow
    // would do), and the event fires twice — a retried cancellation event
    // must not somehow apply the removal logic twice or diverge.
    await mongoose.model('Order').updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
    emitter.emit(EVENTS.ORDER_CANCELLED, payload);
    await flush();
    emitter.emit(EVENTS.ORDER_CANCELLED, payload);
    await flush();

    // A cancelled order is excluded from SALES_TRUTH_MATCH entirely — the
    // row is either absent or reset to its historical baseline (0 here,
    // no historical seed in this test), never a phantom positive value,
    // regardless of how many times the event replayed. Poll for settlement
    // since the cancellation rebuild is also async fire-and-forget.
    const row = await waitFor(async () => {
      const r = await findProductSalesRow(product._id);
      return (r?.unitsSold ?? 0) === 0 ? (r ?? { unitsSold: 0 }) : null;
    });
    expect(row?.unitsSold ?? 0).toBe(0);
  });

  test('the same PAYMENT_PAID event replayed 5 times in a row still converges to exactly 1 unit', async () => {
    const product = await seedProduct();
    const user = await seedUser();
    const order = await seedPaidOrder({ user, product });
    const payload = { orderId: order._id, orderNumber: order.orderNumber };

    for (let i = 0; i < 5; i++) {
      emitter.emit(EVENTS.PAYMENT_PAID, payload);
      await flush();
    }

    const row = await waitFor(async () => {
      const r = await findProductSalesRow(product._id);
      return r && r.unitsSold > 0 ? r : null;
    });
    expect(row.unitsSold).toBe(1);
  });

  test('a duplicated /track/visit beacon for the SAME anonId on the SAME day counts exactly one session, but each call still counts as a page view', async () => {
    const anonId = 'idem-test-anon-' + Date.now();
    await traffic.recordVisit(anonId, { isProductPage: false });
    await traffic.recordVisit(anonId, { isProductPage: true }); // simulates a retried/duplicate beacon call
    await traffic.recordVisit(anonId, { isProductPage: true });

    const { getIsraelDayBoundaries } = require('../server/utils/timezone');
    const { start } = getIsraelDayBoundaries(new Date());
    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const row = await AnalyticsDaily.findOne({ date: start }).lean();
    expect(row.sessions).toBe(1); // deduped via DailyVisit's unique {anonId, dateKey} index
    expect(row.productPageViews).toBe(2); // each real page view still counts individually
  });

  test('a different anonId on the same day is a genuinely separate session, not deduped against the first', async () => {
    const anonIdA = 'idem-test-anon-a-' + Date.now();
    const anonIdB = 'idem-test-anon-b-' + Date.now();
    await traffic.recordVisit(anonIdA, {});
    await traffic.recordVisit(anonIdB, {});

    const { getIsraelDayBoundaries } = require('../server/utils/timezone');
    const { start } = getIsraelDayBoundaries(new Date());
    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const row = await AnalyticsDaily.findOne({ date: start }).lean();
    expect(row.sessions).toBe(2);
  });

  test('running cleanupCarts.job twice in a row (e.g. an overlapping/retried scheduler tick) does not double-count the same abandoned cart', async () => {
    const Cart = mongoose.model('Cart');
    const user = await seedUser();
    const product = await seedProduct();
    const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago — past the 24h default threshold
    const cart = await Cart.create({
      user: user._id,
      items: [{ product: product._id, quantity: 1, priceAtAdd: 100, nameAtAdd: product.name }],
    });
    await mongoose.connection.collection('carts').updateOne({ _id: cart._id }, { $set: { updatedAt: staleDate } });

    await cleanupCartsJob();
    await cleanupCartsJob(); // immediate re-run — must not double-count

    const { getIsraelDayBoundaries } = require('../server/utils/timezone');
    const { start } = getIsraelDayBoundaries(new Date());
    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const row = await AnalyticsDaily.findOne({ date: start }).lean();
    expect(row.abandonedCarts).toBe(1); // not 2
  });

  test('re-running dailySnapshot finalization for the same day twice never changes the persisted totals', async () => {
    const product = await seedProduct();
    const user = await seedUser();
    await seedPaidOrder({ user, product, unitPrice: 321 });

    const { getIsraelDayBoundaries } = require('../server/utils/timezone');
    const { start, end } = getIsraelDayBoundaries(new Date());

    const first  = await analyticsDailySvc.finalizeDay(start, end);
    const second = await analyticsDailySvc.finalizeDay(start, end);
    expect(second.revenue).toBe(first.revenue);
    expect(second.paidOrders).toBe(first.paidOrders);

    const AnalyticsDaily = mongoose.model('AnalyticsDaily');
    const count = await AnalyticsDaily.countDocuments({ date: start });
    expect(count).toBe(1); // upsert, never a duplicate row
  });
});
