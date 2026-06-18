'use strict';

const { StatusCodes }    = require('http-status-codes');
const PurchaseOrder      = require('../models/PurchaseOrder');
const Supplier           = require('../models/Supplier');
const Product            = require('../models/Product');
const InventoryMovement  = require('../models/InventoryMovement');
const { AppError }       = require('../middleware/errorHandler');
const { paginate, paginateMeta } = require('../utils/paginate');
const { checkProductAlerts } = require('./inventory.service');
const audit              = require('./audit.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const EDITABLE_STATUSES  = new Set(['draft', 'ordered']);
const RECEIVABLE_STATUSES = new Set(['ordered', 'partially_received']);

const findPO = async (id) => {
  const po = await PurchaseOrder.findById(id)
    .populate('supplier', 'name email')
    .populate('items.product', 'name sku images stock')
    .populate('createdBy',  'name email')
    .populate('receivedBy', 'name email');
  if (!po) throw new AppError('Purchase order not found', StatusCodes.NOT_FOUND, 'PO_NOT_FOUND');
  return po;
};

// ── List ──────────────────────────────────────────────────────────────────────

const listPurchaseOrders = async (query) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};

  if (query.status)   filter.status   = query.status;
  if (query.supplier) filter.supplier = query.supplier;
  if (query.search) {
    filter.poNumber = new RegExp(query.search.trim(), 'i');
  }

  const [orders, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('supplier', 'name')
      .populate('createdBy', 'name email')
      .lean({ virtuals: true }),
    PurchaseOrder.countDocuments(filter),
  ]);

  return { orders, meta: paginateMeta(total, page, limit) };
};

const getPurchaseOrder = async (id) => findPO(id);

// ── Create ────────────────────────────────────────────────────────────────────

const createPurchaseOrder = async ({ supplier, items, expectedDate, notes }, actor, req) => {
  // Validate supplier exists and is active
  const supplierDoc = await Supplier.findById(supplier);
  if (!supplierDoc || !supplierDoc.isActive) {
    throw new AppError('Supplier not found or inactive', StatusCodes.BAD_REQUEST, 'SUPPLIER_INVALID');
  }

  // Snapshot product name/sku at creation time
  const resolvedItems = await Promise.all(
    items.map(async (item) => {
      const product = await Product.findOne({ _id: item.product, isDeleted: false }).select('name sku');
      if (!product) {
        throw new AppError(`Product ${item.product} not found`, StatusCodes.BAD_REQUEST, 'PRODUCT_NOT_FOUND');
      }
      return {
        product:         product._id,
        name:            product.name,
        sku:             product.sku,
        quantityOrdered: item.quantityOrdered,
        unitCost:        item.unitCost,
      };
    })
  );

  const po = await PurchaseOrder.create({
    supplier,
    items:        resolvedItems,
    expectedDate: expectedDate || null,
    notes:        notes || '',
    createdBy:    actor._id,
    status:       'draft',
  });

  audit.log({
    action:   'purchase_order.created',
    entity:   'PurchaseOrder',
    entityId: po._id,
    actor,
    after:    { poNumber: po.poNumber, supplier: supplierDoc.name, itemCount: resolvedItems.length },
    req,
  });

  return po;
};

// ── Update ────────────────────────────────────────────────────────────────────

const updatePurchaseOrder = async (id, dto, actor, req) => {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw new AppError('Purchase order not found', StatusCodes.NOT_FOUND, 'PO_NOT_FOUND');

  if (!EDITABLE_STATUSES.has(po.status)) {
    throw new AppError(
      `Cannot edit a purchase order with status "${po.status}"`,
      StatusCodes.BAD_REQUEST,
      'PO_NOT_EDITABLE'
    );
  }

  const before = { status: po.status, notes: po.notes, expectedDate: po.expectedDate };

  // Allow updating: status (draft→ordered), notes, expectedDate
  if (dto.status !== undefined) {
    if (dto.status === 'ordered' && po.status !== 'draft') {
      throw new AppError('Only draft orders can be marked as ordered', StatusCodes.BAD_REQUEST, 'INVALID_STATUS_TRANSITION');
    }
    if (dto.status === 'cancelled') {
      if (!['draft', 'ordered'].includes(po.status)) {
        throw new AppError(`Cannot cancel a PO with status "${po.status}"`, StatusCodes.BAD_REQUEST, 'CANNOT_CANCEL');
      }
      po.status = 'cancelled';

      audit.log({
        action:   'purchase_order.cancelled',
        entity:   'PurchaseOrder',
        entityId: id,
        actor,
        before:   { status: before.status },
        after:    { status: 'cancelled' },
        req,
      });

      await po.save();
      return po;
    }
    po.status = dto.status;
  }

  if (dto.notes        !== undefined) po.notes        = dto.notes;
  if (dto.expectedDate !== undefined) po.expectedDate = dto.expectedDate || null;

  await po.save();

  audit.log({
    action:   'purchase_order.updated',
    entity:   'PurchaseOrder',
    entityId: id,
    actor,
    before,
    after:    { status: po.status, notes: po.notes, expectedDate: po.expectedDate },
    req,
  });

  return po;
};

// ── Receive items ─────────────────────────────────────────────────────────────

