'use strict';

const campaignService = require('../services/campaign.service');
const { isMembershipActive } = require('../models/User');
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

// Powers the storefront Deals page — every currently active, storefront-
// eligible campaign with its available products already priced.
const getActiveCampaigns = async (req, res, next) => {
  try {
    const campaigns = await campaignService.getActiveCampaigns();
    sendSuccess(res, { campaigns }, 'Active campaigns retrieved');
  } catch (err) { next(err); }
};

// Powers the Club page's real "2x points" campaign teaser and "VIP
// exclusive deals" section. optionalAuth (see campaign.routes.js) means
// req.user may or may not be present — a guest/non-member always gets
// vipDeals: [] and only the non-early-access pointsCampaign, never a
// membership-only campaign's real price (server-enforced, not merely
// hidden client-side).
const getClubSummary = async (req, res, next) => {
  try {
    const isMember = isMembershipActive(req.user?.membership);
    const [pointsCampaign, vipDeals] = await Promise.all([
      campaignService.getActivePointsCampaign({ isMember }),
      isMember ? campaignService.getVipExclusiveDeals(3) : Promise.resolve([]),
    ]);
    sendSuccess(res, { pointsCampaign, vipDeals }, 'Club summary retrieved');
  } catch (err) { next(err); }
};

module.exports = { getWeeklyDeal, getActiveCampaigns, getClubSummary };
