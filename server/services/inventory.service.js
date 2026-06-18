'use strict';

const Product = require('../models/Product');
const Alert   = require('../models/Alert');
const { createAlertIfNew } = require('./alert.service');
const emitter = require('../events/emitter');
const EVENTS  = require('../events/events');
const logger  = require('../config/logger');

// Products with salesCount >= this threshold get "high demand" mentioned in the alert message.
const HIGH_DEMAND_THRESHOLD = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const effectiveMinStock = (p) => p.minStock ?? 5;

const isOutOfStock  = (p) => p.stock === 0;
const isLowStock    = (p) => p.stock > 0 && p.stock <= effectiveMinStock(p);
const isHealthy     = (p) => p.stock > effectiveMinStock(p);

const dedupKey = (productId) => `low_stock:${productId}`;

const highDemandNote = (p) =>
  (p.salesCount ?? 0) >= HIGH_DEMAND_THRESHOLD
    ? ` מוצר בביקוש גבוה — ${p.salesCount} מכירות מצטברות.`
    : '';

// ─── Scan ─────────────────────────────────────────────────────────────────────
/**
 * Scans all live products, creates missing low-stock / out-of-stock alerts,
 * and auto-resolves alerts for products whose stock has recovered.
 *
 * Returns: { created, resolved, lowStockCount, outOfStockCount, alerts }
 */
const scanAlerts = async () => {
  const products = await Product.find({ isDeleted: false })
    .select('name sku stock minStock salesCount')
    .lean();

  const outOfStock = products.filter(isOutOfStock);
  const lowStock   = products.filter(isLowStock);
  const recovered  = products.filter(isHealthy);

  const created = [];

  // ── Critical: out of stock ─────────────────────────────────────────────────
  for (const p of outOfStock) {
    const alert = await createAlertIfNew({
      type:       'low_stock',
      severity:   'critical',
      title:      `אזל מהמלאי: ${p.name}`,
      message:    `המוצר "${p.name}" (${p.sku}) אזל מהמלאי לחלוטין.${highDemandNote(p)}`,
      entityType: 'product',
      entityId:   p._id,
      dedupKey:   dedupKey(p._id),
    });
    if (alert) created.push(alert);
  }

  // ── Warning: low stock ─────────────────────────────────────────────────────
  for (const p of lowStock) {
    const min   = effectiveMinStock(p);
    const alert = await createAlertIfNew({
      type:       'low_stock',
      severity:   'warning',
      title:      `מלאי נמוך: ${p.name}`,
      message:    `המוצר "${p.name}" (${p.sku}) — נותרו ${p.stock} יחידות (מינימום: ${min}).${highDemandNote(p)}`,
      entityType: 'product',
      entityId:   p._id,
      dedupKey:   dedupKey(p._id),
    });
    if (alert) created.push(alert);
  }

  // ── Resolve recovered products ─────────────────────────────────────────────
  // Bulk-resolve in one query rather than looping — no resolvedBy since it's automated.
  let resolvedCount = 0;
  if (recovered.length > 0) {
    const recoveredKeys = recovered.map((p) => dedupKey(p._id));
    const result = await Alert.updateMany(
      { dedupKey: { $in: recoveredKeys }, isResolved: false },
      { $set: { isResolved: true, resolvedAt: new Date() } }
    );
    resolvedCount = result.modifiedCount;
  }

  // Return currently open low-stock alerts (all products, not just this batch)
  const openAlerts = await Alert.find({ type: 'low_stock', isResolved: false })
    .sort({ severity: 1, createdAt: -1 }) // critical first (alphabetically 'c' < 'w')
    .limit(50)
    .lean();

  // Emit per-product low-stock events for newly created alerts only
  for (const alert of created) {
    const product = [...outOfStock, ...lowStock].find(
      (p) => p._id.toString() === alert.entityId?.toString()
    );
    if (product) {
      emitter.emit(EVENTS.INVENTORY_LOW_STOCK, {
        productId:   product._id,
        productName: product.name,
        sku:         product.sku,
        stock:       product.stock,
        minStock:    effectiveMinStock(product),
        severity:    alert.severity,
      });
    }
  }

  const result = {
    created:         created.length,
    resolved:        resolvedCount,
    lowStockCount:   lowStock.length,
    outOfStockCount: outOfStock.length,
    alerts:          openAlerts,
  };

  emitter.emit(EVENTS.INVENTORY_SCAN_COMPLETE, {
    created:         result.created,
    resolved:        result.resolved,
    lowStockCount:   result.lowStockCount,
    outOfStockCount: result.outOfStockCount,
  });

  return result;
};

// ─── Health report ────────────────────────────────────────────────────────────
/**
 * Returns a snapshot of current inventory health without modifying alerts.
 */
const getHealthReport = async () => {
  const [products, openAlertCount] = await Promise.all([
    Product.find({ isDeleted: false })
      .select('name sku stock minStock salesCount images')
      .lean(),
    Alert.countDocuments({ type: 'low_stock', isResolved: false }),
  ]);

  const outOfStockProducts = products.filter(isOutOfStock);
  const lowStockProducts   = products.filter(isLowStock);
  const healthyProducts    = products.filter(isHealthy);

  return {
    totalProducts:      products.length,
    outOfStockCount:    outOfStockProducts.length,
    lowStockCount:      lowStockProducts.length,
    healthyStockCount:  healthyProducts.length,
    openAlertCount,
    outOfStockProducts: outOfStockProducts.map(toSummary),
    lowStockProducts:   lowStockProducts.map(toSummary),
  };
};

function toSummary(p) {
  return {
    _id:        p._id,
    name:       p.name,
    sku:        p.sku,
    stock:      p.stock,
    minStock:   effectiveMinStock(p),
    salesCount: p.salesCount ?? 0,
    imageUrl:   p.images?.[0] ?? null,
  };
}

// ─── Per-product alert check ──────────────────────────────────────────────────
/**
 * Create or auto-resolve a low-stock alert for a single product.
 * Called after any stock-changing warehouse operation (restock, adjust, damaged).
 * Non-fatal: failures are swallowed so the calling operation always succeeds.
 */
const checkProductAlerts = async (product) => {
  try {
    const min = effectiveMinStock(product);
    if (isOutOfStock(product)) {
      await createAlertIfNew({
        type:       'low_stock',
        severity:   'critical',
        title:      `אזל מהמלאי: ${product.name}`,
        message:    `המוצר "${product.name}" (${product.sku}) אזל מהמלאי לחלוטין.${highDemandNote(product)}`,
        entityType: 'product',
        entityId:   product._id,
        dedupKey:   dedupKey(product._id),
      });
    } else if (isLowStock(product)) {
      await createAlertIfNew({
        type:       'low_stock',
        severity:   'warning',
        title:      `מלאי נמוך: ${product.name}`,
        message:    `המוצר "${product.name}" (${product.sku}) — נותרו ${product.stock} יחידות (מינימום: ${min}).${highDemandNote(product)}`,
        entityType: 'product',
        entityId:   product._id,
        dedupKey:   dedupKey(product._id),
      });
    } else {
      // Stock is healthy — resolve any open alert for this product
      await Alert.updateOne(
        { dedupKey: dedupKey(product._id), isResolved: false },
        { $set: { isResolved: true, resolvedAt: new Date() } }
      );
    }
  } catch (err) {
    // Alert check failure is non-fatal — warn so ops can see if alert writes are broken
    logger.warn('product_alert_check_failed', { productId: product._id, message: err.message });
  }
};

module.exports = { scanAlerts, getHealthReport, checkProductAlerts };
