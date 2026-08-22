'use strict';

const mongoose = require('mongoose');

/**
 * Connect to the in-memory MongoDB started by globalSetup.
 * Idempotent — safe to call from multiple beforeAll hooks.
 */
const connect = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI_TEST);
  }
};

/**
 * Delete all documents from every collection.
 * Called in afterEach to give each test a clean slate.
 */
const clearAll = async () => {
  const cols = mongoose.connection.collections;
  await Promise.all(Object.values(cols).map(c => c.deleteMany({})));
};

/**
 * Poll `check` (sync or async) until it returns a truthy value, or throw
 * after `timeoutMs`. Used to wait for fire-and-forget async work (event
 * handlers, non-blocking audit logging) to land, without relying on a fixed
 * delay that can be too short on a slower/loaded CI runner.
 */
const waitFor = async (check, { timeoutMs = 5000, intervalMs = 25 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

module.exports = { connect, clearAll, waitFor };
