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

// ── Admin returns listing (widened to STAFF_ROLES so warehouse can see ────────
//    returns awaiting physical inspection — write actions stay admin-only) ────

describe('Admin returns listing — role protection (STAFF_ROLES read, ADMIN_ROLES write)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`${ADMIN}/returns`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular customer', async () => {
    const reg   = await request(app).post(`${AUTH}/register`).send({
      name: 'Just a Buyer', email: 'buyer-returns@roles-test.com', password: 'Password123!',
    });
    const token = reg.body.data.accessToken;

    const res = await request(app)
      .get(`${ADMIN}/returns`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows warehouse role to list returns (new — was ADMIN_ROLES-only before the reorg)', async () => {
    await createUserWithRole('warehouse', '-returns');
    const token = await loginAs('warehouse-returns@roles-test.com');

    const res = await request(app)
      .get(`${ADMIN}/returns`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows admin role to list returns', async () => {
    await createUserWithRole('admin', '-returns');
    const token = await loginAs('admin-returns@roles-test.com');

    const res = await request(app)
      .get(`${ADMIN}/returns`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('blocks warehouse from approving a return (financial/business decision stays ADMIN_ROLES-only)', async () => {
    await createUserWithRole('warehouse', '-approve');
    const token = await loginAs('warehouse-approve@roles-test.com');

    const res = await request(app)
      .patch(`${ADMIN}/returns/${new mongoose.Types.ObjectId()}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('blocks warehouse from processing a refund (financial decision stays ADMIN_ROLES-only)', async () => {
    await createUserWithRole('warehouse', '-refund');
    const token = await loginAs('warehouse-refund@roles-test.com');

    const res = await request(app)
      .patch(`${ADMIN}/returns/${new mongoose.Types.ObjectId()}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── Direct API authorization matrix ────────────────────────────────────────────
// Real, existing endpoints only (no invented routes) — proves the boundary is
// enforced at the API layer itself, not just by hiding a nav link. GET
// /admin/system/status's superadmin-only gating already has dedicated,
// thorough coverage in tests/systemStatus.test.js (including a plain-admin
// 403 case) — not repeated here to avoid duplicating that suite.

describe('Superadmin-only user management API — role protection', () => {
  it('GET /admin/users returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`${ADMIN}/users`);
    expect(res.status).toBe(401);
  });

  it('GET /admin/users returns 403 for a regular customer', async () => {
    const reg = await request(app).post(`${AUTH}/register`).send({
      name: 'Just a Buyer', email: 'buyer-users@roles-test.com', password: 'Password123!',
    });
    const res = await request(app)
      .get(`${ADMIN}/users`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/users returns 403 for warehouse (staff, but not superadmin)', async () => {
    await createUserWithRole('warehouse', '-users');
    const token = await loginAs('warehouse-users@roles-test.com');
    const res = await request(app).get(`${ADMIN}/users`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/users returns 403 for a plain admin — user/role management is superadmin-exclusive', async () => {
    await createUserWithRole('admin', '-users');
    const token = await loginAs('admin-users@roles-test.com');
    const res = await request(app).get(`${ADMIN}/users`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/users returns 200 for superadmin', async () => {
    await createUserWithRole('superadmin', '-users');
    const token = await loginAs('superadmin-users@roles-test.com');
    const res = await request(app).get(`${ADMIN}/users`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.users)).toBe(true);
  });

  it('PATCH /admin/users/:id returns 403 for a plain admin attempting a role change', async () => {
    await createUserWithRole('admin', '-patch-actor');
    const token  = await loginAs('admin-patch-actor@roles-test.com');
    const target = await createUserWithRole('warehouse', '-patch-target');

    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);

    const fresh = await mongoose.model('User').findById(target._id);
    expect(fresh.role).toBe('warehouse'); // untouched
  });

  it('DELETE /admin/users/:id/sessions (force logout) returns 403 for a plain admin', async () => {
    await createUserWithRole('admin', '-fl-actor');
    const token  = await loginAs('admin-fl-actor@roles-test.com');
    const target = await createUserWithRole('warehouse', '-fl-target');

    const res = await request(app)
      .delete(`${ADMIN}/users/${target._id}/sessions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Admin business-management API — blocked for Warehouse, allowed for Admin/Superadmin', () => {
  it('GET /admin/campaigns returns 403 for warehouse (business management stays out of warehouse scope)', async () => {
    await createUserWithRole('warehouse', '-campaigns');
    const token = await loginAs('warehouse-campaigns@roles-test.com');
    const res = await request(app).get(`${ADMIN}/campaigns`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/campaigns returns 200 for admin', async () => {
    await createUserWithRole('admin', '-campaigns');
    const token = await loginAs('admin-campaigns@roles-test.com');
    const res = await request(app).get(`${ADMIN}/campaigns`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET /admin/campaigns returns 200 for superadmin (inherited Admin access)', async () => {
    await createUserWithRole('superadmin', '-campaigns');
    const token = await loginAs('superadmin-campaigns@roles-test.com');
    const res = await request(app).get(`${ADMIN}/campaigns`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Warehouse operational API — reachable by Warehouse/Admin/Superadmin, blocked for Customer', () => {
  it('GET /admin/inventory/list returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`${ADMIN}/inventory/list`);
    expect(res.status).toBe(401);
  });

  it('GET /admin/inventory/list returns 403 for a regular customer', async () => {
    const reg = await request(app).post(`${AUTH}/register`).send({
      name: 'Just a Buyer', email: 'buyer-inv@roles-test.com', password: 'Password123!',
    });
    const res = await request(app)
      .get(`${ADMIN}/inventory/list`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/inventory/list returns 200 for warehouse, admin, and superadmin alike', async () => {
    for (const role of ['warehouse', 'admin', 'superadmin']) {
      await createUserWithRole(role, `-inv-${role}`);
      const token = await loginAs(`${role}-inv-${role}@roles-test.com`);
      const res = await request(app).get(`${ADMIN}/inventory/list`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });
});
