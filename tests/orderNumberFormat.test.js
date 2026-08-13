'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
let generateOrderNumber;
const AUTH   = '/api/v1/auth';
const ORDERS = '/api/v1/orders';
const CART   = '/api/v1/cart';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  ({ generateOrderNumber } = require('../server/services/order.service'));
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Order').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _seq = 0;

async function registerAndLogin(overrides = {}) {
  _seq += 1;
  const email = overrides.email ?? `ordnum-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'Order Number Test User',
    email,
    password: 'Password123!',
  });
  return { user: res.body.data.user, accessToken: res.body.data.accessToken };
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
    // Product.js regenerates `slug` from `name` on save (slugify) regardless
    // of what's passed — name must be unique per call, not just slug/sku.
    name:        overrides.name ?? `Order Number Test Monitor ${unique}`,
    slug:        overrides.slug ?? `ordnum-test-monitor-${unique}`,
    sku:         overrides.sku  ?? `SKU-ORDNUM-${unique}`,
    brand:       'TestBrand',
    price:       overrides.price ?? 100,
    stock:       overrides.stock ?? 50,
    category:    cat._id,
    description: 'A great monitor for order-number format testing',
    isPublished: true,
    isDeleted:   false,
    images:      [],
    ...overrides,
  });
}

async function buyOne() {
  const product = await seedProduct();
  const { accessToken } = await registerAndLogin();
  await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${accessToken}`).send({ productId: product._id, quantity: 1 });
  return request(app).post(ORDERS).set('Authorization', `Bearer ${accessToken}`).send({
    shippingMethod: 'store_pickup',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Order number prefix — "TV" (TechVault) for new orders, "ORD-..." history
// left completely alone.
// ══════════════════════════════════════════════════════════════════════════
describe('Order number generation — TV prefix for new orders', () => {

  it('generateOrderNumber() itself now produces a "TV-" prefixed identifier', async () => {
    const num = await generateOrderNumber();
    expect(num).toMatch(/^TV-\d{8}-[0-9A-F]{8}$/);
  });

  it('a real order created through the API (POST /orders) gets a "TV-" order number', async () => {
    const res = await buyOne();
    expect(res.status).toBe(201);
    expect(res.body.data.order.orderNumber).toMatch(/^TV-/);
  });

  it('never produces the old "ORD-" prefix for a newly generated number', async () => {
    const num = await generateOrderNumber();
    expect(num.startsWith('ORD-')).toBe(false);
  });

  it('two newly created orders still receive distinct, unique order numbers', async () => {
    const [numA, numB] = await Promise.all([generateOrderNumber(), generateOrderNumber()]);
    expect(numA).not.toBe(numB);

    const resA = await buyOne();
    const resB = await buyOne();
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.data.order.orderNumber).not.toBe(resB.body.data.order.orderNumber);
  });

  it('orderNumber remains globally unique at the database level (existing unique index still enforced)', async () => {
    const Order = mongoose.model('Order');
    const indexes = await Order.collection.indexes();
    const orderNumberIndex = indexes.find((ix) => Object.keys(ix.key).includes('orderNumber'));
    expect(orderNumberIndex).toBeTruthy();
    expect(orderNumberIndex.unique).toBe(true);
  });

  it('a historical order with the old "ORD-..." format still loads, saves, and round-trips through the API unmodified — never rewritten to "TV-"', async () => {
    const Order = mongoose.model('Order');
    const { user, accessToken } = await registerAndLogin();
    const product = await seedProduct({ price: 100 });

    const legacyOrder = await Order.create({
      orderNumber: `ORD-20240101-LEGACY1`,
      user: user._id,
      items: [{
        itemType: 'product', product: product._id, name: product.name, sku: product.sku,
        unitPrice: 100, quantity: 1, totalPrice: 100,
      }],
      shippingAddress: { street: '1 Legacy St', city: 'Tel Aviv', country: 'Israel' },
      subtotal: 100, taxAmount: 0, shippingCost: 0, total: 100,
      status: 'confirmed', paymentStatus: 'paid',
    });
    expect(legacyOrder.orderNumber).toBe('ORD-20240101-LEGACY1');

    // save() (e.g. via any status-changing service call) must not touch it
    legacyOrder.notes = 'touched';
    await legacyOrder.save();
    expect(legacyOrder.orderNumber).toBe('ORD-20240101-LEGACY1');

    // GET /orders/:id — the customer-facing read path — returns it verbatim,
    // no forced prefix rewrite to "TV-".
    const getRes = await request(app).get(`${ORDERS}/${legacyOrder._id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.order.orderNumber).toBe('ORD-20240101-LEGACY1');
  });

  it('Mongo _id is a real ObjectId, independent of and untouched by the orderNumber prefix change', async () => {
    const res = await buyOne();
    expect(res.status).toBe(201);
    expect(mongoose.isValidObjectId(res.body.data.order._id)).toBe(true);
  });
});
