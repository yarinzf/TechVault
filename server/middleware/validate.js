'use strict';

const { StatusCodes } = require('http-status-codes');

/**
 * Joi validation middleware factory.
 * @param {import('joi').Schema} schema
 * @param {'body'|'params'|'query'} source
 */
const validate = (schema, source = 'body') => async (req, res, next) => {
  try {
    const input = req[source];
    const validated = await schema.validateAsync(input, {
      abortEarly: false,
      stripUnknown: true,
    });
    req[source] = validated;
    next();
  } catch (err) {
    if (err.isJoi) {
      const details = err.details.map(d => ({ field: d.path.join('.'), message: d.message }));
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
      });
    }
    next(err);
  }
};

module.exports = { validate };
