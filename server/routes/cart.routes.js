'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/cart.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { addItemSchema, updateItemSchema } = require('../validators/cart.validator');

const router = Router();

// All cart routes require authentication
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping cart management
 */

/**
 * @swagger
 * /cart:
 *   get:
 *     summary: Get own cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart contents with subtotal
 */
router.get('/', ctrl.getCart);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     summary: Add item to cart (or increment quantity if already present)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string }
 *               quantity:  { type: integer, minimum: 1, default: 1 }
 *     responses:
 *       200:
 *         description: Updated cart
 *       404:
 *         description: Product not found
 *       400:
 *         description: Insufficient stock
 */
router.post('/items', validate(addItemSchema), ctrl.addItem);

/**
 * @swagger
 * /cart/items/{productId}:
 *   patch:
 *     summary: Update item quantity
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Updated cart
 */
router.patch('/items/:productId', validate(updateItemSchema), ctrl.updateItem);

/**
 * @swagger
 * /cart/items/{productId}:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated cart
 */
router.delete('/items/:productId', ctrl.removeItem);

/**
 * @swagger
 * /cart:
 *   delete:
 *     summary: Clear all items from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.delete('/', ctrl.clearCart);

module.exports = router;
