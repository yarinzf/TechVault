'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const getUri = () => {
  const env = process.env.NODE_ENV;
  if (env === 'production') return process.env.MONGO_URI_PROD;
  if (env === 'test')       return process.env.MONGO_URI_TEST;
  return process.env.MONGO_URI_DEV;
};

const connectDB = async (retries = MAX_RETRIES) => {
  const uri = getUri();
  try {
    await mongoose.connect(uri);
    logger.info(`MongoDB connected [${process.env.NODE_ENV}]: ${mongoose.connection.host}`);
  } catch (err) {
    if (retries > 0) {
      logger.warn(`MongoDB connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s… (${retries} left)`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return connectDB(retries - 1);
    }
    logger.error('MongoDB: max retries exceeded', { message: err.message });
    throw err;
  }
};

module.exports = { connectDB };
