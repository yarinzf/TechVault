'use strict';

const Product           = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const audit             = require('./audit.service');
const { checkProductAlerts } = require('./inventory.service');
const emitter           = require('../events/emitter');
const EVENTS            = require('../events/events');
const { AppError }      = require('../middleware/errorHandler');
const { StatusCodes }   = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findProduct = async (productId) => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');
  return product;
};

const emitStockUpdate = (productId, beforeStock, afterStock, type, actorId) => {
  emitter.emit(EVENTS.INVENTORY_STOCK_UPDATED, { productId, beforeStock, afterStock, type, actorId });
};

// ─── Restock ─────────────────────────────────────────────────────────────────
const restockProduct = async (productId, { quantity, reason, notes }, actor, req) => {
  if (!quantity || quantity <= 0 || !Number.isFinite(quantity)) {
    throw new AppError('Quantity must be a positive number', StatusCodes.BAD_REQUEST, 'INVALID_QUANTITY');
  }

  const product     = await findProduct(productId);
  const beforeStock = product.stock;

  const updated = await Product.findByIdAndUpdate(
    productId,
    { $inc: { stock: quantity } },
    { new: true, runValidators: true }
  );
  const afterStock = updated.stock;

  await InventoryMovement.create({
    product:       productId,
    type:          'stock_in',
    quantity,
    reason:        reason || 'restock',
    referenceType: 'restock',
    actor:         actor._id,
    notes:         notes || null,
    beforeStock,
    afterStock,
  });

  audit.log({
    action:   'inventory.restock',
    entity:   'Product',
    entityId: productId,
    actor,
    before:   { stock: beforeStock },
    after:    { stock: afterStock },
    metadata: { quantity, reason, notes },
    req,
  });

  // Non-fatal: resolve or create stock alert for this product
  checkProductAlerts(updated);

  emitStockUpdate(productId, beforeStock, afterStock, 'restock', actor._id);

  return updated;
};

// ─── Manual adjustment ────────────────────────────────────────────────────────
// quantity: signed integer — positive to add, negative to subtract
const adjustStock = async (productId, { quantity, reason, notes }, actor, req) => {
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new AppError('Quantity must be a non-zero number', StatusCodes.BAD_REQUEST, 'INVALID_QUANTITY');
  }

  const product     = await findProduct(productId);
  const beforeStock = product.stock;
  const newStock    = beforeStock + quantity;

  if (newStock < 0) {
    throw new AppError(
      `Adjustment would result in negative stock (${beforeStock} + ${quantity} = ${newStock})`,
      StatusCodes.UNPROCESSABLE_ENTITY,
      'STOCK_UNDERFLOW'
    );
  }

  const updated = await Product.findByIdAndUpdate(
    productId,
    { $inc: { stock: quantity } },
    { new: true, runValidators: true }
  );
  const afterStock = updated.stock;

  await InventoryMovement.create({
    product:       productId,
    type:          'adjustment',
    quantity:      Math.abs(quantity),
    reason:        reason || (quantity > 0 ? 'manual_add' : 'manual_subtract'),
    referenceType: 'adjustment',
    actor:         actor._id,
    notes:         notes || null,
    beforeStock,
    afterStock,
  });

  audit.log({
    action:   'inventory.adjusted',
    entity:   'Product',
    entityId: productId,
    actor,
    before:   { stock: beforeStock },
    after:    { stock: afterStock },
    metadata: { quantity, reason, notes },
    req,
  });

  checkProductAlerts(updated);
  emitStockUpdate(productId, beforeStock, afterStock, 'adjustment', actor._id);

  return updated;
};

// ─── Mark damaged ─────────────────────────────────────────────────────────────
const markDamaged = async (productId, { quantity, reason, notes }, actor, req) => {
  if (!quantity || quantity <= 0 || !Number.isFinite(quantity)) {
    throw new AppError('Quantity must be a positive number', StatusCodes.BAD_REQUEST, 'INVALID_QUANTITY');
  }

  const product     = await findProduct(productId);
  const beforeStock = product.stock;

  if (beforeStock < quantity) {
    throw new AppError(
      `Cannot mark ${quantity} units as damaged: only ${beforeStock} in stock`,
      StatusCodes.UNPROCESSABLE_ENTITY,
      'STOCK_UNDERFLOW'
    );
  }

  const updated = await Product.findByIdAndUpdate(
    productId,
    { $inc: { stock: -quantity } },
    { new: true, runValidators: true }
  );
  const afterStock = updated.stock;

  await InventoryMovement.create({
    product:       productId,
    type:          'damaged',
    quantity,
    reason:        reason || 'damaged',
    referenceType: 'damage',
    actor:         actor._id,
    notes:         notes || null,
    beforeStock,
    afterStock,
  });

  audit.log({
    action:   'inventory.damaged',
    entity:   'Product',
    entityId: productId,
    actor,
    before:   { stock: beforeStock },
    after:    { stock: afterStock },
    metadata: { quantity, reason, notes },
    req,
  });

  checkProductAlerts(updated);
  emitStockUpdate(productId, beforeStock, afterStock, 'damaged', actor._id);

  return updated;
};

// ─── Inventory list (paginated, all products) ─────────────────────────────────
const listInventory = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = { isDeleted: false };

  if (query.search) {
    const rx = new RegExp(query.search.trim(), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }

  if (query.status === 'critical') {
    filter.stock = 0;
  } else if (query.status === 'low') {
    filter.stock = { $gt: 0 };
    filter.$expr = { $lte: ['$stock', '$minStock'] };
  } else if (query.status === 'healthy') {
    filter.$expr = { $gt: ['$stock', '$minStock'] };
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select('name sku stock minStock salesCount images isPublished price category')
      .populate('category', 'name')
      .sort({ stock: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { products, meta: paginateMeta(total, page, limit) };
};

// ─── Movement history (paginated) ─────────────────────────────────────────────
const listMovements = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = {};
  if (query.product)       filter.product       = query.product;
  if (query.type)          filter.type          = query.type;
  if (query.referenceType) filter.referenceType = query.referenceType;
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo)   filter.createdAt.$lte = new Date(query.dateTo);
  }

  const [movements, total] = await Promise.all([
    InventoryMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'name sku images')
      .populate('actor',   'name email')
      .lean(),
    InventoryMovement.countDocuments(filter),
  ]);

  return { movements, meta: paginateMeta(total, page, limit) };
};

module.exports = { restockProduct, adjustStock, markDamaged, listInventory, listMovements };
