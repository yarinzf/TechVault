'use strict';

const fs = require('fs');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const User = require('../server/models/User');
require('../server/models/Session');
const { TARGETS, runApply } = require('../server/scripts/rotateProductionCredentials');

const ADMIN_TARGET = TARGETS.find((t) => t.email === 'admin@techvault.dev');
const ALICE_TARGET = TARGETS.find((t) => t.email === 'alice@example.com');

// Test-only fixture values — these exist purely to seed a fake user in the
// test DB and are never referenced by the script itself (see the
// "never hardcodes a real credential" test below, which greps the actual
// script source to guard against that regressing).
const FIXTURE_OLD_PASSWORD = 'Fixture-Old-Passw0rd!!';
const FIXTURE_NEW_PASSWORD = 'Fixture-New-Passw0rd!!';

const ENV_KEYS = TARGETS.flatMap((t) => [t.newEnvVar, t.oldEnvVar]);

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearAll();
  ENV_KEYS.forEach((k) => delete process.env[k]);
});

async function makeUser(overrides = {}) {
  return User.create({
    name: 'Test', email: overrides.email, password: overrides.password ?? FIXTURE_OLD_PASSWORD,
    role: overrides.role ?? 'admin', isActive: overrides.isActive ?? true,
  });
}

describe('rotateProductionCredentials — real hashing, targeted, verified', () => {
  it('rotates a target account using the real bcrypt hashing path, and self-verifies old/new passwords', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('rotated');

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_NEW_PASSWORD)).toBe(true);
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(false);
    // Real bcrypt hash shape, never the plaintext.
    expect(fresh.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(fresh.password).not.toContain(FIXTURE_NEW_PASSWORD);
  });

  it('skips a target whose new-password env var is not set — no write occurs', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;
    // New-password env var deliberately left unset for this target.

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toContain(ADMIN_TARGET.newEnvVar);

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('skips a target whose old-password verification env var is not set, even with a valid new password — no write occurs', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    // Old-password verification env var deliberately left unset.

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toContain(ADMIN_TARGET.oldEnvVar);

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('refuses to rotate when the current role does not match the expected role', async () => {
    // Same email as a real target, but repurposed to a different role —
    // must be treated as "not the account we think it is".
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'user' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toMatch(/role/i);

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('skips a new password that is too short, or identical to the supplied old-password verification value', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;

    process.env[ADMIN_TARGET.newEnvVar] = 'short';
    const results1 = await runApply();
    expect(results1.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('skipped');

    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_OLD_PASSWORD; // identical to the old value itself
    const results2 = await runApply();
    expect(results2.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('skipped');

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged both times
  });

  it('invalidates active sessions for the rotated account (logoutAll)', async () => {
    const user = await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    const Session = mongoose.model('Session');
    const session = await Session.create({
      user: user._id, refreshTokenHash: 'x'.repeat(64), deviceName: 'Test', browser: 'Test', os: 'Test',
      isActive: true, expiresAt: new Date(Date.now() + 86400000),
    });

    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;
    const results = await runApply();
    expect(results.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('rotated');
    expect(results.find((x) => x.email === ADMIN_TARGET.email).sessionsRevoked).toBe(1);

    const freshSession = await Session.findById(session._id);
    expect(freshSession.isActive).toBe(false);
  });

  it('never touches an unrelated user, even one with a similar password', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    const unrelated = await makeUser({ email: 'not-a-target@example.com', password: FIXTURE_OLD_PASSWORD, role: 'admin' });

    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;
    await runApply();

    const freshUnrelated = await User.findById(unrelated._id).select('+password');
    expect(await freshUnrelated.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // completely unchanged
  });

  it('rotates multiple explicitly-selected targets independently in one run', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    await makeUser({ email: ALICE_TARGET.email, password: 'Alice-Old-Passw0rd!!', role: 'user' });

    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;
    process.env[ALICE_TARGET.newEnvVar] = 'Alice-New-Passw0rd!!';
    process.env[ALICE_TARGET.oldEnvVar] = 'Alice-Old-Passw0rd!!';

    const results = await runApply();
    expect(results.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('rotated');
    expect(results.find((x) => x.email === ALICE_TARGET.email).outcome).toBe('rotated');

    const freshAdmin = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    const freshAlice = await User.findOne({ email: ALICE_TARGET.email }).select('+password');
    expect(await freshAdmin.comparePassword(FIXTURE_NEW_PASSWORD)).toBe(true);
    expect(await freshAlice.comparePassword('Alice-New-Passw0rd!!')).toBe(true);
  });

  it('never includes a password value anywhere in the returned result objects', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[ADMIN_TARGET.oldEnvVar] = FIXTURE_OLD_PASSWORD;

    const results = await runApply();
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(FIXTURE_NEW_PASSWORD);
    expect(serialized).not.toContain(FIXTURE_OLD_PASSWORD);
  });

  it('every target requires BOTH a newEnvVar and an oldEnvVar name — old/new values are sourced from the environment, never hardcoded on the target object', () => {
    for (const t of TARGETS) {
      expect(typeof t.newEnvVar).toBe('string');
      expect(typeof t.oldEnvVar).toBe('string');
      expect(t.newEnvVar).not.toBe(t.oldEnvVar);
      // The only fields a target may carry — guards against a future edit
      // reintroducing a plaintext password (or any other unexpected field)
      // directly on the TARGETS list.
      expect(Object.keys(t).sort()).toEqual(['email', 'expectedRole', 'newEnvVar', 'oldEnvVar'].sort());
    }
  });

  it('never hardcodes a real credential in the script source — regression guard against reintroducing a known-compromised password literal', () => {
    const source = fs.readFileSync(require.resolve('../server/scripts/rotateProductionCredentials'), 'utf8');
    // These are the specific historically-exposed seed passwords (see
    // server/scripts/seed.js) — this production/security-tooling file must
    // never contain them again, even in a comment.
    expect(source).not.toMatch(/Admin123/);
    expect(source).not.toMatch(/User123/);
  });
});
