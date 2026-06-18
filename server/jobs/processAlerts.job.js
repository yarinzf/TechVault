'use strict';

const Product = require('../models/Product');
const Order   = require('../models/Order');
const { createAlertIfNew } = require('../services/alert.service');
const logger  = require('../config/logger');

const LOW_STOCK_THRESHOLD    = parseInt(process.env.LOW_STOCK_THRESHOLD         || '5', 10);
const REFUND_SPIKE_THRESHOLD = parseInt(process.env.ALERT_REFUND_SPIKE_THRESHOLD || '5', 10);

const checkLowStock = async () => {
  const products = await Product.find(
    { isDeleted: false, isPublished: true, stock: { $lte: LOW_STOCK_THRESHOLD } },
    'name sku stock'
  );
  for (const p of products) {
    await createAlertIfNew({
      type:       'low_stock',
      severity:   p.stock === 0 ? 'critical' : 'warning',
      title:      `Low stock: ${p.name}`,
      message:    `"${p.name}" (SKU: ${p.sku}) has ${p.stock} unit(s) remaining.`,
      entityType: 'product',
      entityId:   p._id,
      dedupKey:   `low_stock:${p._id}`,
    });
  }
  logger.info(`[processAlerts] Low-stock: ${products.length} product(s) at/below threshold`);
};

const checkRefundSpike = async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const count = await Order.countDocuments({ status: 'refunded', updatedAt: { $gte: since } });
  if (count >= REFUND_SPIKE_THRESHOLD) {
    const today = new Date().toISOString().slice(0, 10);
    await createAlertIfNew({
      type:     'refund_spike',
      severity: 'critical',
      title:    'Refund spike detected',
      message:  `${count} order(s) refunded in last 24h (threshold: ${REFUND_SPIKE_THRESHOLD}).`,
      dedupKey: `refund_spike:${today}`,
    });
    logger.info(`[processAlerts] Refund spike: ${count} refunds in 24h`);
  }
};

const checkRankingDrops = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const products = await Product.find(
    { isDeleted: false, isPublished: true, salesCount: 0, createdAt: { $lt: thirtyDaysAgo } },
    'name sku salesCount'
  );
  for (const p of products) {
    await createAlertIfNew({
      type:       'ranking_drop',
      severity:   'info',
      title:      `No sales: ${p.name}`,
      message:    `"${p.name}" (SKU: ${p.sku}) published 30+ days with 0 sales.`,
      entityType: 'product',
      entityId:   p._id,
      dedupKey:   `ranking_drop:${p._id}`,
    });
  }
  logger.info(`[processAlerts] Ranking-drop: ${products.length} product(s) with no sales`);
};

module.exports = async function processAlerts() {
  await Promise.all([checkLowStock(), checkRefundSpike(), checkRankingDrops()]);
};
