'use strict';

const { StatusCodes } = require('http-status-codes');

/**
 * Send a standardised success response.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {string} message
 * @param {number} statusCode
 * @param {object|null} meta  – pagination, totals, etc.
 */
const sendSuccess = (res, data = null, message = 'OK', statusCode = StatusCodes.OK, meta = null) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Send a standardised error response.
 */
const sendError = (res, message = 'Internal Server Error', code = 'INTERNAL_ERROR', statusCode = StatusCodes.INTERNAL_SERVER_ERROR, details = []) =>
  res.status(statusCode).json({ success: false, error: { code, message, details } });

module.exports = { sendSuccess, sendError };
