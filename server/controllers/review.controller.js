'use strict';

const reviewService = require('../services/review.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const checkEligibility = async (req, res, next) => {
  try {
    const result = await reviewService.checkEligibility(req.user._id, req.params.productId);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

const createReview = async (req, res, next) => {
  try {
    const review = await reviewService.createReview(req.user._id, req.params.productId, req.body);
    sendSuccess(res, { review }, 'Review created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const listProductReviews = async (req, res, next) => {
  try {
    // Pass viewer's userId so their own hidden review is still visible to them
    const viewerUserId = req.user?._id ?? null;
    const { reviews, meta } = await reviewService.listProductReviews(
      req.params.productId, req.query, viewerUserId,
    );
    sendSuccess(res, { reviews }, 'Reviews retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const updateReview = async (req, res, next) => {
  try {
    const review = await reviewService.updateReview(req.params.id, req.user._id, req.body);
    sendSuccess(res, { review }, 'Review updated');
  } catch (err) { next(err); }
};

const deleteReview = async (req, res, next) => {
  try {
    await reviewService.deleteReview(req.params.id, req.user._id, req.user.role);
    sendSuccess(res, null, 'Review deleted');
  } catch (err) { next(err); }
};

// ── Admin handlers ─────────────────────────────────────────────────────────────

const listAllReviews = async (req, res, next) => {
  try {
    const { reviews, meta } = await reviewService.listAllReviews(req.query);
    sendSuccess(res, { reviews }, 'Reviews retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const moderateReview = async (req, res, next) => {
  try {
    const review = await reviewService.moderateReview(req.params.id, req.body.status, req.user);
    sendSuccess(res, { review }, 'Review moderated');
  } catch (err) { next(err); }
};

module.exports = {
  checkEligibility, createReview, listProductReviews,
  updateReview, deleteReview,
  listAllReviews, moderateReview,
};
