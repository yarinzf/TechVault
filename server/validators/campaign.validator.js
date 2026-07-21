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

const createCampaignSchema = Joi.object({
  name:            Joi.string().trim().min(1).max(100).required(),
  discountPercent: Joi.number().integer().min(1).max(90).required(),
  startDate:       Joi.date().iso().required(),
  endDate:         Joi.date().iso().greater(Joi.ref('startDate')).required()
    .messages({ 'date.greater': 'endDate must be after startDate' }),
  products:        Joi.array().items(objectId).default([]),
  placement:       placement.default('none'),
});

const updateCampaignSchema = Joi.object({
  name:            Joi.string().trim().min(1).max(100).optional(),
  discountPercent: Joi.number().integer().min(1).max(90).optional(),
  startDate:       Joi.date().iso().optional(),
  endDate:         Joi.date().iso().optional(),
  isActive:        Joi.boolean().optional(),
  products:        Joi.array().items(objectId).optional(),
  placement:       placement.optional(),
}).min(1);

module.exports = { createCampaignSchema, updateCampaignSchema };
