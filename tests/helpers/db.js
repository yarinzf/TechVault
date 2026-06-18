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

module.exports = { connect, clearAll };
