'use strict';

/**
 * Runs synchronously inside each Jest worker before any test module is imported.
 * Sets the minimum required env vars so env.js Joi validation passes when
 * app.js is first require()'d in beforeAll.
 */
process.env.NODE_ENV           = 'test';
process.env.JWT_ACCESS_SECRET  = 'test-access-secret-minimum-32-characters-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long!!!';
process.env.COOKIE_SECRET      = 'test-cookie-secret-minimum-32-characters-long!';
