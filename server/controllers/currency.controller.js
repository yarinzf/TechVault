'use strict';

const { StatusCodes } = require('http-status-codes');
const { sendSuccess, sendError } = require('../utils/response');
const currencyService = require('../services/currency.service');

const getForCountry = async (req, res, next) => {
  const { country } = req.query;
  if (!country) {
    return sendError(res, 'country query param is required', 'MISSING_PARAM', StatusCodes.BAD_REQUEST);
  }
  try {
    const currency = await currencyService.getCountryCurrency(country);
    sendSuccess(res, { country, ...currency }, 'Currency retrieved');
  } catch (err) {
    next(err);
  }
};

const convertCurrency = async (req, res, next) => {
  const { amount, from, to } = req.query;
  if (!amount || !from || !to) {
    return sendError(
      res, 'amount, from, and to query params are required',
      'MISSING_PARAM', StatusCodes.BAD_REQUEST
    );
  }
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    return sendError(res, 'amount must be a non-negative number', 'INVALID_PARAM', StatusCodes.BAD_REQUEST);
  }
  try {
    const result = await currencyService.convertAmount(num, from.toUpperCase(), to.toUpperCase());
    if (!result) {
      return sendError(
        res,
        `Exchange rate unavailable for ${from.toUpperCase()} → ${to.toUpperCase()}`,
        'RATE_UNAVAILABLE',
        StatusCodes.SERVICE_UNAVAILABLE
      );
    }
    sendSuccess(res, {
      amount: num,
      from:   from.toUpperCase(),
      to:     to.toUpperCase(),
      ...result,
    }, 'Conversion successful');
  } catch (err) {
    next(err);
  }
};

module.exports = { getForCountry, convertCurrency };