/**
 * items: [{ productId: string, quantity: number }]
 * Increments stock for each received item, creates InventoryMovement,
 * updates item.quantityReceived, and advances PO status.
 */
const receivePurchaseOrder = async (id, { items }, actor, req) => {
  const po = await findPO(id);

  if (!RECEIVABLE_STATUSES.has(po.status)) {
    throw new AppError(
      `Cannot receive items for a PO with status "${po.status}"`,
      StatusCodes.BAD_REQUEST,
      'PO_NOT_RECEIVABLE'
    );
  }

  if (!items || items.length === 0) {
    throw new AppError('At least one item must be specified', StatusCodes.BAD_REQUEST, 'NO_ITEMS');
  }

  // Build lookup map: productId → PO item
  const itemMap = {};
  for (const poItem of po.items) {
    itemMap[poItem.product._id?.toString() ?? poItem.product.toString()] = poItem;
  }

  const updatedProductIds = [];

  for (const ri of items) {
    const productId = ri.productId?.toString();
    const poItem    = itemMap[productId];

    if (!poItem) {
      throw new AppError(
        `Product ${productId} is not in this purchase order`,
        StatusCodes.BAD_REQUEST,
        'ITEM_NOT_IN_PO'
      );
    }

    if (ri.quantity <= 0 || !Number.isFinite(ri.quantity)) {
      throw new AppError('Quantity must be a positive number', StatusCodes.BAD_REQUEST, 'INVALID_QUANTITY');
    }

    const remaining = poItem.quantityOrdered - poItem.quantityReceived;
    if (ri.quantity > remaining) {
      throw new AppError(
        `Cannot receive ${ri.quantity} of "${poItem.name}": only ${remaining} remaining (ordered: ${poItem.quantityOrdered}, already received: ${poItem.quantityReceived})`,
        StatusCodes.UNPROCESSABLE_ENTITY,
        'OVER_RECEIVE'
      );
    }

    // Increment stock
    const beforeProduct = await Product.findById(productId).select('stock');
    const beforeStock   = beforeProduct?.stock ?? 0;

    await Product.findByIdAndUpdate(productId, { $inc: { stock: ri.quantity } }, { runValidators: true });
    const afterProduct = await Product.findById(productId).select('stock name sku minStock');
    const afterStock   = afterProduct?.stock ?? beforeStock + ri.quantity;

    // InventoryMovement
    await InventoryMovement.create({
      product:       productId,
      type:          'stock_in',
      quantity:      ri.quantity,
      reason:        'restock',
      referenceType: 'purchase_order',
      referenceId:   po._id,
      actor:         actor._id,
      notes:         `הזמנת רכש ${po.poNumber} — ספק: ${po.supplier?.name ?? ''}`,
      beforeStock,
      afterStock,
    });

    // Audit log per product received
    audit.log({
      action:   'inventory.restock',
      entity:   'Product',
      entityId: productId,
      actor,
      before:   { stock: beforeStock },
      after:    { stock: afterStock },
      metadata: { quantity: ri.quantity, source: 'purchase_order', poNumber: po.poNumber },
      req,
    });

    // Update PO item's received count
    poItem.quantityReceived += ri.quantity;

    // Non-fatal alert check
    if (afterProduct) checkProductAlerts(afterProduct).catch(() => {});

    updatedProductIds.push(productId);
  }

  // Determine new PO status
  const allReceived = po.items.every(item => item.quantityReceived >= item.quantityOrdered);
  const anyReceived = po.items.some(item  => item.quantityReceived > 0);

  if (allReceived) {
    po.status     = 'received';
    po.receivedBy = actor._id;
  } else if (anyReceived) {
    po.status = 'partially_received';
  }

  await po.save();

  audit.log({
    action:   'purchase_order.received',
    entity:   'PurchaseOrder',
    entityId: po._id,
    actor,
    after:    {
      status:         po.status,
      itemsReceived:  items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      allReceived,
    },
    req,
  });

  return po;
};

// ── Restock suggestions ───────────────────────────────────────────────────────

/**
 * Returns products at or below minStock with suggested reorder quantities.
 * Sorted by urgency: out-of-stock first, then by how far below minStock.
 */
const getRestockSuggestions = async () => {
  const products = await Product.find({
    isDeleted: false,
    $or: [
      { stock: 0 },
      { $expr: { $lte: ['$stock', '$minStock'] } },
    ],
  })
    .select('name sku stock minStock salesCount images price category')
    .populate('category', 'name')
    .sort({ stock: 1 })
    .limit(50)
    .lean();

  return products.map(p => {
    const deficit      = Math.max(0, p.minStock - p.stock);
    // Suggested: cover deficit + 50% buffer based on minStock, at least 10 units
    const suggestedQty = Math.max(Math.ceil(deficit + p.minStock * 0.5), 10);
    return {
      _id:           p._id,
      name:          p.name,
      sku:           p.sku,
      stock:         p.stock,
      minStock:      p.minStock,
      salesCount:    p.salesCount ?? 0,
      price:         p.price,
      imageUrl:      p.images?.[0] ?? null,
      category:      p.category?.name ?? null,
      isOutOfStock:  p.stock === 0,
      suggestedQty,
    };
  });
};

module.exports = {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  getRestockSuggestions,
};
