'use strict';

// Regression coverage for the privileged-account RBAC protections in
// server/services/admin.service.js#updateUser — confirmed implemented but
// previously untested by the latest audit:
//   - LAST_SUPERADMIN  (cannot demote/deactivate the last active superadmin)
//   - SELF_ROLE_CHANGE (a privileged actor cannot change their own role)
//   - SELF_DEACTIVATION (a privileged actor cannot deactivate their own account)
// Plus: fresh-DB-role authorization (no stale role trusted from an old access
// token) and force-logout session revocation (server/services/auth.service.js
// #forceRevokeUserSessions, DELETE /admin/users/:id/sessions).

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

// ── Helpers (same conventions as tests/roles.test.js) ──────────────────────────
async function createUserWithRole(role, suffix = '') {
  const User = mongoose.model('User');
  return User.create({
    name:     `${role} User${suffix}`,
    email:    `${role}${suffix}@pag-test.com`,
    password: 'Password123!',
    role,
  });
}

async function loginAs(email, password = 'Password123!') {
  const res = await request(app).post(`${AUTH}/login`).send({ email, password });
  return res.body.data?.accessToken;
}

// ══════════════════════════════════════════════════════════════════════════
// LAST_SUPERADMIN
// ══════════════════════════════════════════════════════════════════════════
describe('LAST_SUPERADMIN — the last active superadmin cannot be demoted or deactivated', () => {
  // Reachability note (verified by reading the guard before writing these
  // tests): PATCH /admin/users/:id is itself superadmin-only, so whoever
  // calls it is necessarily ALSO an active superadmin. When actor !== target
  // and target is currently active, the pre-update count of {role:
  // superadmin, isActive:true} therefore always includes BOTH the actor and
  // the target — i.e. it is always >= 2, so the guard's `<= 1` check can
  // never fire in that shape. Its one genuinely reachable trigger against a
  // DIFFERENT user is a target that is a superadmin-role account which is
  // ALREADY inactive (e.g. previously deactivated) — changing such a target's
  // role while the actor is the system's only active superadmin would still
  // leave the active count at 0 once the target is fully accounted for, so
  // the guard correctly blocks it. The primary, unconditional protection
  // against a lockout is SELF_ROLE_CHANGE / SELF_DEACTIVATION below, which
  // block self-harm regardless of how many superadmins exist — see the
  // dedicated "structural guarantee" test at the end of this block.
  it('blocks changing the role of an already-inactive superadmin-role account when the actor is the sole active superadmin', async () => {
    const actor  = await createUserWithRole('superadmin', '-ls-actor');
    const token  = await loginAs('superadmin-ls-actor@pag-test.com');
    const target = await createUserWithRole('superadmin', '-ls-target');
    await mongoose.model('User').updateOne({ _id: target._id }, { $set: { isActive: false } });
    // State now: actor is the ONLY active superadmin in the system; target
    // holds the superadmin role but is already inactive.

    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LAST_SUPERADMIN');

    const fresh = await mongoose.model('User').findById(target._id);
    expect(fresh.role).toBe('superadmin'); // unchanged
  });

  it('structural guarantee: with exactly one active superadmin, self-harm is unconditionally blocked, so the active-superadmin count can never reach zero through this endpoint', async () => {
    const sole  = await createUserWithRole('superadmin', '-ls-sole');
    const token = await loginAs('superadmin-ls-sole@pag-test.com');

    const selfDemote = await request(app)
      .patch(`${ADMIN}/users/${sole._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(selfDemote.status).toBe(403);
    expect(selfDemote.body.error.code).toBe('SELF_ROLE_CHANGE');

    const selfDeactivate = await request(app)
      .patch(`${ADMIN}/users/${sole._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(selfDeactivate.status).toBe(403);
    expect(selfDeactivate.body.error.code).toBe('SELF_DEACTIVATION');

    const fresh = await mongoose.model('User').findById(sole._id);
    expect(fresh.role).toBe('superadmin');
    expect(fresh.isActive).toBe(true);

    const activeSuperadminCount = await mongoose.model('User').countDocuments({ role: 'superadmin', isActive: true });
    expect(activeSuperadminCount).toBe(1); // never reached zero
  });

  it('allows demoting/deactivating a superadmin when a SECOND active superadmin exists', async () => {
    const actor  = await createUserWithRole('superadmin', '-two-actor');
    const target = await createUserWithRole('superadmin', '-two-target');
    const token  = await loginAs('superadmin-two-actor@pag-test.com');

    // Both actor and target are active superadmins (2 total) — demoting the
    // target leaves the actor, so the guard must NOT block this.
    const res = await request(app)
      .patch(`${ADMIN}/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');

    const fresh = await mongoose.model('User').findById(target._id);
    expect(fresh.role).toBe('admin');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SELF_ROLE_CHANGE
// ══════════════════════════════════════════════════════════════════════════
describe('SELF_ROLE_CHANGE — a privileged actor cannot change their own role', () => {
  it('rejects a superadmin attempting to demote themselves', async () => {
    // A second active superadmin exists so this case is isolated from
    // LAST_SUPERADMIN — proves SELF_ROLE_CHANGE fires independently.
    await createUserWithRole('superadmin', '-self-other');
    const self  = await createUserWithRole('superadmin', '-self-target');
    const token = await loginAs('superadmin-self-target@pag-test.com');

    const res = await request(app)
      .patch(`${ADMIN}/users/${self._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_ROLE_CHANGE');

    const fresh = await mongoose.model('User').findById(self._id);
    expect(fresh.role).toBe('superadmin');
    expect(fresh.isActive).toBe(true); // account/session remains valid
  });

  it('the account remains fully usable after a rejected self-role-change attempt (session not destroyed)', async () => {
    await createUserWithRole('superadmin', '-self-usable-other');
    const self  = await createUserWithRole('superadmin', '-self-usable');
    const token = await loginAs('superadmin-self-usable@pag-test.com');

    const rejected = await request(app)
      .patch(`${ADMIN}/users/${self._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(rejected.status).toBe(403);

    // Same token, same session — still works for a normal superadmin request.
    const followUp = await request(app).get(`${ADMIN}/users`).set('Authorization', `Bearer ${token}`);
    expect(followUp.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SELF_DEACTIVATION
// ══════════════════════════════════════════════════════════════════════════
describe('SELF_DEACTIVATION — a privileged actor cannot deactivate their own account', () => {
  it('rejects a superadmin attempting to deactivate themselves', async () => {
    await createUserWithRole('superadmin', '-selfdeact-other');
    const self  = await createUserWithRole('superadmin', '-selfdeact-target');
    const token = await loginAs('superadmin-selfdeact-target@pag-test.com');

    const res = await request(app)
      .patch(`${ADMIN}/users/${self._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');

    const fresh = await mongoose.model('User').findById(self._id);
    expect(fresh.isActive).toBe(true);
  });

  it('SELF_DEACTIVATION fires unconditionally — even with a SECOND active superadmin available, self-deactivation is still rejected', async () => {
    // Proves the self-guard is independent of the LAST_SUPERADMIN headcount:
    // it is not "you can't deactivate yourself only if you're the last one",
    // it is "you can never deactivate yourself", full stop.
    await createUserWithRole('superadmin', '-selfdeact-other');
    const self  = await createUserWithRole('superadmin', '-selfdeact-withpeer');
    const token = await loginAs('superadmin-selfdeact-withpeer@pag-test.com');

    const res = await request(app)
      .patch(`${ADMIN}/users/${self._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');

    const fresh = await mongoose.model('User').findById(self._id);
    expect(fresh.isActive).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FRESH DB ROLE LOOKUP — an old access token cannot bypass a role change
// ══════════════════════════════════════════════════════════════════════════
describe('Fresh DB role lookup — authorization is never based on a stale token payload', () => {
  it('a demoted admin is denied Admin-API access on their VERY NEXT request, using the SAME still-unexpired access token', async () => {
    const superadmin  = await createUserWithRole('superadmin', '-fresh-actor');
    const superToken  = await loginAs('superadmin-fresh-actor@pag-test.com');
    const victim       = await createUserWithRole('admin', '-fresh-victim');
    const victimToken  = await loginAs('admin-fresh-victim@pag-test.com');

    // Confirm the token works for an admin-only endpoint BEFORE the demotion.
    const before = await request(app).get(`${ADMIN}/dashboard`).set('Authorization', `Bearer ${victimToken}`);
    expect(before.status).toBe(200);

    // Demote via the real, proper administrative path (not a raw DB write) —
    // exercises the same code path a genuine role change would use.
    const demote = await request(app)
      .patch(`${ADMIN}/users/${victim._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ role: 'user' });
    expect(demote.status).toBe(200);
    expect(demote.body.data.user.role).toBe('user');

    // Reuse the EXACT SAME (still cryptographically valid, unexpired) access
    // token the victim already had — the JWT payload's embedded role (if any)
    // is never trusted; authenticate() re-reads the role from the DB on
    // every single request (see server/middleware/auth.js).
    const after = await request(app).get(`${ADMIN}/dashboard`).set('Authorization', `Bearer ${victimToken}`);
    expect(after.status).toBe(403);
  });

  it('a deactivated user is denied ANY authenticated access on their next request with the same old token', async () => {
    const superadmin = await createUserWithRole('superadmin', '-fresh-deact-actor');
    const superToken = await loginAs('superadmin-fresh-deact-actor@pag-test.com');
    const victim      = await createUserWithRole('user', '-fresh-deact-victim');
    const victimToken = await loginAs('user-fresh-deact-victim@pag-test.com');

    const before = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${victimToken}`);
    expect(before.status).toBe(200);

    const deactivate = await request(app)
      .patch(`${ADMIN}/users/${victim._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);

    const after = await request(app).get(`${AUTH}/me`).set('Authorization', `Bearer ${victimToken}`);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FORCE LOGOUT — admin-forced session revocation (API only, no UI in this task)
// ══════════════════════════════════════════════════════════════════════════
describe('Force logout — DELETE /admin/users/:id/sessions revokes the victim\'s active sessions', () => {
  it('after a superadmin force-revokes a user\'s sessions, the victim\'s refresh token is rejected', async () => {
    const superToken = await (async () => {
      await createUserWithRole('superadmin', '-fl-super');
      return loginAs('superadmin-fl-super@pag-test.com');
    })();

    // Real login (not createUserWithRole + loginAs) so a real Session
    // document with a real refresh-token cookie is issued.
    const email = 'victim-fl@pag-test.com';
    await request(app).post(`${AUTH}/register`).send({ name: 'Victim', email, password: 'Password123!' });
    const loginRes = await request(app).post(`${AUTH}/login`).send({ email, password: 'Password123!' });
    expect(loginRes.status).toBe(200);
    const victimId = loginRes.body.data.user._id;
    const setCookie = loginRes.headers['set-cookie'] || [];
    const refreshCookie = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();

    // Sanity: the refresh token works BEFORE force logout.
    const refreshBefore = await request(app).post(`${AUTH}/refresh`).set('Cookie', refreshCookie);
    expect(refreshBefore.status).toBe(200);

    // The refresh above rotated the cookie — capture the NEW one to revoke
    // the session it actually belongs to, then confirm THAT one is rejected.
    const rotatedCookie = (refreshBefore.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken='));
    expect(rotatedCookie).toBeDefined();

    const revoke = await request(app)
      .delete(`${ADMIN}/users/${victimId}/sessions`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.revokedSessions).toBeGreaterThanOrEqual(1);

    // The same (now-revoked) refresh token must be rejected.
    const refreshAfter = await request(app).post(`${AUTH}/refresh`).set('Cookie', rotatedCookie);
    expect(refreshAfter.status).toBe(401);
    expect(refreshAfter.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
  });

  it('force logout is superadmin-exclusive — a plain admin gets 403 and the victim session survives', async () => {
    await createUserWithRole('admin', '-fl-plain-actor');
    const adminToken = await loginAs('admin-fl-plain-actor@pag-test.com');

    const email = 'victim-fl-plain@pag-test.com';
    await request(app).post(`${AUTH}/register`).send({ name: 'Victim2', email, password: 'Password123!' });
    const loginRes = await request(app).post(`${AUTH}/login`).send({ email, password: 'Password123!' });
    const victimId = loginRes.body.data.user._id;
    const refreshCookie = (loginRes.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken='));

    const res = await request(app)
      .delete(`${ADMIN}/users/${victimId}/sessions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);

    // Session must still be usable — nothing was revoked.
    const refreshStill = await request(app).post(`${AUTH}/refresh`).set('Cookie', refreshCookie);
    expect(refreshStill.status).toBe(200);
  });
});
