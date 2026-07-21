'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const { generateAccessToken } = require('../server/utils/jwt');

let app;
const ADMIN_BASE  = '/api/v1/admin/campaigns';
const PUBLIC_BASE = '/api/v1/campaigns';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Campaign').createIndexes();
  await mongoose.model('User').createIndexes();
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
    slug:        overrides.slug        ?? 'test-keyboard-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    sku:         overrides.sku         ?? 'SKU-' + Date.now() + Math.random().toString(36).slice(2, 6),
    brand:       overrides.brand       ?? 'TestBrand',
    price:       overrides.price       ?? 299,
    stock:       overrides.stock       ?? 10,
    category:    cat._id,
    description: 'A great keyboard for testing',
    isPublished: overrides.isPublished ?? true,
    isDeleted:   overrides.isDeleted   ?? false,
  });
}

async function adminToken() {
  const User = mongoose.model('User');
  const user = await User.create({
    name: 'Test Admin',
    email: 'admin-' + Date.now() + Math.random().toString(36).slice(2) + '@test.local',
    password: 'TestPassword123',
    role: 'admin',
    isActive: true,
  });
  return generateAccessToken({ id: user._id.toString() });
}

const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

function standardPayload(overrides = {}) {
  return {
    name:            overrides.name ?? 'Standard Campaign',
    discountPercent: overrides.discountPercent ?? 20,
    startDate:       (overrides.startDate ?? inDays(-1)).toISOString(),
    endDate:         (overrides.endDate ?? inDays(6)).toISOString(),
    products:        overrides.products ?? [],
    ...(overrides.placement !== undefined ? { placement: overrides.placement } : {}),
  };
}

function weeklyDealPayload(productId, overrides = {}) {
  return {
    name:            overrides.name ?? 'Weekly Deal',
    discountPercent: overrides.discountPercent ?? 30,
    startDate:       (overrides.startDate ?? inDays(-1)).toISOString(),
    endDate:         (overrides.endDate ?? inDays(6)).toISOString(),
    products:        [productId],
    placement:       'homepage_weekly_deal',
  };
}

// Inserts a campaign document directly via the raw MongoDB driver, bypassing
// Mongoose entirely — Campaign.create()/save() would always apply the
// schema's `placement` default, so it can never simulate a genuinely legacy
// document saved before the field existed. A raw collection.insertOne() is
// the only way to guarantee the stored BSON truly has no placement key.
async function insertLegacyCampaign(overrides = {}) {
  const collection = mongoose.connection.collection('campaigns');
  const doc = {
    name:            overrides.name ?? 'Legacy Campaign',
    discountPercent:  overrides.discountPercent ?? 15,
    startDate:        overrides.startDate ?? inDays(-1),
    endDate:          overrides.endDate ?? inDays(6),
    isActive:         overrides.isActive ?? true,
    products:         (overrides.products ?? []).map((id) => new mongoose.Types.ObjectId(id)),
    createdAt:        new Date(),
    updatedAt:        new Date(),
    // deliberately no `placement` key at all
  };
  const { insertedId } = await collection.insertOne(doc);
  return insertedId;
}

// ── Standard campaign regression ────────────────────────────────────────────

describe('Standard campaigns (regression)', () => {
  test('1. creation still works when placement is omitted', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(standardPayload());
    expect(res.status).toBe(201);
    expect(res.body.data.campaign.placement).toBe('none');
  });

  test('2. standard campaign with multiple products still works', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Prod A' });
    const p2 = await seedProduct({ name: 'Prod B' });
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(standardPayload({ products: [p1._id.toString(), p2._id.toString()] }));
    expect(res.status).toBe(201);
    expect(res.body.data.campaign.products).toHaveLength(2);
  });

  test('27. getActiveDiscountMap behavior unchanged — highest discount wins across overlapping standard campaigns', async () => {
    const token = await adminToken();
    const product = await seedProduct({ price: 100 });
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(standardPayload({ discountPercent: 10, products: [product._id.toString()] }));
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(standardPayload({ discountPercent: 40, products: [product._id.toString()] }));

    const campaignService = require('../server/services/campaign.service');
    const map = await campaignService.getActiveDiscountMap();
    expect(map.get(product._id.toString())).toBe(40);
  });

  test('29. invalid placement enum value is rejected', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(standardPayload({ placement: 'not_a_real_placement' }));
    expect(res.status).toBe(422);
  });
});

