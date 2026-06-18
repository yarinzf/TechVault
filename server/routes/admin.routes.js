'use strict';

const { Router } = require('express');
const ctrl              = require('../controllers/admin.controller');
const analyticsCtrl     = require('../controllers/analytics.controller');
const campaignCtrl      = require('../controllers/campaign.controller');
const inventoryCtrl     = require('../controllers/inventory.controller');
const warehouseCtrl     = require('../controllers/warehouse.controller');
const refundCtrl        = require('../controllers/refund.controller');
const returnCtrl        = require('../controllers/return.controller');
const supplierCtrl      = require('../controllers/supplier.controller');
const poCtrl            = require('../controllers/purchase-order.controller');
const reportCtrl        = require('../controllers/report.controller');
const notifCtrl         = require('../controllers/adminNotification.controller');
const insightsCtrl      = require('../controllers/insights.controller');
const reviewCtrl        = require('../controllers/review.controller');
const jobsCtrl          = require('../controllers/jobs.controller');
const { moderateReviewSchema } = require('../validators/review.validator');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { adminMutationLimiter } = require('../middleware/rateLimiter');
const { updateUserSchema } = require('../validators/admin.validator');
const { createCampaignSchema, updateCampaignSchema } = require('../validators/campaign.validator');
const { refundOrderSchema } = require('../validators/refund.validator');
const {
  approveRejectSchema,
  markReceivedSchema,
  processRefundSchema,
} = require('../validators/return.validator');
const {
  createSupplierSchema,
  updateSupplierSchema,
} = require('../validators/supplier.validator');
const {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
} = require('../validators/purchase-order.validator');
const { ROLES, ADMIN_ROLES, STAFF_ROLES } = require('../config/roles');

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// Mutation limiter — applied only to state-changing methods; GET reads are unaffected.
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  return adminMutationLimiter(req, res, next);
});

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin panel — analytics, user management, operations
 */

// ─── Role reference ───────────────────────────────────────────────────────────
// superadmin — full access (analytics + user management + operations)
// admin      — analytics + operations, no user management
// warehouse  — fulfillment operations only (order status: confirmed→processing→shipped)
// user       — no admin access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     summary: Summary dashboard — orders, revenue, users, low stock
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 *       403:
 *         description: Admin access required
 */
router.get('/dashboard', authorize(...ADMIN_ROLES), ctrl.getDashboard);
router.get('/activity',  authorize(...ADMIN_ROLES), ctrl.getActivity);

/**
 * @swagger
 * /admin/analytics/revenue:
 *   get:
 *     summary: Revenue grouped by period (day/week/month)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [day, week, month], default: day }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Revenue series
 */
router.get('/analytics/revenue', authorize(...ADMIN_ROLES), ctrl.getRevenue);

/**
 * @swagger
 * /admin/analytics/top-products:
 *   get:
 *     summary: Top products by revenue
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Top products list
 */
router.get('/analytics/top-products', authorize(...ADMIN_ROLES), ctrl.getTopProducts);

// ─── Analytics BI layer ───────────────────────────────────────────────────────
// All analytics endpoints accept ?range=today|7d|30d|90d|1y (default: 30d)
// or explicit ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD for custom windows.

/**
 * @swagger
 * /admin/analytics/overview:
 *   get:
 *     summary: All key KPIs — revenue, orders, customers, open alerts — for a time range
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: [today, 7d, 30d, 90d, 1y], default: 30d }
 *     responses:
 *       200:
 *         description: Analytics overview
 */
router.get('/analytics/overview',  authorize(...ADMIN_ROLES), analyticsCtrl.getOverview);

/**
 * @swagger
 * /admin/analytics/orders:
 *   get:
 *     summary: Order trends, rates, top customers, and anomaly detection
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: [today, 7d, 30d, 90d, 1y], default: 30d }
 *     responses:
 *       200:
 *         description: Order analytics
 */
router.get('/analytics/orders',    authorize(...ADMIN_ROLES), analyticsCtrl.getOrders);

/**
 * @swagger
 * /admin/analytics/products:
 *   get:
 *     summary: Product analytics — top sellers, low conversion, category performance, inventory risk
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: [today, 7d, 30d, 90d, 1y], default: 30d }
 *     responses:
 *       200:
 *         description: Product analytics
 */
router.get('/analytics/products',  authorize(...ADMIN_ROLES), analyticsCtrl.getProducts);
router.get('/insights',            authorize(...ADMIN_ROLES), insightsCtrl.getInsights);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List all users (superadmin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, admin, superadmin, warehouse] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name or email
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated user list
 *       403:
 *         description: Superadmin access required
 */
