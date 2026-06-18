'use strict';

const features = require('../config/features');
const { StatusCodes } = require('http-status-codes');

/**
 * Route-level middleware that rejects the request with 503 if a feature is
 * disabled via environment variable.
 *
 * @param {string} flagName — key in server/config/features.js  (e.g. 'reviews')
 */
const requireFeature = (flagName) => (req, res, next) => {
  if (features[flagName] === false) {
    return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code:    'FEATURE_DISABLED',
        message: `The "${flagName}" feature is currently disabled`,
        details: [],
      },
    });
  }
  next();
};

module.exports = { requireFeature };
