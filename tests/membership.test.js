'use strict';

const request  = require('supertest');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');

let app;
const AUTH  = '/api/v1/auth';
const ADMIN = '/api/v1/admin';

beforeAll(async () => {
  await connect();
  app = require('../server/app');
});

afterEach(clearAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerUser(overrides = {}) {
  const res = await request(app).post(`${AUTH}/register`).send({
    name:     'Membership Tester',
    email:    'member-tester@example.com',
    password: 'Password123!',
    ...overrides,
  });
  return res.body.data;
}

async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User${suffix}`,
    email:    `${role}${suffix}@membership-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password });
  return res.body.data?.accessToken;
}

// ── Defaults on new users ───────────────────────────────────────────────────────

describe('New user membership defaults', () => {
  it('defaults to status "none" with zeroed points and no join date', async () => {
    const { user } = await registerUser();

    expect(user.membership).toBeDefined();
    expect(user.membership.status).toBe('none');
    expect(user.membership.points).toBe(0);
    expect(user.membership.lifetimePoints).toBe(0);
    expect(user.membership.joinedAt).toBeNull();
    expect(user.membership.notificationPreference).toBe('none');
  });

  it('does not touch the authorization role', async () => {
    const { user } = await registerUser();
    expect(user.role).toBe('user');
  });
});

// ── Backward compatibility with pre-existing documents ──────────────────────────

describe('Legacy documents without a membership field', () => {
  it('normalizes a document written before the membership field existed', async () => {
    const User = mongoose.model('User');

    // Bypass the schema (and its defaults) to simulate a document created
    // before `membership` existed, the way it would actually look in prod.
    const raw = await User.collection.insertOne({
      name: 'Legacy User',
      email: 'legacy@example.com',
      password: '$2a$12$abcdefghijklmnopqrstuv', // unusable hash, irrelevant here
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const found = await User.findById(raw.insertedId);
    const json  = found.toJSON();

    expect(json.membership).toEqual({
      status: 'none',
      plan: null,
      joinedAt: null,
      startedAt: null,
      expiresAt: null,
      points: 0,
      lifetimePoints: 0,
      notificationPreference: 'none',
    });
  });

  it('normalizes a legacy document even when read with .lean()', async () => {
    const User = mongoose.model('User');
    const raw = await User.collection.insertOne({
      name: 'Legacy Lean User',
      email: 'legacy-lean@example.com',
      password: '$2a$12$abcdefghijklmnopqrstuv',
      role: 'user',
      isActive: true,
    });

    const lean = await User.findById(raw.insertedId).lean();
    expect(lean.membership).toBeUndefined(); // lean bypasses hydration defaults — expected

    // The API layer must never return a lean-read user directly without
    // going through toJSON(); this test documents why the transform-based
    // normalization (not schema defaults alone) is required for safety.
    const hydrated = await User.findById(raw.insertedId);
    expect(hydrated.toJSON().membership.status).toBe('none');
  });
});

// ── Exposure through authenticated user responses ────────────────────────────────

describe('Membership exposure on authenticated user data', () => {
  it('returns membership on GET /auth/me', async () => {
    const { accessToken } = await registerUser();

    const res = await request(app)
      .get(`${AUTH}/me`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.membership.status).toBe('none');
  });

  it('reflects an active membership set directly on the model', async () => {
    const User = mongoose.model('User');
    await registerUser({ email: 'active-member@example.com' });

    // A real membership always needs a real expiresAt (see
    // isMembershipActive / the legacy grandfather-rule removal) — status
    // 'active' with no expiresAt is malformed data, not permanently VIP.
    await User.findOneAndUpdate(
      { email: 'active-member@example.com' },
      {
        $set: {
          'membership.status': 'active',
          'membership.plan': 'annual',
          'membership.joinedAt': new Date('2026-01-15'),
          'membership.startedAt': new Date('2026-01-15'),
          'membership.expiresAt': new Date(Date.now() + 30 * 86400000),
          'membership.points': 120,
          'membership.lifetimePoints': 120,
          'membership.notificationPreference': 'both',
        },
      }
    );

    const token = await loginAs('active-member@example.com');
    const res = await request(app)
      .get(`${AUTH}/me`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { membership } = res.body.data.user;
    expect(membership.status).toBe('active');
    expect(membership.points).toBe(120);
    expect(membership.lifetimePoints).toBe(120);
    expect(membership.notificationPreference).toBe('both');
    expect(new Date(membership.joinedAt).toISOString()).toBe(new Date('2026-01-15').toISOString());
  });

  it('active membership does not grant elevated role/authorization', async () => {
    const User = mongoose.model('User');
    await registerUser({ email: 'still-a-user@example.com' });
    await User.findOneAndUpdate(
      { email: 'still-a-user@example.com' },
      { $set: { 'membership.status': 'active' } }
    );

    const token = await loginAs('still-a-user@example.com');

    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${token}`);
    expect(me.body.data.user.role).toBe('user');

    const admin = await request(app).get(`${ADMIN}/dashboard`).set('Authorization', `Bearer ${token}`);
    expect(admin.status).toBe(403);
  });
});

// ── Admin-controlled activation (no public self-service endpoint) ───────────────

describe('PATCH /admin/users/:id — membership', () => {
  it('allows a superadmin to activate membership and stamps joinedAt', async () => {
    await createUserWithRole('superadmin');
    const adminToken = await loginAs('superadmin@membership-test.com');

    const { user: target } = await registerUser({ email: 'to-activate@example.com' });

    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ membership: { status: 'active', notificationPreference: 'sms' } });

    expect(res.status).toBe(200);
    expect(res.body.data.user.membership.status).toBe('active');
    expect(res.body.data.user.membership.notificationPreference).toBe('sms');
    expect(res.body.data.user.membership.joinedAt).not.toBeNull();
    // Role must remain untouched by a membership-only update
    expect(res.body.data.user.role).toBe('user');
  });

  it('rejects an invalid membership status', async () => {
    await createUserWithRole('superadmin', '2');
    const adminToken = await loginAs('superadmin2@membership-test.com');
    const { user: target } = await registerUser({ email: 'bad-status@example.com' });

    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ membership: { status: 'diamond' } });

    expect(res.status).toBe(422);
  });

  it('rejects an invalid notification preference', async () => {
    await createUserWithRole('superadmin', '3');
    const adminToken = await loginAs('superadmin3@membership-test.com');
    const { user: target } = await registerUser({ email: 'bad-pref@example.com' });

    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ membership: { notificationPreference: 'carrier-pigeon' } });

    expect(res.status).toBe(422);
  });

  it('rejects membership updates from a non-superadmin', async () => {
    const { accessToken } = await registerUser({ email: 'regular@example.com' });
    const { user: target } = await registerUser({ email: 'target-2@example.com' });

    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ membership: { status: 'active' } });

    expect(res.status).toBe(403);
  });

  it('there is no public self-service membership activation endpoint', async () => {
    const { accessToken } = await registerUser({ email: 'self-service@example.com' });

    // The only real update-self endpoint is PATCH /auth/me — it must not
    // accept membership changes. Its validator only recognizes
    // name/phone/addresses, strips the unknown `membership` key, and then
    // rejects the now-empty body — a self-service activation attempt has no
    // path to success.
    const res = await request(app)
      .patch(`${AUTH}/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ membership: { status: 'active' } });

    expect(res.status).toBe(422);

    // Confirm membership really is untouched afterward.
    const me = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.data.user.membership.status).toBe('none');
  });
});
