'use strict';

const Joi = require('joi');

const returnItemSchema = Joi.object({
  product:  Joi.string().hex().length(24).required(),
  quantity: Joi.number().integer().min(1).required(),
  reason:   Joi.string().trim().min(3).max(500).required(),
});

const itemConditionSchema = Joi.object({
  index:     Joi.number().integer().min(0).required(),
  condition: Joi.string().valid('sellable', 'damaged').required(),
});

exports.createReturnSchema = Joi.object({
  items:        Joi.array().items(returnItemSchema).min(1).required(),
  customerNote: Joi.string().trim().max(1000).allow('', null).optional(),
});

exports.approveRejectSchema = Joi.object({
  adminNote: Joi.string().trim().max(1000).allow('', null).optional(),
});

exports.markReceivedSchema = Joi.object({
  itemConditions: Joi.array().items(itemConditionSchema).optional(),
});

exports.processRefundSchema = Joi.object({
  refundAmount: Joi.number().positive().required(),
  refundType:   Joi.string().valid('original_payment', 'store_credit').default('original_payment'),
  adminNote:    Joi.string().trim().max(1000).allow('', null).optional(),
});
