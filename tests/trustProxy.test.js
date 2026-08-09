'use strict';

const request = require('supertest');
const { connect, clearAll } = require('./helpers/db');

let app;

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

const LOGIN = '/api/v1/auth/login';

// Production sits behind exactly 2 reverse-proxy hops (host Nginx, then the
// frontend container's Nginx) before reaching Express — see server/app.js's
// `trust proxy` setting. Each hop appends its own address to X-Forwarded-For,
// so a real production request arrives as "<realClientIp>, <hopIp>". These
// tests simulate that exact shape to prove Express resolves req.ip (and thus
// express-rate-limit's per-client bucket) to the real client, not the shared
// internal hop address that caused every visitor to collapse onto one bucket.
const asProdRequest = (clientIp) =>
  request(app)
    .post(LOGIN)
    .set('X-Forwarded-For', `${clientIp}, 10.0.0.5`) // 10.0.0.5 = simulated shared internal hop
    .send({ email: 'nobody@example.com', password: 'wrong-password' });

describe('trust proxy — production 2-hop reverse proxy resolves the real client IP', () => {
  it('two requests from the SAME real client (behind the shared internal hop) share one rate-limit bucket', async () => {
    const r1 = await asProdRequest('203.0.113.10');
    const r2 = await asProdRequest('203.0.113.10');

    const remaining1 = Number(r1.headers['ratelimit-remaining']);
    const remaining2 = Number(r2.headers['ratelimit-remaining']);

    expect(Number.isNaN(remaining1)).toBe(false);
    expect(remaining2).toBe(remaining1 - 1);
  });

  it('requests from a DIFFERENT real client behind the same shared internal hop get an independent bucket', async () => {
    // Burn down some other client's bucket first — must have zero effect on client B below.
    await asProdRequest('203.0.113.20');
    await asProdRequest('203.0.113.20');

    const b1 = await asProdRequest('203.0.113.21');
    const b2 = await asProdRequest('203.0.113.21');

    // Client B's remaining only ever drops by exactly 1 per its OWN request —
    // if IP resolution were broken (collapsing to the shared hop address),
    // client A's two prior hits would already show up in client B's count.
    expect(Number(b2.headers['ratelimit-remaining']))
      .toBe(Number(b1.headers['ratelimit-remaining']) - 1);
  });

  it('a direct request with no proxy headers at all (as in local dev) still reaches real auth logic, unaffected by trust proxy', async () => {
    const res = await request(app)
      .post(LOGIN)
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

    // No X-Forwarded-For to evaluate — trust proxy is a no-op, request is
    // handled and rate-limited per the direct connection, exactly as before.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});
