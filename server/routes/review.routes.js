'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/review.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createReviewSchema, updateReviewSchema } = require('../validators/review.validator');
const { ADMIN_ROLES } = require('../config/roles');

// mergeParams: true allows access to :productId from the parent route
const productReviewRouter  = Router({ mergeParams: true });
const reviewManagementRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Product reviews
 */

// ─── Mounted at /products/:productId/reviews ──────────────────────────────────

// Eligibility must be declared before GET '/' so Express does not treat
// the literal "eligibility" path segment as a page/limit query.
productReviewRouter.get('/eligibility', authenticate, ctrl.checkEligibility);

/**
 * @swagger
 * /products/{productId}/reviews:
 *   get:
 *     summary: List reviews for a product
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated review list
 */
// optionalAuth: if logged in, viewer's own hidden review is included in results
productReviewRouter.get('/', optionalAuth, ctrl.listProductReviews);

/**
 * @swagger
 * /products/{productId}/reviews:
 *   post:
 *     summary: Create a review (one per product per user)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Review created, product rating recalculated
 *       409:
 *         description: Already reviewed this product
 */
productReviewRouter.post('/', authenticate, validate(createReviewSchema), ctrl.createReview);

// ─── Mounted at /reviews ──────────────────────────────────────────────────────

/**
 * @swagger
 * /reviews/{id}:
 *   patch:
 *     summary: Update own review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 */
reviewManagementRouter.patch('/:id', authenticate, validate(updateReviewSchema), ctrl.updateReview);

/**
 * @swagger
 * /reviews/{id}:
 *   delete:
 *     summary: Delete review (owner or admin/superadmin)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 */
reviewManagementRouter.delete('/:id', authenticate, ctrl.deleteReview);

module.exports = { productReviewRouter, reviewManagementRouter };
