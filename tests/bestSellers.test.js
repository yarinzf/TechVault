'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const PUBLIC_BASE = '/api/v1/products/best-sellers';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Order').createIndexes();
  await mongoose.model('Category').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    description: 'A real product used for best-sellers testing',
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
    role: 'user',
    isActive: true,
  });
}

let orderCounter = 0;
// Creates a real Order document directly (bypassing the checkout API) so
// each test can precisely control status/paymentStatus/item quantities.
async function seedOrder({ user, items, status = 'confirmed', paymentStatus = 'paid' }) {
  const Order = mongoose.model('Order');
  orderCounter += 1;
  const orderItems = items.map((it) => ({
    itemType:   it.itemType ?? 'product',
    product:    it.itemType === 'membership' ? undefined : it.product,
    name:       it.name ?? 'Item',
    sku:        it.sku ?? 'SKU-' + orderCounter,
    unitPrice:  it.unitPrice ?? 10,
    quantity:   it.quantity,
    totalPrice: (it.unitPrice ?? 10) * it.quantity,
    metadata:   it.itemType === 'membership' ? { membershipType: 'lifetime' } : undefined,
  }));
  const subtotal = orderItems.reduce((s, it) => s + it.totalPrice, 0);

  const hasPhysical = orderItems.some((it) => it.itemType !== 'membership');

  return Order.create({
    orderNumber: 'TEST-ORD-' + orderCounter + '-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    user: user._id,
    items: orderItems,
    shippingAddress: hasPhysical ? { street: '1 Test St', city: 'Testville', zip: '12345', country: 'Israel' } : undefined,
    subtotal,
    taxAmount: 0,
    shippingCost: 0,
    total: subtotal,
    status,
    paymentStatus,
  });
}

// ── Aggregation correctness ─────────────────────────────────────────────────

