'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: In-app notifications
 */

/** GET /notifications?unreadOnly=true */
router.get('/', ctrl.listNotifications);

/** PATCH /notifications/read-all */
router.patch('/read-all', ctrl.markAllRead);

/** PATCH /notifications/:id/read */
router.patch('/:id/read', ctrl.markRead);

/** DELETE /notifications/:id */
router.delete('/:id', ctrl.deleteNotification);

module.exports = router;
