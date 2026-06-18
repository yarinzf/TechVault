'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/location.controller');

const router = Router();

// Public endpoints — no authentication required.
// Location data is reference data consumed by the checkout form.

router.get('/countries', ctrl.getCountries);
router.get('/cities',   ctrl.getCities);
router.get('/streets',  ctrl.getStreets);

module.exports = router;
