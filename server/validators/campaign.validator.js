'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const createCampaignSchema = Joi.object({
  name:            Joi.string().trim().min(1).max(100).required(),
  discountPercent: Joi.number().integer().min(1).max(90).required(),
  startDate:       Joi.date().iso().required(),
  endDate:         Joi.date().iso().greater(Joi.ref('startDate')).required()
    .messages({ 'date.greater': 'endDate must be after startDate' }),
  products:        Joi.array().items(objectId).default([]),
});

const updateCampaignSchema = Joi.object({
  name:            Joi.string().trim().min(1).max(100).optional(),
  discountPercent: Joi.number().integer().min(1).max(90).optional(),
  startDate:       Joi.date().iso().optional(),
  endDate:         Joi.date().iso().optional(),
  isActive:        Joi.boolean().optional(),
  products:        Joi.array().items(objectId).optional(),
}).min(1);

module.exports = { createCampaignSchema, updateCampaignSchema };
