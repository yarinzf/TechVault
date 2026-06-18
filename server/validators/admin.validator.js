'use strict';

const Joi = require('joi');
const { ALL_ROLES } = require('../config/roles');

const updateUserSchema = Joi.object({
  role:     Joi.string().valid(...ALL_ROLES).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

const analyticsQuerySchema = Joi.object({
  period:   Joi.string().valid('day', 'week', 'month').default('day'),
  dateFrom: Joi.date().iso().optional(),
  dateTo:   Joi.date().iso().min(Joi.ref('dateFrom')).optional(),
  limit:    Joi.number().integer().min(1).max(100).default(10),
}).options({ allowUnknown: true });

module.exports = { updateUserSchema, analyticsQuerySchema };
