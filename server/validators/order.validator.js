'use strict';

const Joi = require('joi');

const createOrderSchema = Joi.object({
  shippingAddress: Joi.object({
    street:  Joi.string().trim().required(),
    city:    Joi.string().trim().required(),
    zip:     Joi.string().trim().allow('').optional(),
    country: Joi.string().trim().required(),
  }).required(),
  notes:      Joi.string().trim().allow('').optional(),
  couponCode: Joi.string().trim().uppercase().min(3).max(20).optional(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    .required(),
  note: Joi.string().trim().max(500).allow('').optional(),
});

module.exports = { createOrderSchema, updateStatusSchema };
