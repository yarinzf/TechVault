'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/membership.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { orderCreationLimiter } = require('../middleware/rateLimiter');
const { updateNotificationPreferenceSchema, checkoutSchema } = require('../validators/membership.validator');

const router = Router();

// All membership routes require authentication — there is no public,
// unauthenticated way to purchase or affect a membership.
router.use(authenticate);

// Reuses the order-creation limiter — a membership purchase is an order creation.
router.post('/checkout', orderCreationLimiter, validate(checkoutSchema), ctrl.checkout);

router.patch(
  '/notification-preference',
  validate(updateNotificationPreferenceSchema),
  ctrl.updateNotificationPreference
);

module.exports = router;
