'use strict';

const { Router } = require('express');
const publicCampaignCtrl = require('../controllers/publicCampaign.controller');
const { optionalAuth } = require('../middleware/auth');

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

/**
 * @swagger
 * /campaigns/active:
 *   get:
 *     summary: Get every currently active, storefront-eligible campaign (Deals page)
 *     tags: [Campaigns]
 *     responses:
 *       200:
 *         description: Active campaigns with their available, priced products
 */
router.get('/active', publicCampaignCtrl.getActiveCampaigns);

/**
 * @swagger
 * /campaigns/club-summary:
 *   get:
 *     summary: Real Club-page data — active points campaign teaser + VIP-only exclusive deals
 *     description: >
 *       Public, but personalized when authenticated (optionalAuth). A
 *       non-member never receives a membershipOnly campaign's price —
 *       vipDeals is always empty for them, server-enforced.
 *     tags: [Campaigns]
 *     responses:
 *       200:
 *         description: "{ pointsCampaign: object|null, vipDeals: array }"
 */
router.get('/club-summary', optionalAuth, publicCampaignCtrl.getClubSummary);

module.exports = router;
