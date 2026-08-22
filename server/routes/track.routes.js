'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/track.controller');

const router = Router();

// Public, unauthenticated (anonymous visitors are the whole point) — covered
// by the blanket generalLimiter already applied to all of /api in app.js.
router.post('/visit', ctrl.recordVisit);

module.exports = router;
