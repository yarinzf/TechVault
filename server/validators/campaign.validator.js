'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

// placement is validated for SHAPE only (a valid enum value) here. The
// cross-field rule "exactly one product when placement is
// homepage_weekly_deal" depends on the campaign's FINAL merged state, which
// a partial PATCH payload alone cannot express — that rule is enforced in
// campaign.service.js against the merged document, not here. See
// assertWeeklyDealEligible in campaign.service.js.
const placement = Joi.string().valid('none', 'homepage_weekly_deal');

// isClearance is client-settable (an admin toggle). clearanceStockSnapshots
// is deliberately NOT declared in either schema below — the shared `validate`
// middleware runs Joi with stripUnknown:true, so any client-submitted value
// for it is silently dropped before reaching the controller/service. It can
// only ever be written by campaign.service.js's buildClearanceSnapshots,
// from a real, current Product.stock read — never from request input.
// VIP campaign benefits — see Campaign.js. membershipOnly is a plain
// boolean gate (reuses the normal discountPercent/products/dates
// mechanism); pointsMultiplier and vipEarlyAccessHours default to "no
// change" (1 / 0) so an admin must opt in explicitly per campaign.
const membershipOnly      = Joi.boolean();
const pointsMultiplier    = Joi.number().min(1).max(10);
const vipEarlyAccessHours = Joi.number().integer().min(0).max(168);

const createCampaignSchema = Joi.object({
  name:            Joi.string().trim().min(1).max(100).required(),
  discountPercent: Joi.number().integer().min(1).max(90).required(),
  startDate:       Joi.date().iso().required(),
  endDate:         Joi.date().iso().greater(Joi.ref('startDate')).required()
    .messages({ 'date.greater': 'endDate must be after startDate' }),
  products:        Joi.array().items(objectId).default([]),
  placement:       placement.default('none'),
  isClearance:     Joi.boolean().default(false),
  membershipOnly:      membershipOnly.default(false),
  pointsMultiplier:    pointsMultiplier.default(1),
  vipEarlyAccessHours: vipEarlyAccessHours.default(0),
});

const updateCampaignSchema = Joi.object({
  name:            Joi.string().trim().min(1).max(100).optional(),
  discountPercent: Joi.number().integer().min(1).max(90).optional(),
  startDate:       Joi.date().iso().optional(),
  endDate:         Joi.date().iso().optional(),
  isActive:        Joi.boolean().optional(),
  products:        Joi.array().items(objectId).optional(),
  placement:       placement.optional(),
  isClearance:     Joi.boolean().optional(),
  membershipOnly:      membershipOnly.optional(),
  pointsMultiplier:    pointsMultiplier.optional(),
  vipEarlyAccessHours: vipEarlyAccessHours.optional(),
}).min(1);

module.exports = { createCampaignSchema, updateCampaignSchema };
