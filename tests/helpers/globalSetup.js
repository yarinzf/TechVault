'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  const uri    = mongod.getUri();

  // Propagate to test workers (process.env is inherited by forked workers)
  process.env.MONGO_URI_TEST = uri;

  // Store on global so globalTeardown (same isolated context) can stop it
  global.__MONGOD__ = mongod;
};
