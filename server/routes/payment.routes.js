'use strict';

const { Router }   = require('express');
const ctrl         = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { createIntentSchema, confirmPaymentSchema } = require('../validators/payment.validator');

const router = Router();

// ── Authenticated payment operations ─────────────────────────────────────────
// Webhook is NOT here — it is registered directly on app before express.json()
// because Stripe signature verification requires the raw request body.
router.use(authenticate);

router.post('/create-intent', paymentLimiter, validate(createIntentSchema), ctrl.createIntent);
router.post('/confirm',       paymentLimiter, validate(confirmPaymentSchema), ctrl.confirmPayment);

module.exports = router;