// ── Weekly Deal creation validation ─────────────────────────────────────────

describe('Weekly Deal creation validation', () => {
  test('3. valid Weekly Deal creation succeeds', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));
    expect(res.status).toBe(201);
    expect(res.body.data.campaign.placement).toBe('homepage_weekly_deal');
  });

  test('4. zero products is rejected', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...weeklyDealPayload('000000000000000000000000'), products: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_NO_PRODUCT');
  });

  test('5. multiple products is rejected', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...weeklyDealPayload(p1._id.toString()), products: [p1._id.toString(), p2._id.toString()] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_MULTIPLE_PRODUCTS');
  });

  test('6. nonexistent product is rejected', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload('000000000000000000000000'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_PRODUCT_NOT_FOUND');
  });

  test('7. unpublished product is rejected', async () => {
    const token = await adminToken();
    const product = await seedProduct({ isPublished: false });
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_PRODUCT_UNPUBLISHED');
  });

  test('8. deleted product is rejected', async () => {
    const token = await adminToken();
    const product = await seedProduct({ isDeleted: true });
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_PRODUCT_DELETED');
  });

  test('9. out-of-stock product is rejected', async () => {
    const token = await adminToken();
    const product = await seedProduct({ stock: 0 });
    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_PRODUCT_OUT_OF_STOCK');
  });
});

// ── Overlap validation ───────────────────────────────────────────────────────

describe('Weekly Deal overlap validation', () => {
  test('10. overlapping enabled Weekly Deal is rejected', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p1._id.toString(), { startDate: inDays(-1), endDate: inDays(5) }));

    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p2._id.toString(), { startDate: inDays(2), endDate: inDays(8) }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_OVERLAP');
  });

  test('11. a disabled overlapping Weekly Deal does not block a new one', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    const created = await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p1._id.toString(), { startDate: inDays(-1), endDate: inDays(5) }));
    await request(app).patch(`${ADMIN_BASE}/${created.body.data.campaign._id}`)
      .set('Authorization', `Bearer ${token}`).send({ isActive: false });

    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p2._id.toString(), { startDate: inDays(-1), endDate: inDays(5) }));
    expect(res.status).toBe(201);
  });

  test('12. a non-overlapping future Weekly Deal is allowed', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p1._id.toString(), { startDate: inDays(0), endDate: inDays(5) }));

    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p2._id.toString(), { startDate: inDays(10), endDate: inDays(15) }));
    expect(res.status).toBe(201);
  });

  test('13. back-to-back date ranges that touch at the boundary are allowed', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    const boundary = inDays(5);
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p1._id.toString(), { startDate: inDays(0), endDate: boundary }));

    const res = await request(app)
      .post(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p2._id.toString(), { startDate: boundary, endDate: inDays(10) }));
    expect(res.status).toBe(201);
  });

  test('14. editing a Weekly Deal excludes itself from overlap detection', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    const created = await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString(), { startDate: inDays(0), endDate: inDays(5) }));
    const id = created.body.data.campaign._id;

    const res = await request(app)
      .patch(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Weekly Deal' });
    expect(res.status).toBe(200);
    expect(res.body.data.campaign.name).toBe('Renamed Weekly Deal');
  });
});

// ── Partial PATCH merged-state validation ───────────────────────────────────

