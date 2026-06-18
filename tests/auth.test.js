'use strict';

const request = require('supertest');
const { connect, clearAll } = require('./helpers/db');

let app;
const BASE = '/api/v1/auth';

const VALID_USER = {
  name:     'Test User',
  email:    'testuser@example.com',
  password: 'Password123!',
};

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

// ── Registration ──────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('creates account and returns access token + user object', async () => {
    const res = await request(app).post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const res = await request(app).post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects short password with 422', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'Bad User', email: 'bad@example.com', password: 'short',
    });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing email with 422', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'No Email', password: 'Password123!',
    });
    expect(res.status).toBe(422);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
  });

  it('returns access token on correct credentials', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email:    VALID_USER.email,
      password: VALID_USER.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(VALID_USER.email);
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email:    VALID_USER.email,
      password: 'WrongPassword999!',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email:    'nobody@nowhere.com',
      password: 'Password123!',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when email field is missing', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      password: 'Password123!',
    });
    expect(res.status).toBe(422);
  });
});

// ── /me (profile) ─────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('returns profile when authenticated', async () => {
    const reg   = await request(app).post(`${BASE}/register`).send(VALID_USER);
    const token = reg.body.data.accessToken;

    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
