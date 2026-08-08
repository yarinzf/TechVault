'use strict';

const Joi = require('joi');
const { MEMBERSHIP_PLAN_KEYS } = require('../config/membership');

// Deliberately the ONLY membership field a user may self-update. Even if a
// client appends status/joinedAt/points/lifetimePoints to the body, Joi
// strips them (see middleware/validate.js stripUnknown) before the
// controller/service ever sees them.
const updateNotificationPreferenceSchema = Joi.object({
  notificationPreference: Joi.string().valid('none', 'email', 'sms', 'both').required(),
});

// The ONLY pricing-adjacent input a client may ever send for a membership
// purchase — a plan KEY, never an amount. The server looks up the real
// price from MEMBERSHIP_PLANS; nothing else in this body is ever accepted.
const checkoutSchema = Joi.object({
  plan: Joi.string().valid(...MEMBERSHIP_PLAN_KEYS).required(),
});

module.exports = { updateNotificationPreferenceSchema, checkoutSchema };
