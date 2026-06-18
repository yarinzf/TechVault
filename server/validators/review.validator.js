'use strict';

const Joi = require('joi');

const createReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  title:  Joi.string().trim().max(100).optional(),
  body:   Joi.string().trim().max(2000).optional(),
});

const updateReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).optional(),
  title:  Joi.string().trim().max(100).optional(),
  body:   Joi.string().trim().max(2000).optional(),
}).min(1);

const moderateReviewSchema = Joi.object({
  status: Joi.string().valid('published', 'hidden', 'flagged').required(),
});

module.exports = { createReviewSchema, updateReviewSchema, moderateReviewSchema };
