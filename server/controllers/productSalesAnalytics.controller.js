'use strict';

const svc = require('../services/productSalesAnalytics.service');
const { sendSuccess } = require('../utils/response');

const getProductSalesHistory = async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 24);
    const history = await svc.getProductSalesHistory(req.params.productId, months);
    sendSuccess(res, history);
  } catch (err) { next(err); }
};

module.exports = { getProductSalesHistory };
