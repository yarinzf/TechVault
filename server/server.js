'use strict';

require('./config/env'); // validate env at startup — fails fast if misconfigured

const http = require('http');
const app  = require('./app');
const { connectDB }      = require('./config/db');
const logger             = require('./config/logger');
const env                = require('./config/env');
const { startJobs }      = require('./jobs');
const { initSocket, getIO } = require('./socket');
const { registerBridge } = require('./events/socket.bridge');
const { registerNotificationHandlers } = require('./events/notificationHandlers');
const emailListener = require('./services/email/email.listener');

const PORT   = env.PORT || 5000;
const server = http.createServer(app);

const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    try {
      // Close Socket.IO before Mongoose so in-flight events drain cleanly
      try { getIO().close(); } catch (_) { /* not yet initialized — skip */ }

      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { err: err.message });
      process.exit(1);
    }
  });
  // Force exit after 10 s
  setTimeout(() => { logger.error('Graceful shutdown timed out — forcing exit'); process.exit(1); }, 10_000);
};

const start = async () => {
  try {
    await connectDB();

    if (env.NODE_ENV !== 'test') {
      initSocket(server);                 // attach Socket.IO to the HTTP server
      registerBridge();                   // wire internal EventEmitter → admin socket room
      registerNotificationHandlers();     // wire domain events → AdminNotification DB writes
      emailListener.init();               // wire domain events → transactional emails
      startJobs();
    }

    server.listen(PORT, () => {
      logger.info(`🚀 TechVault4 running on port ${PORT} [${env.NODE_ENV}]`);
      logger.info(`   API:     http://localhost:${PORT}/api/${env.API_VERSION}`);
      logger.info(`   Docs:    http://localhost:${PORT}/api-docs`);
      logger.info(`   Sockets: ws://localhost:${PORT}/admin`);
    });
  } catch (err) {
    logger.error('Failed to start server', { err: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason });
  shutdown('UNHANDLED_REJECTION');
});

start();
