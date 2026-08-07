'use strict';

const Joi = require('joi');

// Deliberately the ONLY membership field a user may self-update. Even if a
// client appends status/joinedAt/points/lifetimePoints to the body, Joi
// strips them (see middleware/validate.js stripUnknown) before the
// controller/service ever sees them.
const updateNotificationPreferenceSchema = Joi.object({
  notificationPreference: Joi.string().valid('none', 'email', 'sms', 'both').required(),
});

module.exports = { updateNotificationPreferenceSchema };
