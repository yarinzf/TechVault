'use strict';

const Joi = require('joi');

const createCouponSchema = Joi.object({
  code:              Joi.string().trim().uppercase().min(3).max(20).required(),
  type:              Joi.string().valid('percentage', 'fixed').required(),
  value:             Joi.number().min(0).required(),
  minOrderAmount:    Joi.number().min(0).default(0),
  maxDiscountAmount: Joi.number().min(0).optional(),
  usageLimit:        Joi.number().integer().min(1).optional(),
  perUserLimit:      Joi.number().integer().min(1).default(1),
  validFrom:         Joi.date().iso().optional(),
  validUntil:        Joi.date().iso().optional(),
  isActive:          Joi.boolean().default(true),
});

const updateCouponSchema = createCouponSchema
  .fork(Object.keys(createCouponSchema.describe().keys), (f) => f.optional())
  .min(1);

const validateCouponSchema = Joi.object({
  code:     Joi.string().trim().uppercase().required(),
  subtotal: Joi.number().min(0).required(),
});

module.exports = { createCouponSchema, updateCouponSchema, validateCouponSchema };
