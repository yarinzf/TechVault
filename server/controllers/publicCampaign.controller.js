'use strict';

const campaignService = require('../services/campaign.service');
const { sendSuccess } = require('../utils/response');

// Public, unauthenticated, read-only. Deliberately kept separate from
// campaign.controller.js (the Admin-only CRUD handlers) so the public/admin
// trust boundary is visible at the file level, not just in route middleware.
const getWeeklyDeal = async (req, res, next) => {
  try {
    const deal = await campaignService.getActiveWeeklyDeal();
    sendSuccess(res, { deal }, 'Weekly deal retrieved');
  } catch (err) { next(err); }
};

module.exports = { getWeeklyDeal };
