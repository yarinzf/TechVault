'use strict';

const trafficService = require('../services/traffic.service');
const { sendSuccess } = require('../utils/response');

// Deliberately tolerant/no-op on a malformed anonId rather than a 400 — this
// is a best-effort analytics beacon, never something a real user-facing flow
// should be able to break or block on.
const recordVisit = async (req, res, next) => {
  try {
    const anonId = typeof req.body?.anonId === 'string' ? req.body.anonId.slice(0, 100) : null;
    if (!anonId) {
      return sendSuccess(res, null, 'Ignored');
    }
    await trafficService.recordVisit(anonId, { isProductPage: req.body?.isProductPage === true });
    sendSuccess(res, null, 'Recorded');
  } catch (err) { next(err); }
};

module.exports = { recordVisit };
