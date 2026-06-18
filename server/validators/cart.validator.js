'use strict';

const Joi = require('joi');

const addItemSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  quantity:  Joi.number().integer().min(1).default(1),
});

const updateItemSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
});

module.exports = { addItemSchema, updateItemSchema };
