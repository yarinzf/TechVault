'use strict';

const fs = require('fs');
const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const User = require('../server/models/User');
require('../server/models/Session');
const {
  TARGETS, NEVER_TOUCH_EMAIL, assertNeverSuperadmin, runApply,
} = require('../server/scripts/forceResetPrivilegedPasswords');

const ADMIN_TARGET = TARGETS.find((t) => t.email === 'admin@techvault.dev');
const WAREHOUSE_TARGET = TARGETS.find((t) => t.email === 'warehouse@techvault.dev');

const FIXTURE_OLD_PASSWORD = 'Fixture-Old-Passw0rd!!';
const FIXTURE_NEW_PASSWORD = 'Fixture-New-Passw0rd!!';

const ENV_KEYS = TARGETS.map((t) => t.newEnvVar);

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

describe('forceResetPrivilegedPasswords — no old password required, superadmin never a target', () => {
  it('resets admin using the real bcrypt hashing path, and self-verifies only the new password (no old-password comparison exists)', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('reset');

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_NEW_PASSWORD)).toBe(true);
    expect(fresh.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(fresh.password).not.toContain(FIXTURE_NEW_PASSWORD);
  });

  it('resets warehouse independently of admin in the same run', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    await makeUser({ email: WAREHOUSE_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'warehouse' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    process.env[WAREHOUSE_TARGET.newEnvVar] = 'Another-New-Passw0rd!!';

    const results = await runApply();
    expect(results.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('reset');
    expect(results.find((x) => x.email === WAREHOUSE_TARGET.email).outcome).toBe('reset');

    const freshWarehouse = await User.findOne({ email: WAREHOUSE_TARGET.email }).select('+password');
    expect(await freshWarehouse.comparePassword('Another-New-Passw0rd!!')).toBe(true);
  });

  it('skips a target whose new-password env var is not set — no write occurs', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toContain(ADMIN_TARGET.newEnvVar);

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('refuses to reset when the current role does not match the expected role', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'user' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toMatch(/role/i);

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('refuses to reset an inactive account', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin', isActive: false });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;

    const results = await runApply();
    const r = results.find((x) => x.email === ADMIN_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toMatch(/active/i);

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('never creates a missing account', async () => {
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    const results = await runApply();
    expect(results.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('skipped');
    expect(await User.findOne({ email: ADMIN_TARGET.email })).toBeNull();
  });

  it('skips a new password shorter than the minimum length', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.newEnvVar] = 'short';

    const results = await runApply();
    expect(results.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('skipped');

    const fresh = await User.findOne({ email: ADMIN_TARGET.email }).select('+password');
    expect(await fresh.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // unchanged
  });

  it('invalidates active sessions for the reset account (logoutAll)', async () => {
    const user = await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    const Session = mongoose.model('Session');
    const session = await Session.create({
      user: user._id, refreshTokenHash: 'x'.repeat(64), deviceName: 'Test', browser: 'Test', os: 'Test',
      isActive: true, expiresAt: new Date(Date.now() + 86400000),
    });

    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    const results = await runApply();
    expect(results.find((x) => x.email === ADMIN_TARGET.email).outcome).toBe('reset');
    expect(results.find((x) => x.email === ADMIN_TARGET.email).sessionsRevoked).toBe(1);

    const freshSession = await Session.findById(session._id);
    expect(freshSession.isActive).toBe(false);
  });

  it('never touches an unrelated user, even one with a similar password', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    const unrelated = await makeUser({ email: 'not-a-target@example.com', password: FIXTURE_OLD_PASSWORD, role: 'admin' });

    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;
    await runApply();

    const freshUnrelated = await User.findById(unrelated._id).select('+password');
    expect(await freshUnrelated.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true); // completely unchanged
  });

  it('never includes a password value anywhere in the returned result objects', async () => {
    await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
    process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;

    const results = await runApply();
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(FIXTURE_NEW_PASSWORD);
    expect(serialized).not.toContain(FIXTURE_OLD_PASSWORD);
  });

  describe('superadmin is structurally excluded and independently guarded', () => {
    it('TARGETS never includes superadmin@techvault.dev', () => {
      expect(TARGETS.map((t) => t.email)).not.toContain(NEVER_TOUCH_EMAIL);
      expect(TARGETS).toHaveLength(2);
    });

    it('assertNeverSuperadmin throws for the superadmin email, and is a no-op for any other email', () => {
      expect(() => assertNeverSuperadmin(NEVER_TOUCH_EMAIL)).toThrow(/superadmin/i);
      expect(() => assertNeverSuperadmin('admin@techvault.dev')).not.toThrow();
    });

    it('a superadmin account in the database is completely unaffected by a run, even with an unrelated new-password env var set', async () => {
      const superadmin = await makeUser({ email: NEVER_TOUCH_EMAIL, password: FIXTURE_OLD_PASSWORD, role: 'superadmin' });
      await makeUser({ email: ADMIN_TARGET.email, password: FIXTURE_OLD_PASSWORD, role: 'admin' });
      process.env[ADMIN_TARGET.newEnvVar] = FIXTURE_NEW_PASSWORD;

      await runApply();

      const freshSuperadmin = await User.findById(superadmin._id).select('+password');
      expect(await freshSuperadmin.comparePassword(FIXTURE_OLD_PASSWORD)).toBe(true);
      expect(freshSuperadmin.role).toBe('superadmin');
      expect(freshSuperadmin.isActive).toBe(true);
    });
  });

  it('never hardcodes a real credential in the script source', () => {
    const source = fs.readFileSync(require.resolve('../server/scripts/forceResetPrivilegedPasswords'), 'utf8');
    expect(source).not.toMatch(/Admin123/);
    expect(source).not.toMatch(/User123/);
  });
});
