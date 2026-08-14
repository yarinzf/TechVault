'use strict';

const Joi = require('joi');

// Strict allowlists — Joi objects reject unknown keys by default (no
// .unknown(true) anywhere here), so a client can never write a field it
// invented, and a Warehouse actor can never reach the Admin fields (the
// route itself is also scope-specific — see admin.routes.js).
const updateAdminSettingsSchema = Joi.object({
  notifications: Joi.object({
    email: Joi.boolean(),
    push:  Joi.boolean(),
    sms:   Joi.boolean(),
  }).min(1),
  alertTypes: Joi.object({
    criticalAlerts: Joi.boolean(),
    stockAlerts:    Joi.boolean(),
    salesAlerts:    Joi.boolean(),
    orderAlerts:    Joi.boolean(),
    securityAlerts: Joi.boolean(),
  }).min(1),
  thresholds: Joi.object({
    highSalesIncrease: Joi.number().min(0).max(1000),
    salesDecrease:      Joi.number().min(0).max(100),
    priceChange:        Joi.number().min(0).max(100),
    orderDelay:          Joi.number().min(1).max(720),
  }).min(1),
}).min(1);

const updateWarehouseSettingsSchema = Joi.object({
  minStockDefault: Joi.number().integer().min(0).max(100000),
  alertEmail:      Joi.string().trim().email().allow(''),
  lowStockAlert:   Joi.boolean(),
  supplierNotify:  Joi.boolean(),
  autoOrder:       Joi.boolean(),
}).min(1);

module.exports = { updateAdminSettingsSchema, updateWarehouseSettingsSchema };
