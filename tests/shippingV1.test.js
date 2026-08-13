'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH     = '/api/v1/auth';
const ORDERS   = '/api/v1/orders';
const CART     = '/api/v1/cart';
const PAYMENTS = '/api/v1/payments';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
  await mongoose.model('Product').createIndexes();
  await mongoose.model('Order').createIndexes();
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _seq = 0;

async function registerAndLogin(overrides = {}) {
  _seq += 1;
  const email = overrides.email ?? `ship-${Date.now()}-${_seq}@example.com`;
  const res = await request(app).post(`${AUTH}/register`).send({
    name: overrides.name ?? 'Shipping Test User',
    email,
    password: 'Password123!',
  });
  return { user: res.body.data.user, accessToken: res.body.data.accessToken, email };
}

// Directly grants active Club membership — bypasses real checkout for test
// speed (the real checkout→payment→activation flow is already covered end
// to end by tests/membershipPurchase.test.js).
async function makeMember(userId) {
  const User = mongoose.model('User');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 86400000);
  await User.findByIdAndUpdate(userId, {
    $set: {
      'membership.status': 'active',
      'membership.plan': 'monthly',
      'membership.joinedAt': now,
      'membership.startedAt': now,
      'membership.expiresAt': expiresAt,
    },
  });
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
  return Product.create({
    name:        overrides.name        ?? 'Shipping Test Monitor',
    slug:        overrides.slug        ?? `ship-test-monitor-${Date.now()}-${_seq}`,
    sku:         overrides.sku         ?? `SKU-SHIP-${Date.now()}-${_seq}`,
    brand:       'TestBrand',
    price:       overrides.price       ?? 100,
    stock:       overrides.stock       ?? 50,
    category:    cat._id,
    description: 'A great monitor for shipping V1 testing',
    isPublished: true,
    isDeleted:   false,
    images:      [],
    ...overrides,
  });
}

async function addToCart(token, productId, quantity = 1) {
  return request(app).post(`${CART}/items`).set('Authorization', `Bearer ${token}`).send({ productId, quantity });
}

async function createOrder(token, body = {}) {
  return request(app).post(ORDERS).set('Authorization', `Bearer ${token}`).send({
    shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'Israel' },
    shippingMethod: 'standard',
    ...body,
  });
}

async function payOrder(token, orderId) {
  const intentRes = await request(app).post(`${PAYMENTS}/create-intent`).set('Authorization', `Bearer ${token}`).send({ orderId });
  const { paymentIntentId } = intentRes.body.data;
  return request(app).post(`${PAYMENTS}/confirm`).set('Authorization', `Bearer ${token}`).send({ orderId, paymentIntentId });
}

// Convenience for tests that place a single-quantity order at a given price.
async function buyOneAt(price, body = {}, productOverrides = {}) {
  const product = await seedProduct({ price, ...productOverrides });
  const { accessToken, user } = await registerAndLogin();
  await addToCart(accessToken, product._id, 1);
  const res = await createOrder(accessToken, body);
  return { res, accessToken, user, product };
}

