'use strict';

const crypto = require('crypto');

const HEADER = 'x-correlation-id';

/**
 * Correlation ID middleware.
 *
 * - Reads `X-Correlation-Id` from the incoming request (forwarded by an API
 *   gateway or client) or generates a new 16-hex-char ID if absent.
 * - Attaches it to `req.correlationId`.
 * - Echoes it back on every response via the same header, so clients and
 *   load-balancers can trace a request end-to-end.
 *
 * Usage in logs:
 *   logger.info('message', { correlationId: req.correlationId });
 */
const correlationId = (req, res, next) => {
  const id = req.headers[HEADER] || crypto.randomBytes(8).toString('hex');
  req.correlationId = id;
  res.setHeader(HEADER, id);
  next();
};

module.exports = { correlationId, CORRELATION_HEADER: HEADER };
