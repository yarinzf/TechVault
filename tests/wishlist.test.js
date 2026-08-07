'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const BASE = '/api/v1/wishlist';
const AUTH = '/api/v1/auth';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(emailSuffix) {
  const email = `wishlist-${emailSuffix}@test.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: 'Wishlist Tester', email, password: 'Password123!',
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
    price:       overrides.price       ?? 999,
    stock:       overrides.stock       ?? 5,
    category:    cat._id,
    description: 'A great monitor for testing',
    isPublished: overrides.isPublished ?? true,
    isDeleted:   overrides.isDeleted   ?? false,
    images:      ['https://example.com/img.jpg'],
    ...overrides,
  });
}

async function seedActiveCampaign(productId, discountPercent = 20) {
  const Campaign = mongoose.model('Campaign');
  return Campaign.create({
    name: 'Test Campaign',
    discountPercent,
    startDate: new Date(Date.now() - 86400000),
    endDate:   new Date(Date.now() + 86400000),
    isActive: true,
    products: [productId],
  });
}

// ── Auth protection ──────────────────────────────────────────────────────────

describe('Wishlist — authentication', () => {
  it('rejects unauthenticated GET /wishlist', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated add/remove/clear', async () => {
    const product = await seedProduct();
    expect((await request(app).post(`${BASE}/${product._id}`)).status).toBe(401);
    expect((await request(app).delete(`${BASE}/${product._id}`)).status).toBe(401);
    expect((await request(app).delete(BASE)).status).toBe(401);
  });
});

// ── Add / duplicate / remove ─────────────────────────────────────────────────

describe('Wishlist — add / remove', () => {
  it('adds a valid product to the wishlist', async () => {
    const token   = await registerAndLogin('add');
    const product = await seedProduct({ name: 'Adder Monitor' });

    const res = await request(app)
      .post(`${BASE}/${product._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.wishlist.products).toHaveLength(1);
    expect(res.body.data.wishlist.products[0]._id).toBe(String(product._id));
  });

  it('does not create duplicate entries when adding the same product twice', async () => {
    const token   = await registerAndLogin('dup');
    const product = await seedProduct({ name: 'Dup Monitor' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.wishlist.products).toHaveLength(1);
  });

  it('rejects adding a nonexistent product', async () => {
    const token = await registerAndLogin('addmissing');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app).post(`${BASE}/${fakeId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('removes a product from the wishlist', async () => {
    const token   = await registerAndLogin('remove');
    const product = await seedProduct({ name: 'Remover Monitor' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).delete(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.wishlist.products).toHaveLength(0);
  });
});

// ── Clear all ─────────────────────────────────────────────────────────────────

describe('Wishlist — clear all', () => {
  it('clears every product from the authenticated user\'s wishlist', async () => {
    const token = await registerAndLogin('clear');
    const p1 = await seedProduct({ name: 'Clear Monitor 1' });
    const p2 = await seedProduct({ name: 'Clear Monitor 2' });

    await request(app).post(`${BASE}/${p1._id}`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`${BASE}/${p2._id}`).set('Authorization', `Bearer ${token}`);

    const clearRes = await request(app).delete(BASE).set('Authorization', `Bearer ${token}`);
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.wishlist.products).toHaveLength(0);

    const getRes = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.data.wishlist.products).toHaveLength(0);
  });
});

// ── Cross-user isolation ─────────────────────────────────────────────────────

describe('Wishlist — user isolation', () => {
  it('does not let one user\'s wishlist affect another user\'s', async () => {
    const tokenA = await registerAndLogin('userA');
    const tokenB = await registerAndLogin('userB');
    const product = await seedProduct({ name: 'Shared Monitor' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${tokenA}`);

    const resA = await request(app).get(BASE).set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app).get(BASE).set('Authorization', `Bearer ${tokenB}`);

    expect(resA.body.data.wishlist.products).toHaveLength(1);
    expect(resB.body.data.wishlist.products).toHaveLength(0);
  });

  it('clearing one user\'s wishlist does not affect another user\'s', async () => {
    const tokenA = await registerAndLogin('clearA');
    const tokenB = await registerAndLogin('clearB');
    const product = await seedProduct({ name: 'Isolation Monitor' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${tokenA}`);
    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${tokenB}`);

    await request(app).delete(BASE).set('Authorization', `Bearer ${tokenA}`);

    const resB = await request(app).get(BASE).set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data.wishlist.products).toHaveLength(1);
  });
});

// ── Deleted / unpublished product handling ───────────────────────────────────

describe('Wishlist — stale product handling', () => {
  it('omits a product that was soft-deleted after being added', async () => {
    const token   = await registerAndLogin('staledeleted');
    const product = await seedProduct({ name: 'Soon Deleted Monitor' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);

    await mongoose.model('Product').updateOne({ _id: product._id }, { isDeleted: true });

    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.wishlist.products).toHaveLength(0);
  });

  it('omits a product that was unpublished after being added', async () => {
    const token   = await registerAndLogin('staleunpub');
    const product = await seedProduct({ name: 'Soon Unpublished Monitor' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);

    await mongoose.model('Product').updateOne({ _id: product._id }, { isPublished: false });

    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.wishlist.products).toHaveLength(0);
  });
});

// ── Populated product data / discount enrichment ─────────────────────────────

describe('Wishlist — populated product data', () => {
  it('returns usable populated product fields', async () => {
    const token   = await registerAndLogin('populate');
    const product = await seedProduct({ name: 'Populated Monitor', price: 1500, brand: 'ASUS' });

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);

    const [returned] = res.body.data.wishlist.products;
    expect(returned.name).toBe('Populated Monitor');
    expect(returned.brand).toBe('ASUS');
    expect(returned.price).toBe(1500);
    expect(returned.slug).toBeDefined();
  });

  it('attaches live campaign discountedPrice/discountPercent to wishlist products', async () => {
    const token   = await registerAndLogin('discount');
    const product = await seedProduct({ name: 'Discounted Monitor', price: 1000 });
    await seedActiveCampaign(product._id, 25);

    await request(app).post(`${BASE}/${product._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);

    const [returned] = res.body.data.wishlist.products;
    expect(returned.discountPercent).toBe(25);
    expect(returned.discountedPrice).toBe(750);
  });
});