// ══════════════════════════════════════════════════════════════════════════
// Shipping V1 — pricing rules (18 required scenarios)
// ══════════════════════════════════════════════════════════════════════════
describe('Shipping V1 — server-authoritative pricing', () => {

  // 1. Store Pickup = ₪0
  it('Store Pickup always costs ₪0', async () => {
    const { res } = await buyOneAt(100, { shippingMethod: 'store_pickup', shippingAddress: undefined });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingMethod).toBe('store_pickup');
    expect(res.body.data.order.shippingCost).toBe(0);
    expect(res.body.data.order.total).toBe(100);
  });

  // 2. Standard below regular (non-member) threshold = ₪29.90
  it('Standard costs ₪29.90 below the regular (non-member) free-shipping threshold', async () => {
    const { res } = await buyOneAt(100, { shippingMethod: 'standard' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(29.90);
    expect(res.body.data.order.total).toBe(129.90);
  });

  // 3. Express = ₪49.90
  it('Express always costs ₪49.90', async () => {
    const { res } = await buyOneAt(1000, { shippingMethod: 'express' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(49.90);
    expect(res.body.data.order.total).toBe(1049.90);
  });

  // 4. Regular customer exactly ₪599.00 → Standard free
  it('Standard is free for a non-member at exactly ₪599.00', async () => {
    const { res } = await buyOneAt(599.00, { shippingMethod: 'standard' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(0);
    expect(res.body.data.order.total).toBe(599.00);
  });

  // 5. Regular customer ₪598.99 → ₪29.90
  it('Standard still costs ₪29.90 for a non-member at ₪598.99 (one cent under threshold)', async () => {
    const { res } = await buyOneAt(598.99, { shippingMethod: 'standard' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(29.90);
    expect(res.body.data.order.total).toBe(628.89);
  });

  // 6. Club member exactly ₪299.00 → free
  it('Standard is free for an active Club member at exactly ₪299.00', async () => {
    const product = await seedProduct({ price: 299.00 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);
    await addToCart(accessToken, product._id, 1);
    const res = await createOrder(accessToken, { shippingMethod: 'standard' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(0);
    expect(res.body.data.order.total).toBe(299.00);
  });

  // 7. Club member ₪298.99 → ₪29.90
  it('Standard still costs ₪29.90 for a Club member at ₪298.99 (one cent under member threshold)', async () => {
    const product = await seedProduct({ price: 298.99 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);
    await addToCart(accessToken, product._id, 1);
    const res = await createOrder(accessToken, { shippingMethod: 'standard' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(29.90);
    expect(res.body.data.order.total).toBe(328.89);
  });

  // 8. Club member using Express → still ₪49.90 (never free)
  it('Express is never free, even for an active Club member with a huge subtotal', async () => {
    const product = await seedProduct({ price: 5000 });
    const { accessToken, user } = await registerAndLogin();
    await makeMember(user._id);
    await addToCart(accessToken, product._id, 1);
    const res = await createOrder(accessToken, { shippingMethod: 'express' });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(49.90);
  });

  // 9. Store Pickup free regardless of subtotal (low AND high)
  it('Store Pickup is free regardless of subtotal', async () => {
    const low  = await buyOneAt(5, { shippingMethod: 'store_pickup', shippingAddress: undefined }, { name: 'Store Pickup Low Subtotal Item' });
    expect(low.res.body.data.order.shippingCost).toBe(0);
    const high = await buyOneAt(5000, { shippingMethod: 'store_pickup', shippingAddress: undefined }, { name: 'Store Pickup High Subtotal Item' });
    expect(high.res.body.data.order.shippingCost).toBe(0);
  });

  // 10. Client-provided fake shippingCost cannot override the backend calculation
  it('a client-supplied shippingCost field is ignored — the server always computes its own', async () => {
    const product = await seedProduct({ price: 100 });
    const { accessToken } = await registerAndLogin();
    await addToCart(accessToken, product._id, 1);
    const res = await request(app).post(ORDERS).set('Authorization', `Bearer ${accessToken}`).send({
      shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'Israel' },
      shippingMethod: 'express',
      shippingCost: 0, // attempted manipulation — must be stripped/ignored
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(49.90); // real Express price, not the smuggled 0
  });

  // 11. Invalid shipping method rejected
  it('rejects an unknown shipping method identifier', async () => {
    const product = await seedProduct({ price: 100 });
    const { accessToken } = await registerAndLogin();
    await addToCart(accessToken, product._id, 1);
    const res = await createOrder(accessToken, { shippingMethod: 'home_delivery' }); // old, retired identifier
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 12. International physical-delivery address rejected
  it('rejects Standard/Express delivery to a non-Israeli address', async () => {
    const product = await seedProduct({ price: 100 });
    const { accessToken } = await registerAndLogin();
    await addToCart(accessToken, product._id, 1);
    const res = await createOrder(accessToken, {
      shippingMethod: 'standard',
      shippingAddress: { street: '1 Fifth Ave', city: 'New York', zip: '10001', country: 'United States' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SHIPPING_COUNTRY_NOT_SUPPORTED');
  });

  it('Store Pickup does NOT require an Israeli address (exempt from the country check)', async () => {
    const { res } = await buyOneAt(100, {
      shippingMethod: 'store_pickup',
      shippingAddress: { country: 'United States' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingCost).toBe(0);
  });

  // 13 & 14. Order stores authoritative shippingMethod + shippingCost
  it('the created Order document persists the real shippingMethod and shippingCost', async () => {
    const { res } = await buyOneAt(100, { shippingMethod: 'express' });
    expect(res.status).toBe(201);
    const orderId = res.body.data.order._id;

    const Order = mongoose.model('Order');
    const stored = await Order.findById(orderId);
    expect(stored.shippingMethod).toBe('express');
    expect(stored.shippingCost).toBe(49.90);
  });

  // 15. Stripe/payment amount includes authoritative shipping
  it('the payment amount charged (create-intent + confirm) includes the real shipping cost', async () => {
    const { res, accessToken } = await buyOneAt(100, { shippingMethod: 'standard' });
    expect(res.status).toBe(201);
    const orderId = res.body.data.order._id;
    expect(res.body.data.order.total).toBe(129.90); // 100 + 29.90

    const intentRes = await request(app).post(`${PAYMENTS}/create-intent`).set('Authorization', `Bearer ${accessToken}`).send({ orderId });
    expect(intentRes.status).toBe(200);

    const confirmRes = await payOrder(accessToken, orderId);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.order.paymentStatus).toBe('paid');
    expect(confirmRes.body.data.order.total).toBe(129.90);
    // The actual recorded payment amount (what the customer was really
    // charged) must equal the authoritative Order total — merchandise +
    // real shipping — never a pre-shipping figure.
    expect(confirmRes.body.data.order.paymentHistory.at(-1).amount).toBe(129.90);
  });

  // 16. Coupon does not retroactively strip an already-earned free-shipping benefit
  it('a coupon applied after eligibility is determined does not remove free Standard shipping', async () => {
    const product = await seedProduct({ price: 610 });
    const { accessToken } = await registerAndLogin();

    const Coupon = mongoose.model('Coupon');
    await Coupon.create({
      code: 'SHIP50', type: 'fixed', value: 50, isActive: true, minOrderAmount: 0, usageLimit: null, perUserLimit: 1,
    });

    await addToCart(accessToken, product._id, 1);
    const res = await createOrder(accessToken, { shippingMethod: 'standard', couponCode: 'SHIP50' });
    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.subtotal).toBe(610);
    expect(order.couponDiscount).toBe(50);
    expect(order.shippingCost).toBe(0); // still free — eligibility used the ₪610 subtotal, not ₪560
    expect(order.total).toBe(560); // 610 - 50 + 0
  });

  // 17. Historical Order retains its shipping snapshot (never recomputed on read)
  it('a stored order keeps its original shippingCost snapshot even after being fetched later', async () => {
    const { res, accessToken } = await buyOneAt(100, { shippingMethod: 'standard' }); // below threshold → 29.90
    expect(res.status).toBe(201);
    const orderId = res.body.data.order._id;
    expect(res.body.data.order.shippingCost).toBe(29.90);

    // Re-fetch later — must return the exact same locked-in snapshot, not a
    // live recalculation against current cart/product state.
    const getRes = await request(app).get(`${ORDERS}/${orderId}`).set('Authorization', `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.order.shippingCost).toBe(29.90);
    expect(getRes.body.data.order.shippingMethod).toBe('standard');
  });

  // 18. Manipulated Club status from the client cannot grant the Club threshold
  it('a client-claimed Club/VIP status cannot unlock the lower ₪299 threshold for a real non-member', async () => {
    const product = await seedProduct({ price: 400 }); // between ₪299 and ₪599
    const { accessToken } = await registerAndLogin(); // real membership.status stays 'none'
    await addToCart(accessToken, product._id, 1);

    const res = await request(app).post(ORDERS).set('Authorization', `Bearer ${accessToken}`).send({
      shippingAddress: { street: '1 Main St', city: 'Tel Aviv', zip: '61000', country: 'Israel' },
      shippingMethod: 'standard',
      // Attempted manipulation — no such field exists in the schema, and
      // even if it did, order.service.js resolves membership from the DB.
      isClubMember: true,
      membership: { status: 'active' },
    });
    expect(res.status).toBe(201);
    // Real threshold for a non-member is ₪599 — ₪400 must still be charged.
    expect(res.body.data.order.shippingCost).toBe(29.90);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Legacy compatibility — Orders created before Shipping V1 existed
// ══════════════════════════════════════════════════════════════════════════
describe('Shipping V1 — legacy Order compatibility (pre-Shipping-V1 documents)', () => {
  it('a document built with no shippingMethod at all (as every pre-Shipping-V1 order was) hydrates as null, not a fabricated "standard"', async () => {
    const Order = mongoose.model('Order');
    const { user, accessToken } = await registerAndLogin();
    const product = await seedProduct({ price: 100 });

    // Deliberately does NOT set shippingMethod — this is exactly the shape
    // of every real order created before Shipping V1 existed.
    const legacyOrder = await Order.create({
      orderNumber: `ORD-LEGACY-${Date.now()}`,
      user: user._id,
      items: [{
        itemType: 'product', product: product._id, name: product.name, sku: product.sku,
        unitPrice: 100, quantity: 1, totalPrice: 100,
      }],
      shippingAddress: { street: '1 Legacy St', city: 'Tel Aviv', country: 'Israel' },
      subtotal: 100, taxAmount: 0, shippingCost: 0, total: 100,
      status: 'delivered', paymentStatus: 'paid',
    });

    expect(legacyOrder.shippingMethod).toBeNull();

    // Re-fetch through the real API — a legacy document must be readable
    // without any validation error.
    const getRes = await request(app).get(`${ORDERS}/${legacyOrder._id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.order.shippingMethod).toBeNull();
  });

  it('save()-ing a legacy order (e.g. via cancelOrder, which calls order.save()) does not throw an enum validation error', async () => {
    const Order = mongoose.model('Order');
    const { user, accessToken } = await registerAndLogin();
    const product = await seedProduct({ price: 100, stock: 5 });

    const legacyOrder = await Order.create({
      orderNumber: `ORD-LEGACY-CANCEL-${Date.now()}`,
      user: user._id,
      items: [{
        itemType: 'product', product: product._id, name: product.name, sku: product.sku,
        unitPrice: 100, quantity: 1, totalPrice: 100,
      }],
      shippingAddress: { street: '1 Legacy St', city: 'Tel Aviv', country: 'Israel' },
      subtotal: 100, taxAmount: 0, shippingCost: 0, total: 100,
      status: 'confirmed', paymentStatus: 'paid',
    });
    expect(legacyOrder.shippingMethod).toBeNull();

    const cancelRes = await request(app).patch(`${ORDERS}/${legacyOrder._id}/cancel`).set('Authorization', `Bearer ${accessToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.order.status).toBe('cancelled');
    expect(cancelRes.body.data.order.shippingMethod).toBeNull(); // untouched by cancellation
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shipping address display labels — real Hebrew labels captured going
// forward, without altering the canonical business values Shipping V1 and
// its own country/address validation above (in this same file) rely on.
// ══════════════════════════════════════════════════════════════════════════
describe('Shipping address display labels (countryLabel/cityLabel)', () => {
  it('persists the real cityLabel/countryLabel sent by Checkout, alongside the unchanged canonical values — verified on both the create response AND a fresh GET (not just the request payload)', async () => {
    const { res, accessToken } = await buyOneAt(100, {
      shippingMethod: 'standard',
      shippingAddress: {
        street: 'הרצל 25', city: 'Rehovot', cityLabel: 'רחובות',
        zip: '7650683', country: 'Israel', countryLabel: 'ישראל',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingAddress.country).toBe('Israel'); // canonical value untouched
    expect(res.body.data.order.shippingAddress.city).toBe('Rehovot');   // canonical value untouched
    expect(res.body.data.order.shippingAddress.countryLabel).toBe('ישראל');
    expect(res.body.data.order.shippingAddress.cityLabel).toBe('רחובות');

    // Re-fetch via GET /orders/:id — the same endpoint OrderSuccessPage
    // actually calls — to prove the label round-trips through the DB and
    // the read path too, not just the immediate create response.
    const orderId = res.body.data.order._id;
    const getRes = await request(app).get(`${ORDERS}/${orderId}`).set('Authorization', `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.order.shippingAddress.city).toBe('Rehovot');
    expect(getRes.body.data.order.shippingAddress.cityLabel).toBe('רחובות');
    expect(getRes.body.data.order.shippingAddress.countryLabel).toBe('ישראל');

    const Order = mongoose.model('Order');
    const stored = await Order.findById(orderId);
    expect(stored.shippingAddress.cityLabel).toBe('רחובות');
  });

  it('still creates a valid order when labels are omitted (older client / legacy request shape)', async () => {
    const { res } = await buyOneAt(100, {
      shippingMethod: 'standard',
      shippingAddress: { street: 'הרצל 25', city: 'Rehovot', zip: '', country: 'Israel' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.shippingAddress.countryLabel).toBeFalsy();
    expect(res.body.data.order.shippingAddress.cityLabel).toBeFalsy();
  });

  it('country validation (Israel-only for physical delivery) still works when labels are present', async () => {
    const { res } = await buyOneAt(100, {
      shippingMethod: 'standard',
      shippingAddress: {
        street: '1 Main St', city: 'Paris', cityLabel: 'Paris',
        country: 'France', countryLabel: 'צרפת',
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SHIPPING_COUNTRY_NOT_SUPPORTED');
  });
});
