'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH  = '/api/v1/auth';
const ADMIN = '/api/v1/admin';
const WAREHOUSE_ORDERS = '/api/v1/orders/all';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User${suffix}`,
    email:    `${role}${suffix}@roles-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app)
    .post(`${AUTH}/login`)
    .send({ email, password });
  return res.body.data?.accessToken;
}

// ── Admin-only route (/admin/dashboard requires admin|superadmin) ─────────────

describe('Admin dashboard — role protection', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`${ADMIN}/dashboard`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular user', async () => {
    const reg   = await request(app).post(`${AUTH}/register`).send({
      name: 'Customer', email: 'customer@roles-test.com', password: 'Password123!',
    });
    const token = reg.body.data.accessToken;

    const res = await request(app)
      .get(`${ADMIN}/dashboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows admin role to access dashboard', async () => {
    await createUserWithRole('admin');
    const token = await loginAs('admin@roles-test.com');

    const res = await request(app)
      .get(`${ADMIN}/dashboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('allows superadmin role to access dashboard', async () => {
    await createUserWithRole('superadmin');
    const token = await loginAs('superadmin@roles-test.com');

    const res = await request(app)
      .get(`${ADMIN}/dashboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ── Warehouse order listing (requires admin|superadmin|warehouse) ─────────────

describe('Warehouse orders listing — role protection', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(WAREHOUSE_ORDERS);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular user', async () => {
    const reg   = await request(app).post(`${AUTH}/register`).send({
      name: 'Just a Buyer', email: 'buyer@roles-test.com', password: 'Password123!',
    });
    const token = reg.body.data.accessToken;

    const res = await request(app)
      .get(WAREHOUSE_ORDERS)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows warehouse role to list orders', async () => {
    await createUserWithRole('warehouse');
    const token = await loginAs('warehouse@roles-test.com');

    const res = await request(app)
      .get(WAREHOUSE_ORDERS)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.orders)).toBe(true);
  });

  it('allows admin role to list orders', async () => {
    await createUserWithRole('admin', '2');
    const token = await loginAs('admin2@roles-test.com');

    const res = await request(app)
      .get(WAREHOUSE_ORDERS)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
