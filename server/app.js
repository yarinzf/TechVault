'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const swaggerUi = require('swagger-ui-express');
const { StatusCodes } = require('http-status-codes');

const env = require('./config/env');
const logger = require('./config/logger');
const swaggerSpecs = require('./config/swagger');
const { errorHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');
const { metricsMiddleware, registry } = require('./middleware/metrics');
const { requireFeature } = require('./middleware/featureFlag');
const { correlationId } = require('./middleware/correlationId');

const paymentRoutes      = require('./routes/payment.routes');
const authRoutes         = require('./routes/auth.routes');
const locationRoutes     = require('./routes/location.routes');
const currencyRoutes     = require('./routes/currency.routes');
const productRoutes      = require('./routes/product.routes');
const cartRoutes         = require('./routes/cart.routes');
const orderRoutes        = require('./routes/order.routes');
const adminRoutes        = require('./routes/admin.routes');
const { productReviewRouter, reviewManagementRouter } = require('./routes/review.routes');
const wishlistRoutes     = require('./routes/wishlist.routes');
const couponRoutes       = require('./routes/coupon.routes');
const notificationRoutes = require('./routes/notification.routes');
const systemRoutes       = require('./routes/system.routes');

const app = express();

// ─── Trust proxy (nginx / Docker reverse proxy) ─────────────────────────────
// Required for correct req.ip, X-Forwarded-Proto awareness, and secure cookies.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ─── Correlation ID — must be first so every layer has req.correlationId ─────
app.use(correlationId);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),
  credentials: true,
}));
app.use(mongoSanitize());

// ─── Stripe webhook — must be registered BEFORE express.json() ───────────────
// Stripe signature verification requires the raw (unparsed) request body.
// If express.json() ran first, req.body would be a parsed object and
// constructEvent() would throw a signature mismatch error.
{
  const paymentCtrl = require('./controllers/payment.controller');
  const API_V       = `/api/${env.API_VERSION || 'v1'}`;
  app.post(
    `${API_V}/payments/webhook`,
    express.raw({ type: 'application/json' }),
    paymentCtrl.handleWebhook,
  );
}

// ─── Body & cookie parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser(env.COOKIE_SECRET));

// ─── HTTP access logging (skip in test) ──────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  // Add correlation ID as the first token so every access log line is traceable
  morgan.token('correlation-id', (req) => req.correlationId || '-');
  app.use(morgan(
    ':correlation-id :method :url :status :res[content-length] - :response-time ms',
    { stream: { write: (m) => logger.info(m.trim()) } }
  ));
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Scoped to /api so Prometheus (/metrics) and Swagger (/api-docs) are excluded.
// Health checks and OPTIONS preflight are skipped inside the limiter itself.
// The Stripe webhook is naturally excluded — it is registered and responded to
// earlier in the middleware stack, before this limiter is reached.
app.use('/api', generalLimiter);

// ─── Prometheus request tracking ─────────────────────────────────────────────
app.use(metricsMiddleware);

// ─── API routes ───────────────────────────────────────────────────────────────
const API = `/api/${env.API_VERSION || 'v1'}`;

app.use(`${API}/auth`,                          authRoutes);
app.use(`${API}/locations`,                     locationRoutes);
app.use(`${API}/currency`,                      currencyRoutes);
app.use(`${API}/products`,                      productRoutes);
app.use(`${API}/products/:productId/reviews`,   requireFeature('reviews'), productReviewRouter);
app.use(`${API}/reviews`,                       requireFeature('reviews'), reviewManagementRouter);
app.use(`${API}/cart`,                          cartRoutes);
app.use(`${API}/orders`,                        orderRoutes);
app.use(`${API}/wishlist`,                      requireFeature('wishlist'), wishlistRoutes);
app.use(`${API}/coupons`,                       requireFeature('coupons'), couponRoutes);
app.use(`${API}/notifications`,                 requireFeature('notifications'), notificationRoutes);
app.use(`${API}/payments`,                      paymentRoutes);
app.use(`${API}/admin`,                         adminRoutes);
app.use(`${API}`,                               systemRoutes);

// ─── Swagger UI ───────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, { explorer: true }));
}

// ─── Prometheus scrape endpoint ───────────────────────────────────────────────
app.get(env.METRICS_PATH || '/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} not found`, details: [] },
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
