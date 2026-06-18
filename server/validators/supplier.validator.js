'use strict';

const Joi = require('joi');

exports.createSupplierSchema = Joi.object({
  name:        Joi.string().trim().min(2).max(200).required(),
  contactName: Joi.string().trim().max(200).allow('', null).optional(),
  email:       Joi.string().trim().email().lowercase().allow('', null).optional(),
  phone:       Joi.string().trim().max(50).allow('', null).optional(),
  address:     Joi.string().trim().max(500).allow('', null).optional(),
  website:     Joi.string().trim().max(300).allow('', null).optional(),
  isActive:    Joi.boolean().optional(),
  notes:       Joi.string().trim().max(2000).allow('', null).optional(),
});

exports.updateSupplierSchema = Joi.object({
  name:        Joi.string().trim().min(2).max(200).optional(),
  contactName: Joi.string().trim().max(200).allow('', null).optional(),
  email:       Joi.string().trim().email().lowercase().allow('', null).optional(),
  phone:       Joi.string().trim().max(50).allow('', null).optional(),
  address:     Joi.string().trim().max(500).allow('', null).optional(),
  website:     Joi.string().trim().max(300).allow('', null).optional(),
  isActive:    Joi.boolean().optional(),
  notes:       Joi.string().trim().max(2000).allow('', null).optional(),
});
