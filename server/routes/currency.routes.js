'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/currency.controller');

const router = Router();

// Public — no authentication required.
router.get('/for-country', ctrl.getForCountry);
router.get('/convert',     ctrl.convertCurrency);

module.exports = router;