describe('Partial PATCH merged-state validation', () => {
  test('15. partial PATCH of an existing Weekly Deal validates the final merged state', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    const created = await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p1._id.toString(), { startDate: inDays(0), endDate: inDays(5) }));
    const id = created.body.data.campaign._id;

    // Another Weekly Deal already occupies inDays(10)-inDays(15)
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p2._id.toString(), { startDate: inDays(10), endDate: inDays(15) }));

    // PATCH only endDate on the first Weekly Deal, extending it into the
    // second's range — the partial payload alone doesn't mention
    // placement/products/startDate, but the service must still know this is
    // a Weekly Deal with its existing product/startDate and validate the
    // merged date range (0..12) against the second deal's (10..15).
    const res = await request(app)
      .patch(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ endDate: inDays(12).toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_OVERLAP');
  });

  test('16. changing a standard campaign to Weekly Deal validates the final merged product selection', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    const created = await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(standardPayload({ products: [p1._id.toString(), p2._id.toString()] }));
    const id = created.body.data.campaign._id;

    // Existing standard campaign has 2 products — flipping placement to
    // Weekly Deal without changing products must fail the merged-state check.
    const res = await request(app)
      .patch(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ placement: 'homepage_weekly_deal' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEEKLY_DEAL_MULTIPLE_PRODUCTS');
  });

  test('17. changing a Weekly Deal to placement none succeeds without Weekly Deal-only restrictions', async () => {
    const token = await adminToken();
    const p1 = await seedProduct({ name: 'Product One' });
    const p2 = await seedProduct({ name: 'Product Two' });
    const created = await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(p1._id.toString()));
    const id = created.body.data.campaign._id;

    const res = await request(app)
      .patch(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ placement: 'none', products: [p1._id.toString(), p2._id.toString()] });
    expect(res.status).toBe(200);
    expect(res.body.data.campaign.placement).toBe('none');
    expect(res.body.data.campaign.products).toHaveLength(2);
  });
});

// ── Public endpoint ──────────────────────────────────────────────────────────

describe('GET /api/v1/campaigns/weekly-deal (public)', () => {
  test('18. returns { deal: null } when no Weekly Deal exists', async () => {
    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.status).toBe(200);
    expect(res.body.data.deal).toBeNull();
  });

  test('19. expired Weekly Deal returns { deal: null }', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString(), { startDate: inDays(-10), endDate: inDays(-1) }));

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal).toBeNull();
  });

  test('20. future Weekly Deal returns { deal: null } before its start date', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString(), { startDate: inDays(3), endDate: inDays(10) }));

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal).toBeNull();
  });

  test('21. disabled Weekly Deal returns { deal: null }', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    const created = await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));
    await request(app).patch(`${ADMIN_BASE}/${created.body.data.campaign._id}`)
      .set('Authorization', `Bearer ${token}`).send({ isActive: false });

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal).toBeNull();
  });

  test('22 & 23. valid active Weekly Deal returns the exact narrow response with correct discountedPrice', async () => {
    const token = await adminToken();
    const product = await seedProduct({ name: 'RTX Card', price: 1000, brand: 'ASUS' });
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString(), { name: 'This Week Deal', discountPercent: 25 }));

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.status).toBe(200);
    const { deal } = res.body.data;
    expect(deal).not.toBeNull();
    expect(deal.campaignTitle).toBe('This Week Deal');
    expect(deal.discountPercent).toBe(25);
    expect(deal.product.id).toBe(product._id.toString());
    expect(deal.product.name).toBe('RTX Card');
    expect(deal.product.slug).toBe(product.slug);
    expect(deal.product.price).toBe(1000);
    expect(deal.product.discountedPrice).toBe(750); // 1000 * (1 - 25/100)
    expect(deal.product.brand).toBe('ASUS');
    expect(typeof deal.startDate).toBe('string');
    expect(typeof deal.endDate).toBe('string');
    // internal fields must not leak
    expect(deal).not.toHaveProperty('__v');
    expect(deal).not.toHaveProperty('isActive');
    expect(deal.product).not.toHaveProperty('products');
  });

  test('24. product becoming unpublished after creation causes { deal: null }', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));

    await mongoose.model('Product').findByIdAndUpdate(product._id, { isPublished: false });

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal).toBeNull();
  });

  test('25. product becoming deleted after creation causes { deal: null }', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));

    await mongoose.model('Product').findByIdAndUpdate(product._id, { isDeleted: true });

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal).toBeNull();
  });

  test('26. product becoming out of stock after creation causes { deal: null }', async () => {
    const token = await adminToken();
    const product = await seedProduct();
    await request(app).post(ADMIN_BASE).set('Authorization', `Bearer ${token}`)
      .send(weeklyDealPayload(product._id.toString()));

    await mongoose.model('Product').findByIdAndUpdate(product._id, { stock: 0 });

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal).toBeNull();
  });

  test('28. public endpoint is accessible without authentication', async () => {
    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('30. deterministic selection when inconsistent duplicate active Weekly Deals exist', async () => {
    // Simulate an impossible state (should never occur given overlap
    // validation) via direct DB insertion, bypassing the service layer.
    const Campaign = mongoose.model('Campaign');
    const olderProduct = await seedProduct({ name: 'Older' });
    const newerProduct = await seedProduct({ name: 'Newer' });

    const older = await Campaign.create({
      name: 'Older Deal', discountPercent: 10, placement: 'homepage_weekly_deal',
      isActive: true, startDate: inDays(-5), endDate: inDays(5),
      products: [olderProduct._id],
    });
    // Ensure a distinguishable startDate/updatedAt ordering
    await new Promise((r) => setTimeout(r, 5));
    const newer = await Campaign.create({
      name: 'Newer Deal', discountPercent: 15, placement: 'homepage_weekly_deal',
      isActive: true, startDate: inDays(-1), endDate: inDays(5),
      products: [newerProduct._id],
    });

    const res = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(res.body.data.deal.product.name).toBe('Newer'); // later startDate wins deterministically
    expect(res.body.data.deal.campaignId).toBe(newer._id.toString());
    void older; // referenced only to document the "older" candidate exists
  });
});

