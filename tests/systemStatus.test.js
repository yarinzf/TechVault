'use strict';

const os       = require('os');
const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

// Mock os.totalmem/freemem to stable values representing a healthy 4 GB machine
// with 2 GB free — well within healthy thresholds regardless of actual test host.
jest.spyOn(os, 'totalmem').mockReturnValue(4 * 1024 * 1024 * 1024);
jest.spyOn(os, 'freemem').mockReturnValue(2 * 1024 * 1024 * 1024);

let app;
const AUTH     = '/api/v1/auth';
const ENDPOINT = '/api/v1/admin/system/status';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

async function createUserWithRole(role) {
  return mongoose.model('User').create({
    name: `${role} User`, email: `${role}@sys-test.com`, password: 'Password123!', role,
  });
}

async function loginAs(email) {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password: 'Password123!' });
  return res.body.data?.accessToken;
}

async function adminGet() {
  await createUserWithRole('admin');
  const token = await loginAs('admin@sys-test.com');
  return request(app).get(ENDPOINT).set('Authorization', `Bearer ${token}`);
}

// ── Auth ────────────────────────────────────────────────────────────────────

describe('GET /admin/system/status — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    expect((await request(app).get(ENDPOINT)).status).toBe(401);
  });

  it('returns 403 for a regular user', async () => {
    const reg = await request(app).post(`${AUTH}/register`).send({
      name: 'Customer', email: 'cust@sys-test.com', password: 'Password123!',
    });
    const res = await request(app).get(ENDPOINT)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('allows admin access', async () => {
    expect((await adminGet()).status).toBe(200);
  });
});

// ── Response shape ──────────────────────────────────────────────────────────

describe('GET /admin/system/status — response shape', () => {
  it('returns complete structured response', async () => {
    const { body: { data: d } } = await adminGet();

    expect(['healthy', 'warning', 'critical']).toContain(d.status);
    expect(d.version).toBeDefined();
    expect(d.node).toMatch(/^v\d+/);
    expect(d.uptime).toBeGreaterThanOrEqual(0);
    expect(d.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(d.mongodb.status).toBe('connected');
    expect(d.mongodb.readyState).toBe(1);

    expect(d.memory.status).toBeDefined();
    expect(d.memory.rss).toMatch(/MB$/);
    expect(d.memory.heapUsed).toMatch(/MB$/);
    expect(d.memory.heapTotal).toMatch(/MB$/);
    expect(d.memory.heapUsedPct).toMatch(/%$/);

    expect(d.system.ramTotal).toBe('4096.0 MB');
    expect(d.system.ramFree).toBe('2048.0 MB');
    expect(d.system.ramUsedPct).toBe('50.0%');
    expect(d.system.cpus).toBeGreaterThan(0);

    expect(d.backups.local).toBeDefined();
    expect(d.backups.local.status).toBeDefined();
    expect(d.backups.s3).toBeDefined();
    expect(d.backups.s3.status).toBeDefined();
    expect(typeof d.backups.s3.configured).toBe('boolean');
    expect(typeof d.backups.s3.lastUploadConfirmed).toBe('boolean');

    expect(d.healthCheck).toBeDefined();
    expect(d.healthCheck.status).toBeDefined();
  });
});

// ── Security ────────────────────────────────────────────────────────────────

describe('GET /admin/system/status — security', () => {
  it('does not expose secrets or sensitive values', async () => {
    await createUserWithRole('superadmin');
    const token = await loginAs('superadmin@sys-test.com');
    const raw = JSON.stringify(
      (await request(app).get(ENDPOINT).set('Authorization', `Bearer ${token}`)).body,
    );
    expect(raw).not.toMatch(/password/i);
    expect(raw).not.toMatch(/secret/i);
    expect(raw).not.toMatch(/JWT_/);
    expect(raw).not.toMatch(/COOKIE_/);
    expect(raw).not.toMatch(/MONGO_URI/);
    expect(raw).not.toMatch(/BEGIN.*PRIVATE/);
  });
});

// ── Graceful degradation ────────────────────────────────────────────────────

describe('GET /admin/system/status — graceful degradation', () => {
  it('returns unavailable for missing backup dir', async () => {
    const { body: { data: d } } = await adminGet();
    expect(d.backups.local.available).toBe(false);
    expect(['unavailable', 'warning']).toContain(d.backups.local.status);
  });

  it('returns unavailable for missing health-check log', async () => {
    const { body: { data: d } } = await adminGet();
    expect(d.healthCheck.lastResult).toBeNull();
    expect(d.healthCheck.status).toBe('unavailable');
  });

  it('returns unavailable S3 when env var is absent', async () => {
    const { body: { data: d } } = await adminGet();
    expect(d.backups.s3.configured).toBe(false);
    expect(d.backups.s3.lastUploadConfirmed).toBe(false);
    expect(d.backups.s3.status).toBe('unavailable');
  });

  it('does not crash when all external data is missing', async () => {
    const res = await adminGet();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Status derivation ───────────────────────────────────────────────────────

describe('GET /admin/system/status — status derivation', () => {
  it('is healthy when DB is connected and no production issues', async () => {
    const { body: { data: d } } = await adminGet();
    expect(d.mongodb.status).toBe('connected');
    expect(d.status).toBe('healthy');
  });

  it('memory status is healthy under normal conditions', async () => {
    const { body: { data: d } } = await adminGet();
    expect(d.memory.status).toBe('healthy');
  });
});
