'use strict';

const Joi = require('joi');

const createIntentSchema = Joi.object({
  orderId: Joi.string().hex().length(24).required().messages({
    'any.required': 'orderId is required',
    'string.hex':   'orderId must be a valid ObjectId',
  }),
});

const confirmPaymentSchema = Joi.object({
  paymentIntentId: Joi.string().required().messages({
    'any.required': 'paymentIntentId is required',
  }),
  orderId: Joi.string().hex().length(24).required().messages({
    'any.required': 'orderId is required',
  }),
});

module.exports = { createIntentSchema, confirmPaymentSchema };
