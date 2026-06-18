'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/coupon.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { couponLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { createCouponSchema, updateCouponSchema, validateCouponSchema } = require('../validators/coupon.validator');
const { ADMIN_ROLES } = require('../config/roles');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Coupon management
 */

/**
 * @swagger
 * /coupons/validate:
 *   post:
 *     summary: Validate a coupon code against a subtotal
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, subtotal]
 *             properties:
 *               code:     { type: string }
 *               subtotal: { type: number }
 *     responses:
 *       200:
 *         description: Discount amount and final total
 *       400:
 *         description: Coupon invalid, expired, or minimum order not met
 */
// NOTE: must be before /:id to avoid param capture
router.post('/validate', authenticate, couponLimiter, validate(validateCouponSchema), ctrl.validateCoupon);

/**
 * @swagger
 * /coupons:
 *   post:
 *     summary: Create coupon (admin)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authenticate, authorize(...ADMIN_ROLES), validate(createCouponSchema), ctrl.createCoupon);

/**
 * @swagger
 * /coupons:
 *   get:
 *     summary: List all coupons (admin)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticate, authorize(...ADMIN_ROLES), ctrl.listCoupons);

/**
 * @swagger
 * /coupons/{id}:
 *   patch:
 *     summary: Update coupon (admin)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', authenticate, authorize(...ADMIN_ROLES), validate(updateCouponSchema), ctrl.updateCoupon);

/**
 * @swagger
 * /coupons/{id}:
 *   delete:
 *     summary: Deactivate coupon (admin soft-delete)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticate, authorize(...ADMIN_ROLES), ctrl.deactivateCoupon);

module.exports = router;
