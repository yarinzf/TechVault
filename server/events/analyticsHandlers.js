'use strict';

/**
 * Domain-event -> ProductSalesMonthly incremental-rebuild bridge.
 *
 * Keeps the CURRENT (real, live) month's ProductSalesMonthly rows fresh as
 * real orders are paid/cancelled/refunded, instead of relying solely on the
 * manual CLI rebuild script — reuses rebuildProductSalesMonth exactly as-is,
 * scoped (via its optional productIds filter) to just the affected order's
 * products for a cheap, single-order-sized recompute.
 *
 * Call registerAnalyticsHandlers() ONCE from server.js after registerBridge().
 */

const emitter = require('./emitter');
const EVENTS  = require('./events');
const Order   = require('../models/Order');
const logger  = require('../config/logger');
const { rebuildProductSalesMonth } = require('../services/productSalesAnalytics.service');

let _registered = false;

// Re-derives the UTC {year, month} + product id list for one order and
// rebuilds just that scope. Failures are logged, never thrown — this is a
// materialized-view refresh, not part of the payment/cancellation/refund
// transaction itself (ProductSalesMonthly is always fully re-derivable from
// Orders later via the CLI script if an event is ever missed).
async function rebuildForOrder(orderId) {
  const order = await Order.findById(orderId).select('createdAt items').lean();
  if (!order) return;

  const productIds = order.items
    .filter((it) => it.itemType === 'product' && it.product)
    .map((it) => it.product);
  if (productIds.length === 0) return;

  const year  = order.createdAt.getUTCFullYear();
  const month = order.createdAt.getUTCMonth() + 1;
  await rebuildProductSalesMonth(year, month, { productIds });
}

const registerAnalyticsHandlers = () => {
  if (_registered) return;
  _registered = true;

  const handler = (eventName) => (data) => {
    rebuildForOrder(data.orderId).catch((err) =>
      logger.warn('product_sales_incremental_rebuild_failed', {
        event: eventName, orderId: data.orderId, message: err.message,
      })
    );
  };

  emitter.on(EVENTS.PAYMENT_PAID, handler(EVENTS.PAYMENT_PAID));
  emitter.on(EVENTS.ORDER_CANCELLED, handler(EVENTS.ORDER_CANCELLED));
  emitter.on(EVENTS.PAYMENT_REFUNDED, handler(EVENTS.PAYMENT_REFUNDED));
};

module.exports = { registerAnalyticsHandlers };
