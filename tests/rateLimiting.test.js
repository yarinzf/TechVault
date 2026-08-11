'use strict';

// The global test-mode default (server/middleware/rateLimiter.js#resolveMax)
// is 100_000 — effectively unlimited — so every OTHER test file's requests
// never risk a real 429. This file deliberately sets a small, real override
// for just the two limiters it needs to exhaust, BEFORE first requiring
// server/config/env / server/middleware/rateLimiter (each Jest test file
// gets its own isolated module registry, so this only affects requires made
// from within THIS file). Cleaned up in afterAll since process.env itself is
// a genuinely global, shared object across test files running --runInBand.
process.env.RATE_LIMIT_MAX = '6';       // generalLimiter override — small, real, testable
process.env.AUTH_RATE_LIMIT_MAX = '3';  // authLimiter override — small, real, testable

const request = require('supertest');
const express = require('express');
const { generalLimiter, authLimiter } = require('../server/middleware/rateLimiter');

// A minimal standalone app — NOT server/app.js — exercising the REAL,
// production rate-limiter middleware instances directly, without pulling in
// the full route/controller/Mongoose graph this test doesn't need. Mirrors
// the two production-relevant details exactly: `trust proxy: 2` (the actual
// 2-hop topology from server/app.js) and mounting generalLimiter at '/api'
// before route handlers, with '/health' exempted exactly like the real app.
function buildApp() {
  const app = express();
  app.set('trust proxy', 2);
  app.use(express.json());
  app.use('/api', generalLimiter);
  app.get('/api/v1/health', (req, res) => res.status(200).json({ success: true, data: { status: 'healthy' } }));
  app.get('/api/v1/products', (req, res) => res.status(200).json({ success: true, data: [] }));
  app.post('/api/v1/auth/login', authLimiter, (req, res) =>
    res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }));
  return app;
}

const app = buildApp();

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.AUTH_RATE_LIMIT_MAX;
});

const HOP = '10.0.0.5'; // simulated shared internal proxy hop, same on every request
const withIp = (req, ip) => req.set('X-Forwarded-For', `${ip}, ${HOP}`);

const getAs = (ip, path) => withIp(request(app).get(path), ip);
const loginAs = (ip) =>
  withIp(request(app).post('/api/v1/auth/login'), ip).send({ email: 'nobody@example.com', password: 'wrong-password' });

describe('rate limiting — endpoint-aware architecture', () => {
  it('1. a rapid public GET burst within the general budget never 429s — a normal reload/browsing burst is not blocked', async () => {
    const ip = '203.0.113.101';
    // RATE_LIMIT_MAX=6 for this file — exactly the override, all must pass.
    for (let i = 0; i < 6; i++) {
      const res = await getAs(ip, '/api/v1/products');
      expect(res.status).not.toBe(429);
    }
  });

  it('2. an auth-sensitive endpoint (login) still rate-limits abusive requests once its own budget is exhausted', async () => {
    const ip = '203.0.113.102';
    // AUTH_RATE_LIMIT_MAX=3 for this file — burn it, then the next call 429s.
    await loginAs(ip);
    await loginAs(ip);
    await loginAs(ip);
    const res = await loginAs(ip);
    expect(res.status).toBe(429);
  });

  it('3. different client IPs get independent buckets for the general limiter', async () => {
    const a1 = await getAs('203.0.113.103', '/api/v1/products');
    const a2 = await getAs('203.0.113.103', '/api/v1/products');
    const b1 = await getAs('203.0.113.104', '/api/v1/products');

    // Client A's two hits must not have touched client B's independent bucket.
    expect(Number(a2.headers['ratelimit-remaining'])).toBe(Number(a1.headers['ratelimit-remaining']) - 1);
    expect(Number(b1.headers['ratelimit-remaining'])).toBe(5); // fresh bucket, max 6, first hit
  });

  it('4. the SAME public IP intentionally shares one bucket where the limiter is IP-based (two devices, one NAT/public IP)', async () => {
    // Two "devices" behind the same public IP — no per-device distinguishing
    // header — must collapse onto the same bucket, by design.
    const ip = '203.0.113.105';
    const device1 = await getAs(ip, '/api/v1/products');
    const device2 = await getAs(ip, '/api/v1/products');
    expect(Number(device2.headers['ratelimit-remaining'])).toBe(Number(device1.headers['ratelimit-remaining']) - 1);
  });

  it('5. trust proxy resolves the real client IP through the 2-hop production topology for the general (non-auth) limiter too', async () => {
    // Same shared internal hop (10.0.0.5) behind two DIFFERENT real clients —
    // proves IP resolution isn't collapsing everyone onto the hop address
    // for generalLimiter specifically (tests/trustProxy.test.js already
    // proves this for authLimiter/login).
    const c1a = await getAs('203.0.113.106', '/api/v1/products');
    const c1b = await getAs('203.0.113.106', '/api/v1/products');
    const c2a = await getAs('203.0.113.107', '/api/v1/products');

    expect(Number(c1b.headers['ratelimit-remaining'])).toBe(Number(c1a.headers['ratelimit-remaining']) - 1);
    // A fresh different client sees a fresh bucket, not client 1's drained one.
    expect(Number(c2a.headers['ratelimit-remaining'])).toBe(5);
  });

  it('6. a 429 response has the expected contract: success:false, error.code, message, and both a Retry-After header and body field', async () => {
    const ip = '203.0.113.108';
    await loginAs(ip);
    await loginAs(ip);
    await loginAs(ip);
    const res = await loginAs(ip);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.any(String),
        details: [],
      },
    });
    expect(typeof res.body.error.retryAfter).toBe('number');
    expect(res.body.error.retryAfter).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBe(res.body.error.retryAfter);
    // No sensitive information leaked in a rate-limit response.
    expect(JSON.stringify(res.body)).not.toMatch(/password|token|secret/i);
  });

  it('7. the health endpoint remains available even for a client that has fully exhausted the general limiter', async () => {
    const ip = '203.0.113.109';
    for (let i = 0; i < 8; i++) { // exceed the 6-request general budget
      await getAs(ip, '/api/v1/products');
    }
    const health = await getAs(ip, '/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.data.status).toBe('healthy');
  });
});
