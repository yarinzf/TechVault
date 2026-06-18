'use strict';

const { Router } = require('express');
const mongoose = require('mongoose');
const { sendSuccess } = require('../utils/response');

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service status
 */
router.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  sendSuccess(res, {
    status: 'ok',
    db: dbState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
