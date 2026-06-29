'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createProductSchema, updateProductSchema, updateStockSchema } = require('../validators/product.validator');
const { ADMIN_ROLES, STAFF_ROLES } = require('../config/roles');
const recCtrl = require('../controllers/recommendation.controller');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalogue
 */

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products (filter, sort, paginate, search)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Category ObjectId
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [price_asc, price_desc, newest, rating] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated product list
 */
router.get('/', ctrl.list);

/**
 * @swagger
 * /products/autocomplete:
 *   get:
 *     summary: Typeahead — prefix-match product names
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Minimum 2 characters
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 8 }
 *     responses:
 *       200:
 *         description: Matching products
 */
// Must be declared BEFORE /:slug so Express doesn't match these as slugs
router.get('/categories',    ctrl.listCategories);
router.get('/autocomplete',  ctrl.autocomplete);
router.post('/compare',      ctrl.compare);
router.get('/trending',      recCtrl.getTrending);
router.get('/top-rated',     recCtrl.getTopRated);
router.get('/best-sellers',  recCtrl.getBestSellers);

router.get('/:id/stock-history',      authenticate, authorize(...STAFF_ROLES), ctrl.stockHistory);
router.get('/:productId/recommendations', recCtrl.getRecommendations);

/**
 * @swagger
 * /products/{slug}:
 *   get:
 *     summary: Get single product by slug
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product detail
 *       404:
 *         description: Not found
 */
router.get('/:slug', ctrl.getOne);

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create product (admin)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Product created
 *       422:
 *         description: Validation error
 */
router.post('/', authenticate, authorize(...ADMIN_ROLES), validate(createProductSchema), ctrl.create);

/**
 * @swagger
 * /products/{id}/stock:
 *   patch:
 *     summary: Adjust product stock (warehouse + admin)
 *     tags: [Products]
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
 *             required: [type, amount]
 *             properties:
 *               type:   { type: string, enum: [increase, decrease] }
 *               amount: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Stock updated
 *       422:
 *         description: Would make stock negative
 */
router.patch('/:id/stock', authenticate, authorize(...STAFF_ROLES), validate(updateStockSchema), ctrl.updateStock);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update product (admin)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product updated
 */
router.patch('/:id', authenticate, authorize(...ADMIN_ROLES), validate(updateProductSchema), ctrl.update);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Unpublish product (admin soft-delete)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product unpublished
 */
router.delete('/:id', authenticate, authorize(...ADMIN_ROLES), ctrl.remove);

module.exports = router;
