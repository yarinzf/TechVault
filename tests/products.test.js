'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const BASE = '/api/v1/products';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedProduct(overrides = {}) {
  const Product  = mongoose.model('Product');
  const Category = mongoose.model('Category');

  const cat = await Category.findOneAndUpdate(
    { slug: 'keyboards' },
    { $setOnInsert: { name: 'Keyboards', slug: 'keyboards', isActive: true } },
    { upsert: true, new: true }
  );

  return Product.create({
    name:        overrides.name        ?? 'Test Keyboard',
    slug:        overrides.slug        ?? 'test-keyboard-' + Date.now(),
    sku:         overrides.sku         ?? 'SKU-' + Date.now(),
    brand:       overrides.brand       ?? 'TestBrand',
    price:       overrides.price       ?? 299,
    stock:       overrides.stock       ?? 10,
    category:    cat._id,
    description: 'A great keyboard for testing',
    isPublished: overrides.isPublished ?? true,
    isDeleted:   false,
    images:      ['https://example.com/img.jpg'],
    ...overrides,
  });
}

// ── List products ─────────────────────────────────────────────────────────────

describe('GET /products', () => {
  it('returns 200 with products array and meta when no products exist', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.products)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
  });

  it('returns seeded products in the list', async () => {
    await seedProduct({ name: 'Razer BlackWidow', brand: 'Razer' });
    await seedProduct({ name: 'Logitech G Pro', brand: 'Logitech', slug: 'logitech-g-pro-test', sku: 'SKU-LG' });

    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.products).toHaveLength(2);
  });

  it('filters by brand param', async () => {
    await seedProduct({ name: 'Razer Huntsman', brand: 'Razer' });
    await seedProduct({ name: 'Corsair K70', brand: 'Corsair', slug: 'corsair-k70-test', sku: 'SKU-CS' });

    const res = await request(app).get(`${BASE}?brand=Razer`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data.products[0].brand).toMatch(/razer/i);
  });

  it('filters by category slug', async () => {
    await seedProduct({ name: 'MX Keys', slug: 'mx-keys-test', sku: 'SKU-MX' });

    const res = await request(app).get(`${BASE}?category=keyboards`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('returns empty list for a nonsense search query', async () => {
    await seedProduct();

    const res = await request(app).get(`${BASE}?search=zzz_no_such_product_xyz`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data.products).toHaveLength(0);
  });

  it('excludes unpublished products', async () => {
    await seedProduct({ name: 'Hidden Item', slug: 'hidden-item-test', sku: 'SKU-HID', isPublished: false });

    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });

  it('respects pagination limit', async () => {
    await seedProduct({ name: 'KB1 Pro', slug: 's1', sku: 'SKU1' });
    await seedProduct({ name: 'KB2 Pro', slug: 's2', sku: 'SKU2' });
    await seedProduct({ name: 'KB3 Pro', slug: 's3', sku: 'SKU3' });

    const res = await request(app).get(`${BASE}?limit=2&page=1`);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });
});

// ── Categories list ───────────────────────────────────────────────────────────

describe('GET /products/categories', () => {
  it('returns array of active categories', async () => {
    const Category = mongoose.model('Category');
    await Category.create({ name: 'Monitors', slug: 'monitors', isActive: true });

    const res = await request(app).get(`${BASE}/categories`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.categories)).toBe(true);
    expect(res.body.data.categories[0]).toHaveProperty('slug');
  });
});
