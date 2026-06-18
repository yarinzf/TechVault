'use strict';

module.exports = async () => {
  // Close any open Mongoose connection (the same process shares it via --runInBand)
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  } catch (_) {}

  // Stop the in-memory MongoDB server
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
};
