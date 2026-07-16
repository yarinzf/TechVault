'use strict';

const Joi = require('joi');

const createProductSchema = Joi.object({
  name:             Joi.string().min(3).max(200).trim().required(),
  description:      Joi.string().trim().required(),
  shortDescription: Joi.string().trim().optional(),
  // Optional Hebrew counterparts — additive bilingual support, never required.
  nameHe:             Joi.string().max(200).trim().allow('').optional(),
  descriptionHe:      Joi.string().trim().allow('').optional(),
  shortDescriptionHe: Joi.string().trim().allow('').optional(),
  category:         Joi.string().hex().length(24).required(),
  brand:            Joi.string().trim().optional(),
  price:            Joi.number().min(0).required(),
  compareAtPrice:   Joi.number().min(0).optional(),
  taxRate:          Joi.number().min(0).max(1).optional(),
  stock:            Joi.number().integer().min(0).default(0),
  minStock:         Joi.number().integer().min(0).optional(),
  images:           Joi.array().items(Joi.string().uri()).optional(),
  specs:            Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  tags:             Joi.array().items(Joi.string().trim()).optional(),
  isFeatured:       Joi.boolean().optional(),
  isPublished:      Joi.boolean().optional(),
});

const updateProductSchema = createProductSchema
  .fork(['name', 'description', 'category', 'price'], (f) => f.optional())
  .min(1);

const updateStockSchema = Joi.object({
  type:   Joi.string().valid('increase', 'decrease').required(),
  amount: Joi.number().integer().min(1).required(),
});

module.exports = { createProductSchema, updateProductSchema, updateStockSchema };