describe('GET /api/v1/products/best-sellers — real sales aggregation', () => {
  test('quantity is aggregated across multiple orders for the same product', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Aggregated Product' });
    // Order A: 3 units, Order B: 2 units -> total 5, matching the task's own example
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 3 }] });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 2 }] });

    const res = await request(app).get(PUBLIC_BASE);
    expect(res.status).toBe(200);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeDefined();
    expect(found.unitsSold).toBe(5);
  });

  test('ranking uses quantity sold, not number of orders — one big order can outrank many small ones', async () => {
    const buyer = await seedUser();
    const bigQty   = await seedProduct({ name: 'One Big Order' });
    const manyOrders = await seedProduct({ name: 'Many Small Orders' });

    // One order of 10 units
    await seedOrder({ user: buyer, items: [{ product: bigQty._id, quantity: 10 }] });
    // Three separate orders of 1 unit each (more orders, fewer total units)
    await seedOrder({ user: buyer, items: [{ product: manyOrders._id, quantity: 1 }] });
    await seedOrder({ user: buyer, items: [{ product: manyOrders._id, quantity: 1 }] });
    await seedOrder({ user: buyer, items: [{ product: manyOrders._id, quantity: 1 }] });

    const res = await request(app).get(PUBLIC_BASE);
    const ranks = res.body.data.products.map((p) => p.name);
    expect(ranks.indexOf('One Big Order')).toBeLessThan(ranks.indexOf('Many Small Orders'));
    const big = res.body.data.products.find((p) => p.name === 'One Big Order');
    const many = res.body.data.products.find((p) => p.name === 'Many Small Orders');
    expect(big.unitsSold).toBe(10);
    expect(many.unitsSold).toBe(3);
  });

  test('a cancelled order does not count toward sales', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Cancelled Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 7 }], status: 'cancelled', paymentStatus: 'refunded' });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeUndefined();
  });

  test('a refunded order does not count toward sales', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Refunded Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 4 }], status: 'refunded', paymentStatus: 'refunded' });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeUndefined();
  });

  test('an unpaid (pending_payment / unpaid) order does not count toward sales', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Unpaid Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 5 }], status: 'pending_payment', paymentStatus: 'unpaid' });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeUndefined();
  });

  test('a failed-payment order does not count toward sales', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Failed Payment Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 6 }], status: 'pending', paymentStatus: 'failed' });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeUndefined();
  });

  test('a real paid order in "pending" status (post-payment, pre-fulfillment) still counts', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Just Paid Product' });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 2 }], status: 'pending', paymentStatus: 'paid' });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeDefined();
    expect(found.unitsSold).toBe(2);
  });

  test('a membership line item is never mistaken for a product sale', async () => {
    const buyer = await seedUser();
    await seedOrder({ user: buyer, items: [{ itemType: 'membership', quantity: 1, name: 'TechVault Club', unitPrice: 50 }] });

    const res = await request(app).get(PUBLIC_BASE);
    expect(res.body.data.products).toEqual([]);
  });

  test('ranking is sorted descending by units sold', async () => {
    const buyer = await seedUser();
    const low  = await seedProduct({ name: 'Low Seller' });
    const mid  = await seedProduct({ name: 'Mid Seller' });
    const high = await seedProduct({ name: 'High Seller' });
    await seedOrder({ user: buyer, items: [{ product: low._id,  quantity: 2 }] });
    await seedOrder({ user: buyer, items: [{ product: mid._id,  quantity: 5 }] });
    await seedOrder({ user: buyer, items: [{ product: high._id, quantity: 9 }] });

    const res = await request(app).get(PUBLIC_BASE);
    const names = res.body.data.products.map((p) => p.name);
    expect(names).toEqual(['High Seller', 'Mid Seller', 'Low Seller']);
    expect(res.body.data.products.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  test('limit=5 caps the response even with more real sellers available', async () => {
    const buyer = await seedUser();
    for (let i = 0; i < 8; i++) {
      const p = await seedProduct({ name: `Seller ${i}` });
      await seedOrder({ user: buyer, items: [{ product: p._id, quantity: 10 - i }] });
    }

    const res = await request(app).get(`${PUBLIC_BASE}?limit=5`);
    expect(res.body.data.products).toHaveLength(5);
    expect(res.body.data.products[0].name).toBe('Seller 0');
  });

  test('a tie in units sold is broken deterministically (same order across repeated calls)', async () => {
    const buyer = await seedUser();
    const p1 = await seedProduct({ name: 'Tie Product A' });
    const p2 = await seedProduct({ name: 'Tie Product B' });
    await seedOrder({ user: buyer, items: [{ product: p1._id, quantity: 3 }] });
    await seedOrder({ user: buyer, items: [{ product: p2._id, quantity: 3 }] });

    const res1 = await request(app).get(PUBLIC_BASE);
    const res2 = await request(app).get(PUBLIC_BASE);
    const order1 = res1.body.data.products.map((p) => p._id);
    const order2 = res2.body.data.products.map((p) => p._id);
    expect(order1).toEqual(order2); // same tie-break every time
  });

  test('an unpublished product is excluded from the public response even if it has real sales', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Unpublished Seller', isPublished: false });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 20 }] });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeUndefined();
  });

  test('a deleted product is excluded from the public response even if it has real sales', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'Deleted Seller', isDeleted: true });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 20 }] });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found).toBeUndefined();
  });

  test('active Campaign pricing enriches a best-selling product exactly like elsewhere', async () => {
    const Campaign = mongoose.model('Campaign');
    const buyer   = await seedUser();
    const product = await seedProduct({ name: 'Discounted Seller', price: 200 });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 3 }] });

    const now = new Date();
    await Campaign.create({
      name: 'Test Campaign', discountPercent: 25, isActive: true,
      startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000),
      products: [product._id], placement: 'none',
    });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found.discountPercent).toBe(25);
    expect(found.discountedPrice).toBe(150); // 200 * (1 - 25/100)
  });

  test('a product with no active campaign has null discount fields', async () => {
    const buyer = await seedUser();
    const product = await seedProduct({ name: 'No Campaign Seller', price: 80 });
    await seedOrder({ user: buyer, items: [{ product: product._id, quantity: 1 }] });

    const res = await request(app).get(PUBLIC_BASE);
    const found = res.body.data.products.find((p) => p._id === String(product._id));
    expect(found.discountPercent).toBeNull();
    expect(found.discountedPrice).toBeNull();
  });

  test('no real sales anywhere returns a truthful empty array, never fake data', async () => {
    await seedProduct({ name: 'Never Purchased' }); // exists, but zero orders reference it
    const res = await request(app).get(PUBLIC_BASE);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
  });

  test('the single #1-ranked product is flagged, and a distinct category leader is flagged separately', async () => {
    const buyer = await seedUser();
    const catA = await seedCategory({ name: 'Category A' });
    const catB = await seedCategory({ name: 'Category B' });
    const overallTop = await seedProduct({ name: 'Overall Top', category: catA._id });
    const otherInA    = await seedProduct({ name: 'Second In A', category: catA._id });
    const leaderOfB   = await seedProduct({ name: 'Leader Of B', category: catB._id });

    await seedOrder({ user: buyer, items: [{ product: overallTop._id, quantity: 20 }] });
    await seedOrder({ user: buyer, items: [{ product: otherInA._id,   quantity: 5 }] });
    await seedOrder({ user: buyer, items: [{ product: leaderOfB._id,  quantity: 8 }] });

    const res = await request(app).get(PUBLIC_BASE);
    const products = res.body.data.products;
    const top = products.find((p) => p.name === 'Overall Top');
    const secondInA = products.find((p) => p.name === 'Second In A');
    const bLeader = products.find((p) => p.name === 'Leader Of B');

    expect(top.rank).toBe(1);
    expect(top.isCategoryLeader).toBe(true);   // #1 overall AND #1 in its own category
    expect(secondInA.isCategoryLeader).toBe(false); // outranked within its own category by "Overall Top"
    expect(bLeader.isCategoryLeader).toBe(true); // #1 within category B, despite not being #1 overall
  });

  test('is publicly accessible without authentication', async () => {
    const res = await request(app).get(PUBLIC_BASE);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
