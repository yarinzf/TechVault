'use strict';

const Joi = require('joi');

const poItemSchema = Joi.object({
  product:         Joi.string().hex().length(24).required(),
  quantityOrdered: Joi.number().integer().min(1).required(),
  unitCost:        Joi.number().min(0).required(),
});

const receiveItemSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  quantity:  Joi.number().integer().min(1).required(),
});

exports.createPurchaseOrderSchema = Joi.object({
  supplier:     Joi.string().hex().length(24).required(),
  items:        Joi.array().items(poItemSchema).min(1).required(),
  expectedDate: Joi.date().iso().allow(null, '').optional(),
  notes:        Joi.string().trim().max(2000).allow('', null).optional(),
});

exports.updatePurchaseOrderSchema = Joi.object({
  status:       Joi.string().valid('ordered', 'cancelled').optional(),
  expectedDate: Joi.date().iso().allow(null, '').optional(),
  notes:        Joi.string().trim().max(2000).allow('', null).optional(),
});

exports.receivePurchaseOrderSchema = Joi.object({
  items: Joi.array().items(receiveItemSchema).min(1).required(),
});
