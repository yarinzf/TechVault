'use strict';

const request = require('supertest');
const { connect } = require('./helpers/db');

let app;

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok and db connected', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe('connected');
    expect(typeof res.body.data.uptime).toBe('number');
  });
});

describe('404 for unknown routes', () => {
  it('returns 404 JSON for an unknown path', async () => {
    const res = await request(app).get('/api/v1/does-not-exist-xyz');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
