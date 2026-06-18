'use strict';

const analyticsSvc    = require('../services/analytics.service');
const { sendSuccess } = require('../utils/response');

const getOverview = async (req, res, next) => {
  try {
    const data = await analyticsSvc.getOverview(req.query);
    sendSuccess(res, data, 'Analytics overview retrieved');
  } catch (err) { next(err); }
};

const getRevenue = async (req, res, next) => {
  try {
    const data = await analyticsSvc.getRevenueAnalytics(req.query);
    sendSuccess(res, data, 'Revenue analytics retrieved');
  } catch (err) { next(err); }
};

const getOrders = async (req, res, next) => {
  try {
    const data = await analyticsSvc.getOrderAnalytics(req.query);
    sendSuccess(res, data, 'Order analytics retrieved');
  } catch (err) { next(err); }
};

const getProducts = async (req, res, next) => {
  try {
    const data = await analyticsSvc.getProductAnalytics(req.query);
    sendSuccess(res, data, 'Product analytics retrieved');
  } catch (err) { next(err); }
};

module.exports = { getOverview, getRevenue, getOrders, getProducts };
