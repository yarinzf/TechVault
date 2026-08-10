'use strict';

const User = require('../server/models/User');
const { connect, clearAll } = require('./helpers/db');
const { EMAILS, run } = require('../server/scripts/reportProductionAccountStatus');

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearAll();
});

describe('reportProductionAccountStatus — read-only', () => {
  it('covers exactly the six accounts relevant to the rotation/cleanup tooling', () => {
    expect(EMAILS.sort()).toEqual([
      'admin@techvault.dev', 'alice@example.com', 'bob@example.com',
      'carol@example.com', 'superadmin@techvault.dev', 'warehouse@techvault.dev',
    ].sort());
  });

  it('runs without throwing and never selects the password field', async () => {
    await User.create({ name: 'Super Admin', email: 'superadmin@techvault.dev', password: 'Fixture-Passw0rd!!', role: 'superadmin', isActive: true });
    await User.create({ name: 'Admin User', email: 'admin@techvault.dev', password: 'Fixture-Passw0rd!!', role: 'admin', isActive: true });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await expect(run()).resolves.toBeUndefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toContain('Fixture-Passw0rd!!');
    expect(printed).toContain('superadmin@techvault.dev: role=superadmin, active=true');
    expect(printed).toContain('warehouse@techvault.dev: NOT FOUND');
    expect(printed).toContain('Total production user count: 2');

    logSpy.mockRestore();
  });
});
