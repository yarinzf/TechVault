'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const migrateCategories = require('../server/scripts/migrateCatalogCategories');

let app;
const PRODUCTS = '/api/v1/products';
const AUTH     = '/api/v1/auth';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Category').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User${suffix}`,
    email:    `${role}${suffix}@category-hierarchy-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password });
  return res.body.data?.accessToken;
}

async function seedProduct(categoryId, overrides = {}) {
  const Product = mongoose.model('Product');
  _seq += 1;
  return Product.create({
    name:        overrides.name ?? 'Test Product',
    slug:        `test-product-${Date.now()}-${_seq}`,
    sku:         `SKU-${Date.now()}-${_seq}`,
    brand:       'TestBrand',
    price:       100,
    stock:       10,
    category:    categoryId,
    description: 'A product used for category hierarchy tests',
    isPublished: true,
    isDeleted:   false,
    images:      [],
    ...overrides,
  });
}

async function seedLegacyFlatCategories() {
  const Category = mongoose.model('Category');
  return Category.create([
    { name: 'Monitors',    slug: 'monitors' },
    { name: 'Keyboards',   slug: 'keyboards' },
    { name: 'Desktops',    slug: 'desktops' },
    { name: 'Headphones',  slug: 'headphones' },
    { name: 'Components',  slug: 'components' },
    { name: 'Accessories', slug: 'accessories' },
    { name: 'Smart Home',  slug: 'smart-home' },
  ]);
}

// ── 1/2: hierarchy representation + API shape ───────────────────────────────────

describe('Category hierarchy representation', () => {
  it('supports main categories (parentCategory=null) and subcategories (parentCategory=ObjectId)', async () => {
    const Category = mongoose.model('Category');
    const main = await Category.create({ name: 'Computers', slug: 'computers', parentCategory: null });
    const sub  = await Category.create({ name: 'Laptops', slug: 'laptops', parentCategory: main._id });

    expect(main.parentCategory).toBeNull();
    expect(sub.parentCategory.toString()).toBe(main._id.toString());
  });

  it('GET /products/categories returns parentCategory so the frontend can build the tree', async () => {
    const Category = mongoose.model('Category');
    const main = await Category.create({ name: 'Computers', slug: 'computers', parentCategory: null });
    await Category.create({ name: 'Laptops', slug: 'laptops', parentCategory: main._id });

    const res = await request(app).get(`${PRODUCTS}/categories`);
    expect(res.status).toBe(200);
    const bySlug = Object.fromEntries(res.body.data.categories.map(c => [c.slug, c]));
    expect(bySlug.computers.parentCategory).toBeNull();
    expect(String(bySlug.laptops.parentCategory)).toBe(String(main._id));
  });
});

// ── 3/4: leaf vs main-category product aggregation ──────────────────────────────

describe('Category-filtered product queries', () => {
  it('a leaf category query returns only that leaf\'s products', async () => {
    const Category = mongoose.model('Category');
    const main = await Category.create({ name: 'Computers', slug: 'computers', parentCategory: null });
    const laptops  = await Category.create({ name: 'Laptops', slug: 'laptops', parentCategory: main._id });
    const desktops = await Category.create({ name: 'Desktops', slug: 'desktops', parentCategory: main._id });
    await seedProduct(laptops._id, { name: 'A Laptop' });
    await seedProduct(desktops._id, { name: 'A Desktop' });

    const res = await request(app).get(`${PRODUCTS}?category=laptops`);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].name).toBe('A Laptop');
  });

  it('a main-category query aggregates products from all of its children', async () => {
    const Category = mongoose.model('Category');
    const main = await Category.create({ name: 'Computers', slug: 'computers', parentCategory: null });
    const laptops  = await Category.create({ name: 'Laptops', slug: 'laptops', parentCategory: main._id });
    const desktops = await Category.create({ name: 'Desktops', slug: 'desktops', parentCategory: main._id });
    const miniPc    = await Category.create({ name: 'Mini PC', slug: 'mini-pc', parentCategory: main._id });
    await seedProduct(laptops._id, { name: 'A Laptop' });
    await seedProduct(desktops._id, { name: 'A Desktop' });
    // mini-pc stays empty on purpose — must not break aggregation

    const res = await request(app).get(`${PRODUCTS}?category=computers`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    const names = res.body.data.products.map(p => p.name).sort();
    expect(names).toEqual(['A Desktop', 'A Laptop']);
    expect(miniPc.parentCategory.toString()).toBe(main._id.toString()); // sanity
  });

  it('a direct main category with no children (e.g. Monitors) still filters correctly — no regression', async () => {
    const Category = mongoose.model('Category');
    const monitors = await Category.create({ name: 'Monitors', slug: 'monitors', parentCategory: null });
    const other     = await Category.create({ name: 'Other', slug: 'other-cat', parentCategory: null });
    await seedProduct(monitors._id, { name: 'A Monitor' });
    await seedProduct(other._id, { name: 'Something Else' });

    const res = await request(app).get(`${PRODUCTS}?category=monitors`);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].name).toBe('A Monitor');
  });
});

// ── 5/6: empty + invalid category handling ──────────────────────────────────────

describe('Empty and invalid category handling', () => {
  it('a valid, empty category returns an empty product list — not an error', async () => {
    const Category = mongoose.model('Category');
    await Category.create({ name: 'Mini PC', slug: 'mini-pc', parentCategory: null });

    const res = await request(app).get(`${PRODUCTS}?category=mini-pc`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.products).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('an invalid/unknown category slug returns zero results, not a 500 or category-not-found error', async () => {
    const res = await request(app).get(`${PRODUCTS}?category=this-slug-does-not-exist`);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
  });
});

// ── 7: legacy alias ──────────────────────────────────────────────────────────────

describe('Legacy category slug alias', () => {
  it('querying the old "headphones" slug resolves to the migrated "headsets" category', async () => {
    const Category = mongoose.model('Category');
    const peripherals = await Category.create({ name: 'Peripherals', slug: 'peripherals', parentCategory: null });
    const headsets = await Category.create({ name: 'Headsets', slug: 'headsets', parentCategory: peripherals._id });
    await seedProduct(headsets._id, { name: 'Wireless Headset' });

    const res = await request(app).get(`${PRODUCTS}?category=headphones`);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].name).toBe('Wireless Headset');
  });

  it('querying the old "components" slug resolves to the migrated "pc-components" category', async () => {
    const Category = mongoose.model('Category');
    const pcComponents = await Category.create({ name: 'PC Components', slug: 'pc-components', parentCategory: null });
    await seedProduct(pcComponents._id, { name: 'A GPU' });

    const res = await request(app).get(`${PRODUCTS}?category=components`);
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
  });
});

// ── 9: product create/update still accepts canonical categories ────────────────

describe('Product create/update with canonical categories', () => {
  it('creating a product with a valid leaf category succeeds', async () => {
    const Category = mongoose.model('Category');
    const main = await Category.create({ name: 'Computers', slug: 'computers', parentCategory: null });
    const laptops = await Category.create({ name: 'Laptops', slug: 'laptops', parentCategory: main._id });

    await createUserWithRole('admin');
    const token = await loginAs('admin@category-hierarchy-test.com');

    const res = await request(app)
      .post(PRODUCTS)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Laptop', description: 'A brand new laptop', category: String(laptops._id),
        price: 999, stock: 5,
      });

    expect(res.status).toBe(201);
    expect(String(res.body.data.product.category)).toBe(String(laptops._id));
  });

  it('creating a product directly under a main category (e.g. Monitors) still succeeds', async () => {
    const Category = mongoose.model('Category');
    const monitors = await Category.create({ name: 'Monitors', slug: 'monitors', parentCategory: null });

    await createUserWithRole('admin', '2');
    const token = await loginAs('admin2@category-hierarchy-test.com');

    const res = await request(app)
      .post(PRODUCTS)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Monitor', description: 'A brand new monitor', category: String(monitors._id),
        price: 499, stock: 5,
      });

    expect(res.status).toBe(201);
  });
});

// ── 10/11: migration script idempotency + no duplicate slugs ───────────────────

describe('migrateCatalogCategories — idempotency', () => {
  it('running the migration twice produces the same category count and no duplicate slugs', async () => {
    await seedLegacyFlatCategories();
    const Category = mongoose.model('Category');

    const firstRun = await migrateCategories({ verbose: false });
    const afterFirst = await Category.find({}).select('slug').lean();
    const countAfterFirst = afterFirst.length;

    const secondRun = await migrateCategories({ verbose: false });
    const afterSecond = await Category.find({}).select('slug').lean();

    expect(afterSecond.length).toBe(countAfterFirst);
    expect(secondRun.after.total).toBe(firstRun.after.total);

    const slugs = afterSecond.map(c => c.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length); // no duplicates
  });

  it('renames legacy categories in place — same _id before and after migration', async () => {
    const [, , , headphones, components] = await seedLegacyFlatCategories();
    const Category = mongoose.model('Category');
    const headphonesId = headphones._id;
    const componentsId = components._id;

    await migrateCategories({ verbose: false });

    const headsets = await Category.findById(headphonesId).lean();
    expect(headsets.slug).toBe('headsets');
    expect(headsets.parentCategory).not.toBeNull();

    const pcComponents = await Category.findById(componentsId).lean();
    expect(pcComponents.slug).toBe('pc-components');
    expect(pcComponents.parentCategory).toBeNull();
  });

  it('deactivates Accessories/Smart Home without deleting them, preserving any product references', async () => {
    const cats = await seedLegacyFlatCategories();
    const accessories = cats.find(c => c.slug === 'accessories');
    const product = await seedProduct(accessories._id, { name: 'Old Accessory' });

    await migrateCategories({ verbose: false });

    const Category = mongoose.model('Category');
    const Product  = mongoose.model('Product');
    const stillThere = await Category.findById(accessories._id).lean();
    expect(stillThere).not.toBeNull();
    expect(stillThere.isActive).toBe(false);

    const stillAssigned = await Product.findById(product._id).lean();
    expect(String(stillAssigned.category)).toBe(String(accessories._id));
  });

  it('preserves existing product→category references for reparented/renamed categories (desktops, headphones)', async () => {
    const cats = await seedLegacyFlatCategories();
    const desktops   = cats.find(c => c.slug === 'desktops');
    const headphones = cats.find(c => c.slug === 'headphones');
    const desktopProduct   = await seedProduct(desktops._id,   { name: 'A Desktop PC' });
    const headphoneProduct = await seedProduct(headphones._id, { name: 'A Headset' });

    await migrateCategories({ verbose: false });

    // Same category _id still resolves the same product via the API,
    // now under its migrated slug.
    const desktopsRes  = await request(app).get(`${PRODUCTS}?category=desktops`);
    const headsetsRes  = await request(app).get(`${PRODUCTS}?category=headsets`);
    expect(desktopsRes.body.data.products.map(p => p._id)).toContain(String(desktopProduct._id));
    expect(headsetsRes.body.data.products.map(p => p._id)).toContain(String(headphoneProduct._id));
  });
});
