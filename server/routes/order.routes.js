'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/order.controller');
const returnCtrl = require('../controllers/return.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { orderCreationLimiter } = require('../middleware/rateLimiter');
const { createOrderSchema, updateStatusSchema } = require('../validators/order.validator');
const { createReturnSchema } = require('../validators/return.validator');
const { ADMIN_ROLES, STAFF_ROLES } = require('../config/roles');

const router = Router();

// All order routes require authentication
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order management
 */

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create order from cart
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shippingAddress]
 *             properties:
 *               shippingAddress:
 *                 $ref: '#/components/schemas/ShippingAddress'
 *               notes: { type: string }
 *           example:
 *             shippingAddress:
 *               street: "123 Main St"
 *               city: "Tel Aviv"
 *               zip: "61000"
 *               country: "IL"
 *             notes: "Please leave at the door"
 *     responses:
 *       201:
 *         description: Order created — cart cleared, stock decremented
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Order created"
 *               data:
 *                 order:
 *                   _id: "665d4c5b1e2f3a4b5c6d7e8f"
 *                   orderNumber: "ORD-20240101-A1B2C3D4"
 *                   status: "pending"
 *                   total: 2339.98
 *       400:
 *         description: Cart is empty or insufficient stock
 *         content:
 *           application/json:
 *             examples:
 *               empty_cart:
 *                 value: { success: false, error: { code: "CART_EMPTY", message: "Cart is empty", details: [] } }
 *               insufficient_stock:
 *                 value: { success: false, error: { code: "INSUFFICIENT_STOCK", message: "Insufficient stock for \"MacBook Pro 14\"\" (available: 1)", details: [] } }
 */
router.post('/', orderCreationLimiter, validate(createOrderSchema), ctrl.createOrder);

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: List own orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated order list
 */
router.get('/', ctrl.listMyOrders);

/**
 * @swagger
 * /orders/all:
 *   get:
 *     summary: List all orders across all users (admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of all orders
 *       403:
 *         description: Admin access required
 */
// NOTE: must be declared before /:id to prevent Express matching "all" as an id param
// STAFF_ROLES includes warehouse — fulfillment staff need to list all orders to process them
router.get('/all', authorize(...STAFF_ROLES), ctrl.listAllOrders);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get single order (owner or admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order detail
 *       403:
 *         description: Not the order owner
 *       404:
 *         description: Order not found
 */
router.get('/:id', ctrl.getOrder);

/**
 * @swagger
 * /orders/{id}/cancel:
 *   patch:
 *     summary: Cancel own order (only if pending or confirmed)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order cancelled, stock restored
 *       400:
 *         description: Order cannot be cancelled in current status
 */
router.patch('/:id/cancel', ctrl.cancelOrder);

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order status (admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid status transition
 */
router.patch('/:id/status', authorize(...STAFF_ROLES), validate(updateStatusSchema), ctrl.updateStatus);

/**
 * @swagger
 * /orders/{id}/timeline:
 *   get:
 *     summary: Get status change history for an order (staff only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status timeline
 *       403:
 *         description: Staff access required
 *       404:
 *         description: Order not found
 */
router.get('/:id/timeline', authorize(...STAFF_ROLES), ctrl.getTimeline);

// Customer return requests
router.post('/:id/return',   validate(createReturnSchema), returnCtrl.requestReturn);
router.get ('/:id/returns',  returnCtrl.listMyReturns);

module.exports = router;
