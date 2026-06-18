'use strict';

const client = require('prom-client');

// Expose default Node.js metrics (memory, CPU, GC, etc.)
client.collectDefaultMetrics({ prefix: 'techvault_' });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const httpTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active HTTP connections',
});

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  activeConnections.inc();

  res.on('finish', () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpDuration.observe(labels, durationSec);
    httpTotal.inc(labels);
    activeConnections.dec();
  });

  next();
};

module.exports = { metricsMiddleware, registry: client.register };