router.get('/users', authorize(ROLES.SUPERADMIN), ctrl.listUsers);

/**
 * @swagger
 * /admin/users/{id}:
 *   patch:
 *     summary: Update user role or active status (superadmin only)
 *     tags: [Admin]
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
 *             properties:
 *               role:     { type: string, enum: [user, admin, superadmin, warehouse] }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: User updated
 *       403:
 *         description: Cannot change own role
 */
router.patch ('/users/:id',          authorize(ROLES.SUPERADMIN), validate(updateUserSchema), ctrl.updateUser);
// NOTE: /users/:id/sessions registered after PATCH /users/:id — different verb + sub-path, no conflict
router.get   ('/users/:id/sessions', authorize(ROLES.SUPERADMIN), ctrl.getUserSessions);
router.delete('/users/:id/sessions', authorize(ROLES.SUPERADMIN), ctrl.forceLogoutUser);

/**
 * @swagger
 * /admin/alerts:
 *   get:
 *     summary: List system alerts (admin+)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [low_stock, refund_spike, ranking_drop, system] }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [info, warning, critical] }
 *       - in: query
 *         name: isResolved
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated alert list
 */
router.get('/alerts', authorize(...ADMIN_ROLES), ctrl.listAlerts);

/**
 * @swagger
 * /admin/alerts/{id}/resolve:
 *   patch:
 *     summary: Mark an alert as resolved (admin+)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Alert resolved
 *       404:
 *         description: Alert not found or already resolved
 */
router.patch('/alerts/:id/resolve', authorize(...ADMIN_ROLES), ctrl.resolveAlert);

/**
 * @swagger
 * /admin/audit-logs:
 *   get:
 *     summary: List audit logs (superadmin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: entity
 *         schema: { type: string }
 *       - in: query
 *         name: actorId
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated audit log list
 *       403:
 *         description: Superadmin access required
 */
router.get('/audit-logs', authorize(...ADMIN_ROLES), ctrl.listAuditLogs);

// ─── Orders — admin operations ───────────────────────────────────────────────
// Refund: admin and superadmin only (not warehouse — financial operation)
router.post('/orders/:id/refund', authorize(...ADMIN_ROLES), validate(refundOrderSchema), refundCtrl.refundOrder);

// ─── Inventory intelligence ───────────────────────────────────────────────────
// warehouse role included — fulfillment staff can trigger scans and view health.
router.post('/inventory/scan-alerts', authorize(...STAFF_ROLES), inventoryCtrl.scanAlerts);
router.get ('/inventory/health',      authorize(...STAFF_ROLES), inventoryCtrl.getHealth);

// ─── Warehouse stock operations ───────────────────────────────────────────────
router.get ('/inventory/list',                  authorize(...STAFF_ROLES), warehouseCtrl.listInventory);
router.get ('/inventory/movements',             authorize(...STAFF_ROLES), warehouseCtrl.listMovements);
router.post('/inventory/products/:id/restock',  authorize(...STAFF_ROLES), warehouseCtrl.restock);
router.post('/inventory/products/:id/adjust',   authorize(...STAFF_ROLES), warehouseCtrl.adjust);
router.post('/inventory/products/:id/damaged',  authorize(...STAFF_ROLES), warehouseCtrl.damaged);

// ─── Campaigns ────────────────────────────────────────────────────────────────
router.get   ('/campaigns',     authorize(...ADMIN_ROLES), campaignCtrl.list);
router.post  ('/campaigns',     authorize(...ADMIN_ROLES), validate(createCampaignSchema), campaignCtrl.create);
router.patch ('/campaigns/:id', authorize(...ADMIN_ROLES), validate(updateCampaignSchema), campaignCtrl.update);
router.delete('/campaigns/:id', authorize(...ADMIN_ROLES), campaignCtrl.remove);

// ─── Admin notification center ────────────────────────────────────────────────
// read-all must be registered before /:id/read so Express does not treat
// the literal "read-all" as a Mongo ObjectId.
router.get  ('/notifications',          authorize(...STAFF_ROLES), notifCtrl.list);
router.patch('/notifications/read-all', authorize(...STAFF_ROLES), notifCtrl.markAllRead);
router.patch('/notifications/:id/read', authorize(...STAFF_ROLES), notifCtrl.markRead);

// ─── Review moderation ────────────────────────────────────────────────────────
router.get   ('/reviews',              authorize(...ADMIN_ROLES), reviewCtrl.listAllReviews);
router.patch ('/reviews/:id/moderate', authorize(...ADMIN_ROLES), validate(moderateReviewSchema), reviewCtrl.moderateReview);
router.delete('/reviews/:id',          authorize(...ADMIN_ROLES), reviewCtrl.deleteReview);

