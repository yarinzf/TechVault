'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH  = '/api/v1/auth';
const ENDPOINT = '/api/v1/admin/system/status';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

async function createUserWithRole(role) {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User`,
    email:    `${role}@sys-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email) {
  const res = await request(app)
    .post(`${AUTH}/login`)
    .send({ email, password: 'Password123!' });
  return res.body.data?.accessToken;
}

describe('GET /admin/system/status', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular user', async () => {
    const reg = await request(app).post(`${AUTH}/register`).send({
      name: 'Customer', email: 'cust@sys-test.com', password: 'Password123!',
    });
    const token = reg.body.data.accessToken;

    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows admin to access and returns expected shape', async () => {
    await createUserWithRole('admin');
    const token = await loginAs('admin@sys-test.com');

    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const d = res.body.data;
    expect(d.status).toBe('healthy');
    expect(d.version).toBeDefined();
    expect(d.node).toBeDefined();
    expect(d.mongodb.status).toBe('connected');
    expect(d.memory.heapUsedPct).toBeDefined();
    expect(d.backups).toBeDefined();
    expect(d.backups.s3).toBeDefined();
    expect(typeof d.backups.s3.configured).toBe('boolean');
    expect(typeof d.backups.s3.reachable).toBe('boolean');
    expect(d.system).toBeDefined();
    expect(d.timestamp).toBeDefined();
  });

  it('does not expose secrets or file contents', async () => {
    await createUserWithRole('superadmin');
    const token = await loginAs('superadmin@sys-test.com');

    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${token}`);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/password/i);
    expect(raw).not.toMatch(/secret/i);
    expect(raw).not.toMatch(/JWT_/);
    expect(raw).not.toMatch(/COOKIE_/);
    expect(raw).not.toMatch(/MONGO_URI/);
  });
});
