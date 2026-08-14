'use strict';

// Integration coverage for the Barcode Scanner honesty fix:
//   GET /api/v1/admin/inventory/lookup?code=... — exact SKU (or, if ever
//   persisted, barcode) lookup used by the real camera-scanning /
//   manual-entry Warehouse scanner. See server/services/warehouse.service.js
//   #lookupProduct.

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { generateAccessToken } = require('../server/utils/jwt');

let app;
const LOOKUP = '/api/v1/admin/inventory/lookup';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('User').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _seq = 0;

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name: `${role} User${suffix}`, email: `${role}${suffix}@wh-lookup-test.com`,
    password: 'Password123!', role,
  });
}

async function roleToken(role, suffix) {
  const user = await createUserWithRole(role, suffix);
  return generateAccessToken({ id: user._id.toString() });
}

async function registerAndLogin(suffix) {
  _seq += 1;
  const email = `customer-${suffix}-${Date.now()}-${_seq}@wh-lookup-test.com`;
  const res = await request(app).post('/api/v1/auth/register').send({ name: 'Customer', email, password: 'Password123!' });
  return res.body.data.accessToken;
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
    name: overrides.name ?? `WH Lookup Product ${Date.now()}-${_seq}`,
    slug: `wh-lookup-product-${Date.now()}-${_seq}`,
    sku:  overrides.sku ?? `TV-WH${Date.now()}${_seq}`,
    brand: 'TestBrand', price: overrides.price ?? 499, stock: overrides.stock ?? 12,
    category: cat._id, description: 'Warehouse lookup test product',
    isPublished: overrides.isPublished ?? true,
    isDeleted:   overrides.isDeleted   ?? false,
    images: [],
  });
}

describe('GET /admin/inventory/lookup — authorization', () => {
  it('Warehouse can look up by valid SKU', async () => {
    const product = await seedProduct();
    const token = await roleToken('warehouse', '-auth1');

    const res = await request(app).get(LOOKUP).query({ code: product.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product._id).toBe(product._id.toString());
  });

  it('Admin can look up', async () => {
    const product = await seedProduct();
    const token = await roleToken('admin', '-auth2');

    const res = await request(app).get(LOOKUP).query({ code: product.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product._id).toBe(product._id.toString());
  });

  it('Super Admin can look up', async () => {
    const product = await seedProduct();
    const token = await roleToken('superadmin', '-auth3');

    const res = await request(app).get(LOOKUP).query({ code: product.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product._id).toBe(product._id.toString());
  });

  it('Customer cannot look up', async () => {
    const product = await seedProduct();
    const token = await registerAndLogin('auth4');

    const res = await request(app).get(LOOKUP).query({ code: product.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('an unauthenticated request is rejected', async () => {
    const res = await request(app).get(LOOKUP).query({ code: 'TV-ANYTHING' });
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/inventory/lookup — correctness', () => {
  it('returns exactly the product matching the scanned code', async () => {
    const target = await seedProduct({ name: 'Target Product' });
    await seedProduct({ name: 'Other Product' });
    const token = await roleToken('warehouse', '-c1');

    const res = await request(app).get(LOOKUP).query({ code: target.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product._id).toBe(target._id.toString());
    expect(res.body.data.product.name).toBe('Target Product');
  });

  it('an unknown code returns a clear, honest not-found result (product: null), not an error', async () => {
    const token = await roleToken('warehouse', '-c2');

    const res = await request(app).get(LOOKUP).query({ code: 'TV-DOES-NOT-EXIST' }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toBeNull();
  });

  it('a deleted product is not returned', async () => {
    const deleted = await seedProduct({ isDeleted: true });
    const token = await roleToken('warehouse', '-c3');

    const res = await request(app).get(LOOKUP).query({ code: deleted.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toBeNull();
  });

  it('an unpublished product IS returned — warehouse needs to find inventory not yet live on the storefront', async () => {
    const unpublished = await seedProduct({ isPublished: false });
    const token = await roleToken('warehouse', '-c4');

    const res = await request(app).get(LOOKUP).query({ code: unpublished.sku }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product._id).toBe(unpublished._id.toString());
  });

  it('SKU lookup is case-insensitive (a lowercase scan of an uppercase SKU still matches)', async () => {
    const product = await seedProduct();
    const token = await roleToken('warehouse', '-c5');

    const res = await request(app).get(LOOKUP).query({ code: product.sku.toLowerCase() }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product._id).toBe(product._id.toString());
  });

  it('a partial/substring code never fuzzy-matches a wrong product', async () => {
    const product = await seedProduct();
    const token = await roleToken('warehouse', '-c6');
    const partialCode = product.sku.slice(0, 4);

    const res = await request(app).get(LOOKUP).query({ code: partialCode }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toBeNull();
  });

  it('an empty code is rejected with a clear validation error, not a crash', async () => {
    const token = await roleToken('warehouse', '-c7');

    const res = await request(app).get(LOOKUP).query({ code: '' }).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('a missing code param is rejected with a clear validation error', async () => {
    const token = await roleToken('warehouse', '-c8');

    const res = await request(app).get(LOOKUP).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