// ─── Returns management ───────────────────────────────────────────────────────
router.get  ('/returns',                  authorize(...ADMIN_ROLES), returnCtrl.listReturns);
router.get  ('/returns/:id',              authorize(...ADMIN_ROLES), returnCtrl.getReturn);
router.patch('/returns/:id/approve',      authorize(...ADMIN_ROLES), validate(approveRejectSchema), returnCtrl.approveReturn);
router.patch('/returns/:id/reject',       authorize(...ADMIN_ROLES), validate(approveRejectSchema), returnCtrl.rejectReturn);
router.patch('/returns/:id/received',     authorize(...STAFF_ROLES), validate(markReceivedSchema),  returnCtrl.markReceived);
router.patch('/returns/:id/refund',       authorize(...ADMIN_ROLES), validate(processRefundSchema),  returnCtrl.processRefund);

// ─── Suppliers ────────────────────────────────────────────────────────────────
router.get   ('/suppliers',     authorize(...STAFF_ROLES), supplierCtrl.listSuppliers);
router.get   ('/suppliers/:id', authorize(...STAFF_ROLES), supplierCtrl.getSupplier);
router.post  ('/suppliers',     authorize(...ADMIN_ROLES), validate(createSupplierSchema), supplierCtrl.createSupplier);
router.patch ('/suppliers/:id', authorize(...ADMIN_ROLES), validate(updateSupplierSchema), supplierCtrl.updateSupplier);
router.delete('/suppliers/:id', authorize(...ADMIN_ROLES), supplierCtrl.deleteSupplier);

// ─── Reports + CSV export ─────────────────────────────────────────────────────
// NOTE: .csv routes must be registered before bare-name routes to avoid
// Express treating "sales.csv" as a dynamic segment in any future param route.
router.get('/reports/sales.csv',           authorize(...ADMIN_ROLES), reportCtrl.exportSalesCSV);
router.get('/reports/orders.csv',          authorize(...ADMIN_ROLES), reportCtrl.exportOrdersCSV);
router.get('/reports/inventory.csv',       authorize(...ADMIN_ROLES), reportCtrl.exportInventoryCSV);
router.get('/reports/returns.csv',         authorize(...ADMIN_ROLES), reportCtrl.exportReturnsCSV);
router.get('/reports/coupons.csv',         authorize(...ADMIN_ROLES), reportCtrl.exportCouponsCSV);
router.get('/reports/purchase-orders.csv', authorize(...ADMIN_ROLES), reportCtrl.exportPurchaseOrdersCSV);

router.get('/reports/sales',           authorize(...ADMIN_ROLES), reportCtrl.getSalesReport);
router.get('/reports/orders',          authorize(...ADMIN_ROLES), reportCtrl.getOrdersReport);
router.get('/reports/inventory',       authorize(...ADMIN_ROLES), reportCtrl.getInventoryReport);
router.get('/reports/returns',         authorize(...ADMIN_ROLES), reportCtrl.getReturnsReport);
router.get('/reports/coupons',         authorize(...ADMIN_ROLES), reportCtrl.getCouponsReport);
router.get('/reports/purchase-orders', authorize(...ADMIN_ROLES), reportCtrl.getPurchaseOrdersReport);

// ─── Background jobs ──────────────────────────────────────────────────────────
// Status: any admin role; manual trigger: superadmin only
router.get ('/jobs/status',       authorize(...ADMIN_ROLES),      jobsCtrl.getJobsStatus);
router.post('/jobs/:name/run',    authorize(ROLES.SUPERADMIN),    jobsCtrl.triggerJob);

// ─── Purchase orders ──────────────────────────────────────────────────────────
// NOTE: restock-suggestions must be declared before /:id to avoid Express
//       treating the literal string as an ObjectId parameter.
router.get ('/purchase-orders/restock-suggestions', authorize(...STAFF_ROLES), poCtrl.getRestockSuggestions);
router.get ('/purchase-orders',        authorize(...STAFF_ROLES), poCtrl.listPurchaseOrders);
router.get ('/purchase-orders/:id',    authorize(...STAFF_ROLES), poCtrl.getPurchaseOrder);
router.post('/purchase-orders',        authorize(...STAFF_ROLES), validate(createPurchaseOrderSchema), poCtrl.createPurchaseOrder);
router.patch('/purchase-orders/:id',   authorize(...STAFF_ROLES), validate(updatePurchaseOrderSchema), poCtrl.updatePurchaseOrder);
router.post('/purchase-orders/:id/receive', authorize(...STAFF_ROLES), validate(receivePurchaseOrderSchema), poCtrl.receivePurchaseOrder);

module.exports = router;
