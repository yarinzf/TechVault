'use strict';

const { StatusCodes } = require('http-status-codes');
const { sendSuccess, sendError } = require('../utils/response');
const locationService = require('../services/location.service');

const getCountries = async (req, res, next) => {
  try {
    const countries = await locationService.getCountries();
    sendSuccess(res, countries, 'Countries retrieved');
  } catch (err) {
    next(err);
  }
};

const getCities = async (req, res, next) => {
  const { country } = req.query;
  if (!country) {
    return sendError(res, 'country query param is required', 'MISSING_PARAM', StatusCodes.BAD_REQUEST);
  }
  try {
    const cities = await locationService.getCities(country);
    sendSuccess(res, cities, 'Cities retrieved');
  } catch (err) {
    next(err);
  }
};

const getStreets = async (req, res, next) => {
  const { country, city } = req.query;
  if (!country || !city) {
    return sendError(res, 'country and city query params are required', 'MISSING_PARAM', StatusCodes.BAD_REQUEST);
  }
  try {
    const streets = await locationService.getStreets(country, city);
    sendSuccess(res, streets, 'Streets retrieved');
  } catch (err) {
    next(err);
  }
};

module.exports = { getCountries, getCities, getStreets };
