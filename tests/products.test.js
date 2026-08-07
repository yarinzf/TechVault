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

// ── Canonical pricing rule: an active Campaign is the ONLY sale source ──────
// compareAtPrice must never independently produce a discount, badge, or
// inclusion in onSale=true — see server/services/campaign.service.js.
describe('Campaign-only sale pricing', () => {
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

  it('1. a product with compareAtPrice > price and NO active campaign is NOT on sale', async () => {
    const product = await seedProduct({
      name: 'Stale Compare Price Item', slug: 'stale-compare-price', sku: 'SKU-STALE',
      price: 500, compareAtPrice: 800,
    });

    const listRes = await request(app).get(BASE);
    const found = listRes.body.data.products.find(p => p._id === product._id.toString());
    expect(found.discountedPrice).toBeUndefined();
    expect(found.discountPercent).toBeUndefined();

    const detailRes = await request(app).get(`${BASE}/${product.slug}`);
    expect(detailRes.body.data.product.discountedPrice).toBeUndefined();

    const saleRes = await request(app).get(`${BASE}?onSale=true`);
    expect(saleRes.body.data.products.find(p => p._id === product._id.toString())).toBeUndefined();
  });

  it('2. the same product with an active campaign has discountedPrice and correct discountPercent', async () => {
    const product = await seedProduct({
      name: 'Now On Campaign', slug: 'now-on-campaign', sku: 'SKU-CAMP',
      price: 500, compareAtPrice: 800,
    });
    await seedCampaign({ discountPercent: 25, products: [product._id] });

    const detailRes = await request(app).get(`${BASE}/${product.slug}`);
    expect(detailRes.body.data.product.discountedPrice).toBe(375); // 500 * 0.75
    expect(detailRes.body.data.product.discountPercent).toBe(25);

    const listRes = await request(app).get(BASE);
    const found = listRes.body.data.products.find(p => p._id === product._id.toString());
    expect(found.discountedPrice).toBe(375);
    expect(found.discountPercent).toBe(25);
  });

  it('3. once the campaign expires, the product returns to its regular price', async () => {
    const product = await seedProduct({
      name: 'Expired Campaign Item', slug: 'expired-campaign-item', sku: 'SKU-EXP',
      price: 500,
    });
    await seedCampaign({
      discountPercent: 30,
      products: [product._id],
      startDate: new Date(Date.now() - 10 * 86400000),
      endDate:   new Date(Date.now() - 1 * 86400000),
    });

    const detailRes = await request(app).get(`${BASE}/${product.slug}`);
    expect(detailRes.body.data.product.discountedPrice).toBeUndefined();
    expect(detailRes.body.data.product.price).toBe(500);
  });

  it('4. onSale=true includes active-campaign products and excludes compareAtPrice-only products', async () => {
    const onCampaign = await seedProduct({
      name: 'Sale Product', slug: 'sale-product-4', sku: 'SKU-SALE4', price: 300,
    });
    const compareOnly = await seedProduct({
      name: 'Compare Only Product', slug: 'compare-only-4', sku: 'SKU-CMP4', price: 300, compareAtPrice: 450,
    });
    await seedCampaign({ discountPercent: 15, products: [onCampaign._id] });

    const res = await request(app).get(`${BASE}?onSale=true`);
    const ids = res.body.data.products.map(p => p._id);
    expect(ids).toContain(onCampaign._id.toString());
    expect(ids).not.toContain(compareOnly._id.toString());
  });

  it('5. overlapping active campaigns on the same product — highest discount wins', async () => {
    const product = await seedProduct({
      name: 'Overlap Product', slug: 'overlap-product-5', sku: 'SKU-OVL5', price: 1000,
    });
    await seedCampaign({ discountPercent: 10, products: [product._id] });
    await seedCampaign({ discountPercent: 35, products: [product._id] });

    const detailRes = await request(app).get(`${BASE}/${product.slug}`);
    expect(detailRes.body.data.product.discountPercent).toBe(35);
    expect(detailRes.body.data.product.discountedPrice).toBe(650);
  });
});