// ── Legacy document backward compatibility ──────────────────────────────────
// These documents are inserted via the raw driver (insertLegacyCampaign),
// never through Mongoose, so they genuinely lack a stored `placement` key —
// simulating a campaign saved before this field existed.

describe('Legacy campaign backward compatibility', () => {
  test('31. Admin campaign list normalizes a legacy document with no stored placement to none', async () => {
    await insertLegacyCampaign({ name: 'Old Standard Campaign' });
    const token = await adminToken();

    const res = await request(app)
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const found = res.body.data.campaigns.find((c) => c.name === 'Old Standard Campaign');
    expect(found).toBeDefined();
    expect(found.placement).toBe('none');
  });

  test('32. partial PATCH of a legacy campaign with no stored placement succeeds as a standard campaign', async () => {
    const id = await insertLegacyCampaign({ name: 'Legacy To Rename' });
    const token = await adminToken();

    const res = await request(app)
      .patch(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Legacy Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.campaign.name).toBe('Legacy Renamed');
    expect(res.body.data.campaign.placement).toBe('none');
  });

  test('33. changing a legacy campaign to homepage_weekly_deal via PATCH validates the final product selection and Weekly Deal rules', async () => {
    // No products on the legacy doc — flipping placement to Weekly Deal
    // without also supplying exactly one eligible product must fail exactly
    // like it would for any other campaign.
    const idNoProduct = await insertLegacyCampaign({ name: 'Legacy No Product' });
    const token = await adminToken();

    const rejected = await request(app)
      .patch(`${ADMIN_BASE}/${idNoProduct}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ placement: 'homepage_weekly_deal' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('WEEKLY_DEAL_NO_PRODUCT');

    // Now with exactly one eligible product supplied in the same PATCH —
    // full Weekly Deal validation (product eligibility + overlap) must run
    // and succeed.
    const product = await seedProduct({ name: 'Legacy Deal Product' });
    const idWithProduct = await insertLegacyCampaign({ name: 'Legacy With Product' });

    const accepted = await request(app)
      .patch(`${ADMIN_BASE}/${idWithProduct}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ placement: 'homepage_weekly_deal', products: [product._id.toString()] });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.campaign.placement).toBe('homepage_weekly_deal');

    const dealRes = await request(app).get(`${PUBLIC_BASE}/weekly-deal`);
    expect(dealRes.body.data.deal.product.name).toBe('Legacy Deal Product');
  });
});
