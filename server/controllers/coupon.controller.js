'use strict';

const Coupon        = require('../models/Coupon');
const couponService = require('../services/coupon.service');
const audit         = require('../services/audit.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const validateCoupon = async (req, res, next) => {
  try {
    const { coupon, discount, finalTotal } = await couponService.validateCoupon(
      req.body.code,
      req.user._id,
      req.body.subtotal
    );
    sendSuccess(res, { coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount, finalTotal });
  } catch (err) { next(err); }
};

const createCoupon = async (req, res, next) => {
  try {
    const coupon = await couponService.createCoupon(req.body);
    audit.log({
      action:   'coupon.created',
      entity:   'Coupon',
      entityId: coupon._id,
      actor:    req.user,
      after:    { code: coupon.code, type: coupon.type, value: coupon.value, usageLimit: coupon.usageLimit, isActive: coupon.isActive },
      req,
    });
    sendSuccess(res, { coupon }, 'Coupon created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const listCoupons = async (req, res, next) => {
  try {
    const { coupons, meta } = await couponService.listCoupons(req.query);
    sendSuccess(res, { coupons }, 'Coupons retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const updateCoupon = async (req, res, next) => {
  try {
    const before = await Coupon.findById(req.params.id).select('code type value usageLimit isActive validFrom validUntil').lean();
    const coupon = await couponService.updateCoupon(req.params.id, req.body);
    audit.log({
      action:   'coupon.updated',
      entity:   'Coupon',
      entityId: coupon._id,
      actor:    req.user,
      before:   before ? { code: before.code, type: before.type, value: before.value, usageLimit: before.usageLimit, isActive: before.isActive } : null,
      after:    { code: coupon.code, type: coupon.type, value: coupon.value, usageLimit: coupon.usageLimit, isActive: coupon.isActive },
      req,
    });
    sendSuccess(res, { coupon }, 'Coupon updated');
  } catch (err) { next(err); }
};

const deactivateCoupon = async (req, res, next) => {
  try {
    const before = await Coupon.findById(req.params.id).select('code isActive').lean();
    await couponService.deactivateCoupon(req.params.id);
    audit.log({
      action:   'coupon.deactivated',
      entity:   'Coupon',
      entityId: req.params.id,
      actor:    req.user,
      before:   before ? { code: before.code, isActive: before.isActive } : null,
      after:    { isActive: false },
      req,
    });
    sendSuccess(res, null, 'Coupon deactivated');
  } catch (err) { next(err); }
};

module.exports = { validateCoupon, createCoupon, listCoupons, updateCoupon, deactivateCoupon };
