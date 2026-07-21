'use strict';

const { Router } = require('express');
const publicCampaignCtrl = require('../controllers/publicCampaign.controller');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Campaigns
 *   description: Public, read-only campaign data
 */

/**
 * @swagger
 * /campaigns/weekly-deal:
 *   get:
 *     summary: Get the currently active homepage Weekly Deal, if any
 *     tags: [Campaigns]
 *     responses:
 *       200:
 *         description: "The active Weekly Deal, or a null deal if none exists"
 */
router.get('/weekly-deal', publicCampaignCtrl.getWeeklyDeal);

module.exports = router;