// ── New Arrivals (?new=true, ?newDays=, /products/new-brands) ──────────────
// Mongoose's `timestamps: true` protects createdAt from Product.updateOne()/
// findOneAndUpdate() — same class of issue as server/scripts/
// stageNewArrivalsDemo.js worked around. Bypass via the raw collection.
describe('New Arrivals', () => {
  async function setCreatedAt(id, date) {
    const raw = mongoose.connection.collection('products');
    await raw.updateOne({ _id: id }, { $set: { createdAt: date } });
  }
  const daysAgo = (n) => new Date(Date.now() - n * 86400000);

  test('excludes a product older than the 14-day window', async () => {
    const product = await seedProduct({ name: 'Old Product', slug: 'old-product-na', sku: 'SKU-OLD-NA' });
    await setCreatedAt(product._id, daysAgo(20));

    const res = await request(app).get(`${BASE}?new=true`);
    expect(res.body.data.products.map(p => p._id)).not.toContain(product._id.toString());
  });

  test('includes a product just inside the 14-day boundary', async () => {
    // `daysAgo(14)` computed here and the controller's own `Date.now() - 14d`
    // computed a moment later would put the threshold a few ms AFTER this
    // product's createdAt, failing `$gte` on pure test-execution latency —
    // not a real off-by-one. A small inside-the-window buffer proves the
    // boundary is inclusive without being sensitive to that drift.
    const product = await seedProduct({ name: 'Boundary Product', slug: 'boundary-product-na', sku: 'SKU-BOUND-NA' });
    await setCreatedAt(product._id, new Date(daysAgo(14).getTime() + 5000));

    const res = await request(app).get(`${BASE}?new=true`);
    expect(res.body.data.products.map(p => p._id)).toContain(product._id.toString());
  });

  test('excludes an unpublished product even if recently added', async () => {
    const product = await seedProduct({ name: 'Unpublished New', slug: 'unpub-new-na', sku: 'SKU-UNPUB-NA', isPublished: false });
    await setCreatedAt(product._id, daysAgo(0));

    const res = await request(app).get(`${BASE}?new=true`);
    expect(res.body.data.products.map(p => p._id)).not.toContain(product._id.toString());
  });

  test('excludes a deleted product even if recently added', async () => {
    const product = await seedProduct({ name: 'Deleted New', slug: 'deleted-new-na', sku: 'SKU-DEL-NA' });
    await setCreatedAt(product._id, daysAgo(0));
    await mongoose.model('Product').updateOne({ _id: product._id }, { isDeleted: true });

    const res = await request(app).get(`${BASE}?new=true`);
    expect(res.body.data.products.map(p => p._id)).not.toContain(product._id.toString());
  });

  test('sorts newest first by default', async () => {
    const older = await seedProduct({ name: 'Older New', slug: 'older-new-na', sku: 'SKU-OLDER-NA' });
    const newer = await seedProduct({ name: 'Newer New', slug: 'newer-new-na', sku: 'SKU-NEWER-NA' });
    await setCreatedAt(older._id, daysAgo(5));
    await setCreatedAt(newer._id, daysAgo(1));

    const res = await request(app).get(`${BASE}?new=true`);
    const ids = res.body.data.products.map(p => p._id);
    expect(ids.indexOf(newer._id.toString())).toBeLessThan(ids.indexOf(older._id.toString()));
  });

  test('newDays narrows the window (e.g. "arrived this week")', async () => {
    const thisWeek = await seedProduct({ name: 'This Week', slug: 'this-week-na', sku: 'SKU-WEEK-NA' });
    const lastWeek = await seedProduct({ name: 'Last Week', slug: 'last-week-na', sku: 'SKU-LASTWEEK-NA' });
    await setCreatedAt(thisWeek._id, daysAgo(3));
    await setCreatedAt(lastWeek._id, daysAgo(10));

    const res = await request(app).get(`${BASE}?new=true&newDays=7`);
    const ids = res.body.data.products.map(p => p._id);
    expect(ids).toContain(thisWeek._id.toString());
    expect(ids).not.toContain(lastWeek._id.toString());
  });

  test('newDays cannot widen the window past the canonical 14 days', async () => {
    const product = await seedProduct({ name: 'Beyond Canonical', slug: 'beyond-canonical-na', sku: 'SKU-BEYOND-NA' });
    await setCreatedAt(product._id, daysAgo(20));

    const res = await request(app).get(`${BASE}?new=true&newDays=30`);
    expect(res.body.data.products.map(p => p._id)).not.toContain(product._id.toString());
  });

  test('a new product with an active campaign is still enriched with campaign pricing', async () => {
    const product = await seedProduct({ name: 'New On Campaign', slug: 'new-on-campaign-na', sku: 'SKU-NEWCAMP-NA', price: 400 });
    await setCreatedAt(product._id, daysAgo(0));
    const Campaign = mongoose.model('Campaign');
    await Campaign.create({
      name: 'New Arrivals Campaign', discountPercent: 20,
      startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
      products: [product._id],
    });

    const res = await request(app).get(`${BASE}?new=true`);
    const found = res.body.data.products.find(p => p._id === product._id.toString());
    expect(found.discountedPrice).toBe(320);
    expect(found.discountPercent).toBe(20);
  });
});

describe('GET /products/new-brands', () => {
  async function setCreatedAt(id, date) {
    const raw = mongoose.connection.collection('products');
    await raw.updateOne({ _id: id }, { $set: { createdAt: date } });
  }
  const daysAgo = (n) => new Date(Date.now() - n * 86400000);

  test('a brand qualifies only when EVERY one of its products is within the window', async () => {
    const p1 = await seedProduct({ name: 'Brand X Item 1', slug: 'brandx-1', sku: 'SKU-BX1', brand: 'BrandX' });
    const p2 = await seedProduct({ name: 'Brand X Item 2', slug: 'brandx-2', sku: 'SKU-BX2', brand: 'BrandX' });
    await setCreatedAt(p1._id, daysAgo(2));
    await setCreatedAt(p2._id, daysAgo(5));

    const res = await request(app).get(`${BASE}/new-brands`);
    expect(res.body.data.brands.map(b => b.brand)).toContain('BrandX');
  });

  test('a brand does NOT qualify if even one of its products is older than the window', async () => {
    const p1 = await seedProduct({ name: 'Brand Y Item 1', slug: 'brandy-1', sku: 'SKU-BY1', brand: 'BrandY' });
    const p2 = await seedProduct({ name: 'Brand Y Item 2', slug: 'brandy-2', sku: 'SKU-BY2', brand: 'BrandY' });
    await setCreatedAt(p1._id, daysAgo(2));
    await setCreatedAt(p2._id, daysAgo(20)); // one old product disqualifies the whole brand

    const res = await request(app).get(`${BASE}/new-brands`);
    expect(res.body.data.brands.map(b => b.brand)).not.toContain('BrandY');
  });

  test('an unpublished product does not count toward its brand\'s new-brand status', async () => {
    const product = await seedProduct({ name: 'Brand Z Item', slug: 'brandz-1', sku: 'SKU-BZ1', brand: 'BrandZ', isPublished: false });
    await setCreatedAt(product._id, daysAgo(0));

    const res = await request(app).get(`${BASE}/new-brands`);
    expect(res.body.data.brands.map(b => b.brand)).not.toContain('BrandZ');
  });
});
