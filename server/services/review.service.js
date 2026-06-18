'use strict';

const Review  = require('../models/Review');
const Product = require('../models/Product');
const Order   = require('../models/Order');
const { AppError }    = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');
const { ADMIN_ROLES } = require('../config/roles');
const emitter = require('../events/emitter');
const EVENTS  = require('../events/events');
const audit   = require('./audit.service');

// ─── Eligibility check ────────────────────────────────────────────────────────
// A user may review a product once they have a paid, non-cancelled order
// containing that product (covers confirmed → shipped → delivered, i.e. any
// post-payment state).  We no longer require `delivered` so customers can
// share first impressions immediately after payment clears.
const _findPurchasedOrder = (userId, productId) =>
  Order.findOne({
    user:            userId,
    paymentStatus:   'paid',
    status:          { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
    'items.product': productId,
  }).select('_id orderNumber');

const checkEligibility = async (userId, productId) => {
  const [purchasedOrder, existingReview] = await Promise.all([
    _findPurchasedOrder(userId, productId),
    Review.findOne({ user: userId, product: productId }).lean(),
  ]);

  if (existingReview) {
    return {
      canReview:   false,
      hasReviewed: true,
      userReview:  existingReview,
      reason:      'already_reviewed',
    };
  }
  if (!purchasedOrder) {
    return {
      canReview:   false,
      hasReviewed: false,
      userReview:  null,
      reason:      'not_purchased',
    };
  }
  return {
    canReview:   true,
    hasReviewed: false,
    userReview:  null,
    orderId:     purchasedOrder._id,
    reason:      'eligible',
  };
};

// ─── Create review ────────────────────────────────────────────────────────────
const createReview = async (userId, productId, dto) => {
  const product = await Product.findOne({ _id: productId, isPublished: true, isDeleted: false });
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');

  const purchasedOrder     = await _findPurchasedOrder(userId, productId);
  const isVerifiedPurchase = !!purchasedOrder;

  try {
    const review = await Review.create({
      ...dto,
      user:               userId,
      product:            productId,
      order:              purchasedOrder?._id ?? null,
      isVerifiedPurchase,
    });

    emitter.emit(EVENTS.REVIEW_CREATED, {
      reviewId:    review._id,
      productId,
      productName: product.name,
      userId,
      rating:      review.rating,
      isVerifiedPurchase,
    });

    return review;
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError('You have already reviewed this product', StatusCodes.CONFLICT, 'REVIEW_EXISTS');
    }
    throw err;
  }
};

// ─── List product reviews (public) ───────────────────────────────────────────
// Only published reviews shown publicly.
// The requesting user's own review is always included so they can see/edit it.
const listProductReviews = async (productId, query, viewerUserId = null) => {
  const { page, limit, skip } = paginate(query);

  const filter = viewerUserId
    ? { product: productId, $or: [{ status: 'published' }, { user: viewerUserId }] }
    : { product: productId, status: 'published' };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name'),
    Review.countDocuments(filter),
  ]);

  return { reviews, meta: paginateMeta(total, page, limit) };
};

// ─── Update own review ────────────────────────────────────────────────────────
const updateReview = async (reviewId, userId, dto) => {
  const review = await Review.findOneAndUpdate(
    { _id: reviewId, user: userId },
    { $set: dto },
    { new: true, runValidators: true },
  );
  if (!review) throw new AppError('Review not found', StatusCodes.NOT_FOUND, 'REVIEW_NOT_FOUND');

  // findOneAndUpdate skips post('save') — recalculate explicitly when rating changes
  if (dto.rating !== undefined) {
    await Review.recalculateRating(review.product);
  }

  return review;
};

// ─── Delete review (owner or admin) ──────────────────────────────────────────
const deleteReview = async (reviewId, userId, role) => {
  const isAdmin = ADMIN_ROLES.includes(role);
  const filter  = isAdmin ? { _id: reviewId } : { _id: reviewId, user: userId };

  const review = await Review.findOneAndDelete(filter);
  if (!review) throw new AppError('Review not found', StatusCodes.NOT_FOUND, 'REVIEW_NOT_FOUND');

  audit.log({
    action:   'review.deleted',
    entity:   'Review',
    entityId: review._id,
    actor:    { _id: userId, role },
    before:   { rating: review.rating, status: review.status },
    after:    null,
  });
};

// ─── Admin: list all reviews with filters ────────────────────────────────────
const listAllReviews = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = {};
  if (query.status)    filter.status  = query.status;
  if (query.productId) filter.product = query.productId;
  if (query.userId)    filter.user    = query.userId;
  if (query.rating)    filter.rating  = Number(query.rating);

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user',    'name email')
      .populate('product', 'name slug'),
    Review.countDocuments(filter),
  ]);

  return { reviews, meta: paginateMeta(total, page, limit) };
};

// ─── Admin: moderate review (published | hidden | flagged) ────────────────────
const moderateReview = async (reviewId, status, actor) => {
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { $set: { status } },
    { new: true },
  );
  if (!review) throw new AppError('Review not found', StatusCodes.NOT_FOUND, 'REVIEW_NOT_FOUND');

  // Status change can affect the published count → recalculate immediately
  await Review.recalculateRating(review.product);

  audit.log({
    action:   'review.moderated',
    entity:   'Review',
    entityId: review._id,
    actor,
    before:   null,
    after:    { status },
  });

  return review;
};

module.exports = {
  checkEligibility,
  createReview,
  listProductReviews,
  updateReview,
  deleteReview,
  listAllReviews,
  moderateReview,
};
