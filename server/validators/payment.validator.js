'use strict';

const Joi = require('joi');

const createIntentSchema = Joi.object({
  orderId: Joi.string().hex().length(24).required().messages({
    'any.required': 'orderId is required',
    'string.hex':   'orderId must be a valid ObjectId',
  }),
  // Card fields — only used by the mock provider (to simulate a decline via
  // MOCK_DECLINE_CARDS) and ignored entirely by the real Stripe provider.
  // Declared here so validate()'s stripUnknown doesn't silently drop them
  // before payment.service.js ever sees the card number.
  cardNumber: Joi.string().trim().allow('').optional(),
  cardHolder: Joi.string().trim().allow('').optional(),
  expiry:     Joi.string().trim().allow('').optional(),
  cvv:        Joi.string().trim().allow('').optional(),
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
