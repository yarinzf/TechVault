'use strict';

const Joi = require('joi');
const { METRICS } = require('../models/BusinessTarget');

const upsertTargetSchema = Joi.object({
  metric:      Joi.string().valid(...METRICS).required(),
  periodType:  Joi.string().valid('day', 'month').required(),
  // Any real Date/timestamp within the target period — the service resolves
  // it to the exact Israel day/month boundary, so the client does not need
  // to compute that boundary itself.
  periodStart: Joi.date().iso().required(),
  targetValue: Joi.number().min(0).required(),
  notes:       Joi.string().trim().max(500).allow(''),
});

module.exports = { upsertTargetSchema };
