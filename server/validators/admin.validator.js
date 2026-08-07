'use strict';

const Joi = require('joi');
const { ALL_ROLES } = require('../config/roles');

// Membership fields a superadmin may set directly (dev/test fixture &
// internal support use — there is no public self-service activation
// endpoint; real activation will come later via the paid membership flow).
const membershipUpdateSchema = Joi.object({
  status:                  Joi.string().valid('none', 'active').optional(),
  notificationPreference:  Joi.string().valid('none', 'email', 'sms', 'both').optional(),
  points:                  Joi.number().integer().min(0).optional(),
  lifetimePoints:          Joi.number().integer().min(0).optional(),
}).min(1);

const updateUserSchema = Joi.object({
  role:       Joi.string().valid(...ALL_ROLES).optional(),
  isActive:   Joi.boolean().optional(),
  membership: membershipUpdateSchema.optional(),
}).min(1);

const analyticsQuerySchema = Joi.object({
  period:   Joi.string().valid('day', 'week', 'month').default('day'),
  dateFrom: Joi.date().iso().optional(),
  dateTo:   Joi.date().iso().min(Joi.ref('dateFrom')).optional(),
  limit:    Joi.number().integer().min(1).max(100).default(10),
}).options({ allowUnknown: true });

module.exports = { updateUserSchema, analyticsQuerySchema };
