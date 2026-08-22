'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  // If a real MongoDB is already reachable (e.g. a CI service container),
  // use it directly and skip mongodb-memory-server's binary download —
  // avoids depending on network access to its download source at all.
  if (process.env.MONGO_URI_TEST) {
    return;
  }

  const mongod = await MongoMemoryServer.create();
  const uri    = mongod.getUri();

  // Propagate to test workers (process.env is inherited by forked workers)
  process.env.MONGO_URI_TEST = uri;

  // Store on global so globalTeardown (same isolated context) can stop it
  global.__MONGOD__ = mongod;
};
