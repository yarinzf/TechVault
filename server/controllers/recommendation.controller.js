'use strict';

const svc = require('../services/recommendation.service');
const { sendSuccess } = require('../utils/response');

const getRecommendations = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    const [related, alsoBought] = await Promise.all([
      svc.getProductRecommendations(req.params.productId, limit),
      svc.getAlsoBought(req.params.productId, 6),
    ]);
    sendSuccess(res, { related, alsoBought });
  } catch (err) { next(err); }
};

const getTrending = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    const products = await svc.getTrending(limit);
    sendSuccess(res, { products });
  } catch (err) { next(err); }
};

const getTopRated = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    const products = await svc.getTopRated(limit);
    sendSuccess(res, { products });
  } catch (err) { next(err); }
};

const getBestSellers = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    const products = await svc.getBestSellers(limit);
    sendSuccess(res, { products });
  } catch (err) { next(err); }
};

module.exports = { getRecommendations, getTrending, getTopRated, getBestSellers };
