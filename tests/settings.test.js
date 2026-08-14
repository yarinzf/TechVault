'use strict';

// Integration coverage for the real Settings persistence layer
// (server/models/Settings.js, server/services/settings.service.js,
// GET/PATCH /api/v1/admin/settings and /api/v1/admin/inventory/settings) —
// added to close the "Settings screen claims success but persists nothing"
// gap confirmed by the latest audit for both Admin Settings and Warehouse
// Settings.

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH             = '/api/v1/auth';
const ADMIN_SETTINGS   = '/api/v1/admin/settings';
const WH_SETTINGS      = '/api/v1/admin/inventory/settings';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

// ── Helpers (same conventions as tests/roles.test.js) ──────────────────────────
async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User${suffix}`,
    email:    `${role}${suffix}@settings-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password });
  return res.body.data?.accessToken;
}

async function registerCustomer(suffix) {
  const res = await request(app).post(`${AUTH}/register`).send({
    name: 'Customer', email: `customer${suffix}@settings-test.com`, password: 'Password123!',
  });
  return res.body.data.accessToken;
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN SETTINGS
// ══════════════════════════════════════════════════════════════════════════
describe('Admin Settings — GET/PATCH /admin/settings', () => {
  it('returns documented defaults when no settings document exists yet', async () => {
    await createUserWithRole('admin', '-defaults');
    const token = await loginAs('admin-defaults@settings-test.com');

    const res = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toEqual({
      notifications: { email: true, push: true, sms: false },
      alertTypes: {
        criticalAlerts: true, stockAlerts: true, salesAlerts: true,
        orderAlerts: true, securityAlerts: true,
      },
      thresholds: { highSalesIncrease: 100, salesDecrease: 30, priceChange: 10, orderDelay: 24 },
    });

    // No document was implicitly created by the read.
    const Settings = mongoose.model('Settings');
    expect(await Settings.countDocuments({ scope: 'admin' })).toBe(0);
  });

  it('Admin can read', async () => {
    await createUserWithRole('admin', '-read');
    const token = await loginAs('admin-read@settings-test.com');
    const res = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Super Admin can read', async () => {
    await createUserWithRole('superadmin', '-read');
    const token = await loginAs('superadmin-read@settings-test.com');
    const res = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Warehouse cannot read Admin settings', async () => {
    await createUserWithRole('warehouse', '-read');
    const token = await loginAs('warehouse-read@settings-test.com');
    const res = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('Customer cannot read (and unauthenticated is rejected)', async () => {
    const unauth = await request(app).get(ADMIN_SETTINGS);
    expect(unauth.status).toBe(401);

    const token = await registerCustomer('-read');
    const res = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('Admin can save allowed fields, and the saved values persist and are returned on a subsequent GET', async () => {
    await createUserWithRole('admin', '-save');
    const token = await loginAs('admin-save@settings-test.com');

    const patchRes = await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({
        notifications: { sms: true },
        thresholds: { orderDelay: 48 },
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.settings.notifications).toEqual({ email: true, push: true, sms: true });
    expect(patchRes.body.data.settings.thresholds.orderDelay).toBe(48);
    // Untouched sibling fields keep their defaults — a partial nested update
    // must not clobber the rest of the sub-object.
    expect(patchRes.body.data.settings.thresholds.salesDecrease).toBe(30);

    const getRes = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.settings.notifications.sms).toBe(true);
    expect(getRes.body.data.settings.thresholds.orderDelay).toBe(48);

    // Exactly one document — never a delete+recreate/duplicate.
    const Settings = mongoose.model('Settings');
    expect(await Settings.countDocuments({ scope: 'admin' })).toBe(1);
  });

  it('rejects an unknown/invalid field (strict allowlist contract)', async () => {
    await createUserWithRole('admin', '-invalid');
    const token = await loginAs('admin-invalid@settings-test.com');

    const res = await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ jwtSecret: 'should-never-be-writable-here' });
    expect(res.status).toBe(422); // Joi validation error — matches this codebase's existing convention

    // Nothing was persisted from the rejected request.
    const Settings = mongoose.model('Settings');
    expect(await Settings.countDocuments({ scope: 'admin' })).toBe(0);
  });

  it('rejects an out-of-range threshold value', async () => {
    await createUserWithRole('admin', '-range');
    const token = await loginAs('admin-range@settings-test.com');

    const res = await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ thresholds: { salesDecrease: 500 } }); // max is 100
    expect(res.status).toBe(422);
  });

  it('Warehouse cannot update Admin settings', async () => {
    await createUserWithRole('warehouse', '-nowrite');
    const token = await loginAs('warehouse-nowrite@settings-test.com');
    const res = await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ notifications: { sms: true } });
    expect(res.status).toBe(403);
  });

  it('Customer cannot update', async () => {
    const token = await registerCustomer('-nowrite');
    const res = await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ notifications: { sms: true } });
    expect(res.status).toBe(403);
  });

  it('logs a settings.updated audit entry with actor, scope, before, and after', async () => {
    const admin = await createUserWithRole('admin', '-audit');
    const token = await loginAs('admin-audit@settings-test.com');

    await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ alertTypes: { securityAlerts: false } });

    const AuditLog = mongoose.model('AuditLog');
    const entry = await AuditLog.findOne({ action: 'settings.updated', actorId: admin._id });
    expect(entry).not.toBeNull();
    expect(entry.metadata.scope).toBe('admin');
    expect(entry.before.alertTypes.securityAlerts).toBe(true);
    expect(entry.after.alertTypes.securityAlerts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// WAREHOUSE SETTINGS
// ══════════════════════════════════════════════════════════════════════════
describe('Warehouse Settings — GET/PATCH /admin/inventory/settings', () => {
  it('returns documented defaults when no settings document exists yet', async () => {
    await createUserWithRole('warehouse', '-defaults');
    const token = await loginAs('warehouse-defaults@settings-test.com');

    const res = await request(app).get(WH_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toEqual({
      minStockDefault: 10,
      alertEmail: '',
      lowStockAlert: true,
      supplierNotify: true,
      autoOrder: false,
    });
  });

  it('Warehouse can read', async () => {
    await createUserWithRole('warehouse', '-read');
    const token = await loginAs('warehouse-read@settings-test.com');
    const res = await request(app).get(WH_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Admin can read (STAFF_ROLES hierarchy permits it, matching every other /admin/inventory/* route)', async () => {
    await createUserWithRole('admin', '-whread');
    const token = await loginAs('admin-whread@settings-test.com');
    const res = await request(app).get(WH_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Super Admin can read', async () => {
    await createUserWithRole('superadmin', '-whread');
    const token = await loginAs('superadmin-whread@settings-test.com');
    const res = await request(app).get(WH_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Customer cannot read', async () => {
    const token = await registerCustomer('-whread');
    const res = await request(app).get(WH_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('Warehouse can save allowed Warehouse settings, and the values persist', async () => {
    await createUserWithRole('warehouse', '-save');
    const token = await loginAs('warehouse-save@settings-test.com');

    const patchRes = await request(app)
      .patch(WH_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ minStockDefault: 25, alertEmail: 'ops@techvault.co.il', autoOrder: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.settings.minStockDefault).toBe(25);
    expect(patchRes.body.data.settings.alertEmail).toBe('ops@techvault.co.il');
    expect(patchRes.body.data.settings.autoOrder).toBe(true);
    // Untouched fields keep their defaults.
    expect(patchRes.body.data.settings.lowStockAlert).toBe(true);

    const getRes = await request(app).get(WH_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.data.settings.minStockDefault).toBe(25);

    const Settings = mongoose.model('Settings');
    expect(await Settings.countDocuments({ scope: 'warehouse' })).toBe(1);
  });

  it('rejects an invalid alertEmail value', async () => {
    await createUserWithRole('warehouse', '-bademail');
    const token = await loginAs('warehouse-bademail@settings-test.com');
    const res = await request(app)
      .patch(WH_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ alertEmail: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  it('Customer cannot update', async () => {
    const token = await registerCustomer('-whnowrite');
    const res = await request(app)
      .patch(WH_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ autoOrder: true });
    expect(res.status).toBe(403);
  });

  it('Warehouse writing its own settings never touches (or unlocks) the Admin settings scope', async () => {
    await createUserWithRole('warehouse', '-isolation');
    const token = await loginAs('warehouse-isolation@settings-test.com');

    await request(app)
      .patch(WH_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ minStockDefault: 99 });

    // The same warehouse token still cannot read or write the admin scope.
    const adminGet = await request(app).get(ADMIN_SETTINGS).set('Authorization', `Bearer ${token}`);
    expect(adminGet.status).toBe(403);
    const adminPatch = await request(app)
      .patch(ADMIN_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ notifications: { sms: true } });
    expect(adminPatch.status).toBe(403);

    // And no admin-scope document was ever created as a side effect.
    const Settings = mongoose.model('Settings');
    expect(await Settings.countDocuments({ scope: 'admin' })).toBe(0);
    expect(await Settings.countDocuments({ scope: 'warehouse' })).toBe(1);
  });

  it('logs a settings.updated audit entry scoped to "warehouse"', async () => {
    const warehouse = await createUserWithRole('warehouse', '-audit');
    const token = await loginAs('warehouse-audit@settings-test.com');

    await request(app)
      .patch(WH_SETTINGS)
      .set('Authorization', `Bearer ${token}`)
      .send({ lowStockAlert: false });

    const AuditLog = mongoose.model('AuditLog');
    const entry = await AuditLog.findOne({ action: 'settings.updated', actorId: warehouse._id });
    expect(entry).not.toBeNull();
    expect(entry.metadata.scope).toBe('warehouse');
    expect(entry.before.lowStockAlert).toBe(true);
    expect(entry.after.lowStockAlert).toBe(false);
  });
});
