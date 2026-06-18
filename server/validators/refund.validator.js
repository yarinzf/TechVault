'use strict';

const Joi = require('joi');

const refundOrderSchema = Joi.object({
  amount: Joi.number().positive().required().messages({
    'number.positive': 'amount must be greater than 0',
    'any.required':    'amount is required',
  }),
  reason: Joi.string().trim().max(200).allow('').optional(),
  note:   Joi.string().trim().max(500).allow('').optional(),
});

module.exports = { refundOrderSchema };
