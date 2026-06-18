'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/wishlist.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: User wishlist
 */

/** @swagger
 * /wishlist:
 *   get:
 *     summary: Get own wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', ctrl.getWishlist);

/** @swagger
 * /wishlist/{productId}:
 *   post:
 *     summary: Add product to wishlist (idempotent)
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:productId', ctrl.addProduct);

/** @swagger
 * /wishlist/{productId}:
 *   delete:
 *     summary: Remove product from wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:productId', ctrl.removeProduct);

module.exports = router;
