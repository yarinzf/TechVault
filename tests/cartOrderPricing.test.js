'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH  = '/api/v1/auth';
const CART  = '/api/v1/cart';
const ORDER = '/api/v1/orders';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix) {
  const email = `cartprice-${suffix}@test.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: 'Cart Pricing Tester', email, password: 'Password123!',
  });
  return res.body.data.accessToken;
}

async function seedProduct(overrides = {}) {
  const Product  = mongoose.model('Product');
  const Category = mongoose.model('Category');

  const cat = await Category.findOneAndUpdate(
    { slug: 'monitors' },
    { $setOnInsert: { name: 'Monitors', slug: 'monitors', isActive: true } },
    { upsert: true, new: true }
  );

  return Product.create({
    name:        overrides.name        ?? 'Test Monitor',
    slug:        overrides.slug        ?? 'test-monitor-' + Date.now() + Math.random(),
    sku:         overrides.sku         ?? 'SKU-' + Date.now() + Math.random(),
    brand:       overrides.brand       ?? 'TestBrand',
    price:       overrides.price       ?? 1000,
    stock:       overrides.stock       ?? 10,
    category:    cat._id,
    description: 'A great monitor for testing',
    isPublished: true,
    isDeleted:   false,
    images:      ['https://example.com/img.jpg'],
    ...overrides,
  });
}

async function seedCampaign(overrides = {}) {
  const Campaign = mongoose.model('Campaign');
  const now = Date.now();
  return Campaign.create({
    name:            overrides.name ?? 'Test Campaign',
    discountPercent: overrides.discountPercent ?? 20,
    startDate:       overrides.startDate ?? new Date(now - 86400000),
    endDate:         overrides.endDate   ?? new Date(now + 86400000),
    isActive:        overrides.isActive ?? true,
    products:        overrides.products ?? [],
  });
}

const shippingAddress = { street: '123 Main St', city: 'Tel Aviv', zip: '61000', country: 'IL' };

// ── Cart reflects live campaign price ───────────────────────────────────────

describe('Cart pricing — campaign is the live source of truth', () => {
  it('addItem prices the item using the active campaign discount, not the base price', async () => {
    const token   = await registerAndLogin('add-discount');
    const product = await seedProduct({ price: 1000 });
    await seedCampaign({ discountPercent: 20, products: [product._id] });

    const res = await request(app)
      .post(`${CART}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    const item = res.body.data.cart.items[0];
    expect(item.priceAtAdd).toBe(800);
    expect(item.originalPriceAtAdd).toBe(1000);
  });

  it('GET /cart refreshes price after the campaign is deactivated', async () => {
    const token   = await registerAndLogin('refresh-deactivate');
    const product = await seedProduct({ price: 1000 });
    const campaign = await seedCampaign({ discountPercent: 20, products: [product._id] });

    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    await mongoose.model('Campaign').findByIdAndUpdate(campaign._id, { isActive: false });

    const res = await request(app).get(CART).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.cart.items[0].priceAtAdd).toBe(1000);
    expect(res.body.data.cart.items[0].originalPriceAtAdd).toBeNull();
  });

  it('GET /cart picks up a campaign that started after the item was added', async () => {
    const token   = await registerAndLogin('refresh-activate');
    const product = await seedProduct({ price: 1000 });

    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    await seedCampaign({ discountPercent: 30, products: [product._id] });

    const res = await request(app).get(CART).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.cart.items[0].priceAtAdd).toBe(700);
  });
});

// ── Order creation regression: never trust a stale cart snapshot ───────────

describe('Order creation — always resolves the current real server price', () => {
  it('a campaign that expires between "add to cart" and checkout does NOT carry a stale discount into the order', async () => {
    const token   = await registerAndLogin('order-stale-discount');
    const product = await seedProduct({ name: 'Order Regression Item', price: 1000, stock: 5 });
    const campaign = await seedCampaign({ discountPercent: 25, products: [product._id] });

    // Add while the campaign is active — cart snapshot is discounted.
    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    // Campaign is deactivated WITHOUT the client ever calling GET /cart again
    // (i.e. no chance for cart.service.js's live refresh to run) — this is
    // exactly the staleness window order creation must close on its own.
    await mongoose.model('Campaign').findByIdAndUpdate(campaign._id, { isActive: false });

    const res = await request(app)
      .post(ORDER)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress });

    expect(res.status).toBe(201);
    const item = res.body.data.order.items[0];
    expect(item.unitPrice).toBe(1000); // NOT the stale 750
    expect(res.body.data.order.subtotal).toBe(1000);
  });

  it('a campaign that starts between "add to cart" and checkout IS applied at order time', async () => {
    const token   = await registerAndLogin('order-fresh-discount');
    const product = await seedProduct({ name: 'Order Fresh Discount Item', price: 1000, stock: 5 });

    // Add with no campaign active — cart snapshot is full price.
    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    await seedCampaign({ discountPercent: 15, products: [product._id] });

    const res = await request(app)
      .post(ORDER)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress });

    expect(res.status).toBe(201);
    const item = res.body.data.order.items[0];
    expect(item.unitPrice).toBe(850); // 1000 * 0.85, NOT the stale 1000
  });

  it('compareAtPrice never affects the order price, with or without a campaign', async () => {
    const token   = await registerAndLogin('order-compareatprice');
    const product = await seedProduct({ name: 'Compare Price Order Item', price: 500, compareAtPrice: 900, stock: 5 });

    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    const res = await request(app)
      .post(ORDER)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress });

    expect(res.status).toBe(201);
    expect(res.body.data.order.items[0].unitPrice).toBe(500);
  });

  it('overlapping campaigns at order time resolve using the highest-discount rule', async () => {
    const token   = await registerAndLogin('order-overlap');
    const product = await seedProduct({ name: 'Overlap Order Item', price: 1000, stock: 5 });
    await seedCampaign({ discountPercent: 10, products: [product._id] });
    await seedCampaign({ discountPercent: 40, products: [product._id] });

    await request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    const res = await request(app)
      .post(ORDER)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress });

    expect(res.status).toBe(201);
    expect(res.body.data.order.items[0].unitPrice).toBe(600); // 1000 * (1 - 40/100)
  });
});
