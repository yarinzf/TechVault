'use strict';

const Coupon = require('../models/Coupon');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');

// ─── Discount calculation ─────────────────────────────────────────────────────
const calculateDiscount = (coupon, subtotal) => {
  if (coupon.type === 'percentage') {
    const disc = (subtotal * coupon.value) / 100;
    const capped = coupon.maxDiscountAmount ? Math.min(disc, coupon.maxDiscountAmount) : disc;
    return Math.round(capped * 100) / 100;
  }
  // Fixed: cannot exceed the subtotal itself
  return Math.min(coupon.value, subtotal);
};

// ─── Validate coupon against a given subtotal + user ─────────────────────────
const validateCoupon = async (code, userId, subtotal) => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });

  if (!coupon || !coupon.isActive) {
    throw new AppError('Coupon not found or inactive', StatusCodes.NOT_FOUND, 'COUPON_NOT_FOUND');
  }

  const now = new Date();
  if (coupon.validFrom  && now < coupon.validFrom) {
    throw new AppError('Coupon is not yet valid', StatusCodes.BAD_REQUEST, 'COUPON_NOT_YET_VALID');
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    throw new AppError('Coupon has expired', StatusCodes.BAD_REQUEST, 'COUPON_EXPIRED');
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError('Coupon usage limit reached', StatusCodes.BAD_REQUEST, 'COUPON_LIMIT_REACHED');
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(
      `Minimum order amount for this coupon is ${coupon.minOrderAmount}`,
      StatusCodes.BAD_REQUEST,
      'COUPON_MIN_ORDER'
    );
  }

  // Per-user usage check
  const userEntry = coupon.userUsage.find(u => u.user.toString() === userId.toString());
  if (userEntry && userEntry.count >= coupon.perUserLimit) {
    throw new AppError('You have already used this coupon the maximum number of times', StatusCodes.BAD_REQUEST, 'COUPON_USER_LIMIT');
  }

  const discount = calculateDiscount(coupon, subtotal);
  return { coupon, discount, finalTotal: Math.round((subtotal - discount) * 100) / 100 };
};

// ─── Admin CRUD ───────────────────────────────────────────────────────────────
const createCoupon = async (dto) => {
  try {
    return await Coupon.create(dto);
  } catch (err) {
    if (err.code === 11000) throw new AppError('Coupon code already exists', StatusCodes.CONFLICT, 'COUPON_EXISTS');
    throw err;
  }
};

const listCoupons = async (query) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Coupon.countDocuments(filter),
  ]);
  return { coupons, meta: paginateMeta(total, page, limit) };
};

const updateCoupon = async (id, dto) => {
  const coupon = await Coupon.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true });
  if (!coupon) throw new AppError('Coupon not found', StatusCodes.NOT_FOUND, 'COUPON_NOT_FOUND');
  return coupon;
};

// Soft-deactivate rather than destroy — preserves historical usage data
const deactivateCoupon = async (id) => {
  const coupon = await Coupon.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!coupon) throw new AppError('Coupon not found', StatusCodes.NOT_FOUND, 'COUPON_NOT_FOUND');
  return coupon;
};

// ─── Increment usage — called after successful payment only ──────────────────
// Two-step upsert: try to $inc an existing userUsage entry; if the user has no
// entry yet, push a new one.  Both paths also increment usedCount.
// Non-throwing: caller wraps in .catch(() => {}) so a counter failure never
// rolls back a confirmed payment.
const incrementCouponUsage = async (code, userId) => {
  const upper = code.toUpperCase();

  // Try to increment an existing per-user entry
  const updated = await Coupon.findOneAndUpdate(
    { code: upper, 'userUsage.user': userId },
    { $inc: { usedCount: 1, 'userUsage.$.count': 1 } }
  );

  if (!updated) {
    // No per-user entry yet — push one and bump global counter
    await Coupon.findOneAndUpdate(
      { code: upper },
      { $inc: { usedCount: 1 }, $push: { userUsage: { user: userId, count: 1 } } }
    );
  }
};

module.exports = {
  validateCoupon, calculateDiscount,
  createCoupon, listCoupons, updateCoupon, deactivateCoupon,
  incrementCouponUsage,
};
