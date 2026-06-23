'use strict';

const { Router } = require('express');
const mongoose = require('mongoose');
const { version } = require('../../package.json');

const router = Router();

const READY_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const formatBytes = (bytes) => {
  const mb = (bytes / 1024 / 1024).toFixed(1);
  return `${mb} MB`;
};

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy (MongoDB disconnected)
 */
router.get('/health', async (req, res) => {
  const dbReadyState = mongoose.connection.readyState;
  const dbConnected = dbReadyState === 1;
  const mem = process.memoryUsage();
  const heapUsedPct = mem.heapUsed / mem.heapTotal;

  const status = dbConnected ? 'healthy' : 'unhealthy';

  const body = {
    status,
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'unknown',
    version,
    node: process.version,
    mongodb: {
      status: READY_STATE_LABELS[dbReadyState] || 'unknown',
      readyState: dbReadyState,
    },
    memory: {
      rss: formatBytes(mem.rss),
      heapUsed: formatBytes(mem.heapUsed),
      heapTotal: formatBytes(mem.heapTotal),
      external: formatBytes(mem.external),
      heapUsedPct: `${(heapUsedPct * 100).toFixed(1)}%`,
      warning: heapUsedPct > 0.9,
    },
    timestamp: new Date().toISOString(),
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json({ success: true, data: body });
});

module.exports = router;
