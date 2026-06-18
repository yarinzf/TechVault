'use strict';

const crypto   = require('crypto');
const mongoose = require('mongoose');
const Order    = require('../models/Order');
const Cart     = require('../models/Cart');
const Product  = require('../models/Product');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');
const { ROLES } = require('../config/roles');
const { notify } = require('./notification.service');
const couponService     = require('./coupon.service');
const audit             = require('./audit.service');
const InventoryMovement = require('../models/InventoryMovement');
const emitter = require('../events/emitter');
const EVENTS  = require('../events/events');

// ─── Status transition rules ──────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
  pending_payment: ['confirmed', 'cancelled'],
  pending:         ['confirmed', 'cancelled'],
  confirmed:       ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  ['refunded'],
  cancelled:  [],
  refunded:   [],
};

// Warehouse managers may only advance orders through fulfillment steps
const WAREHOUSE_TRANSITIONS = {
  confirmed:  ['processing'],
  processing: ['shipped'],
};

// ─── Order number generation with collision retry ─────────────────────────────
const generateOrderNumber = async (sess, retries = 3) => {
  const date      = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix    = crypto.randomBytes(4).toString('hex').toUpperCase();
  const candidate = `ORD-${date}-${suffix}`;

  const collision = await Order.findOne({ orderNumber: candidate }, '_id', { session: sess });
  if (!collision) return candidate;

  if (retries <= 0) throw new AppError('Could not generate unique order number', StatusCodes.INTERNAL_SERVER_ERROR, 'ORDER_NUMBER_COLLISION');
  return generateOrderNumber(sess, retries - 1);
};

// ─── Core order logic — session-agnostic ─────────────────────────────────────
// sess = Mongoose ClientSession for transactional execution, or null for none.
// The MongoDB driver treats { session: null } as "no session" — safe either way.
const _buildAndSaveOrder = async (userId, { shippingAddress, notes, couponCode }, sess) => {
  const cart = await Cart.findOne({ user: userId }, null, { session: sess });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Cart is empty', StatusCodes.BAD_REQUEST, 'CART_EMPTY');
  }

  const orderNumber = await generateOrderNumber(sess);
  const orderItems  = [];
  let   subtotal    = 0;

  for (const item of cart.items) {
    // Atomic check-and-decrement: update only succeeds if stock is sufficient.
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: item.product, isPublished: true, isDeleted: false, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, salesCount: item.quantity } },
      { new: true, session: sess }
    ).select('name sku images price');

    if (!updatedProduct) {
      const probe = await Product.findOne(
        { _id: item.product, isPublished: true, isDeleted: false },
        'name stock',
        { session: sess }
      );
      if (!probe) {
        throw new AppError(`Product "${item.nameAtAdd}" is no longer available`, StatusCodes.BAD_REQUEST, 'PRODUCT_UNAVAILABLE');
      }
      throw new AppError(`Insufficient stock for "${probe.name}" (available: ${probe.stock})`, StatusCodes.BAD_REQUEST, 'INSUFFICIENT_STOCK');
    }

    const lineTotal = item.priceAtAdd * item.quantity;
    subtotal += lineTotal;

    orderItems.push({
      product:    updatedProduct._id,
      name:       updatedProduct.name,
      sku:        updatedProduct.sku,
      image:      updatedProduct.images?.[0] ?? item.imageAtAdd,
      unitPrice:  item.priceAtAdd,
      quantity:   item.quantity,
      totalPrice: lineTotal,
    });
  }

  const taxAmount    = 0; // prices are tax-inclusive
  const shippingCost = 0;

  // Validate and apply coupon if provided — always server-side, never trust client
  let couponDiscount = 0;
  let appliedCoupon  = null;
  if (couponCode) {
    const result = await couponService.validateCoupon(couponCode, userId, subtotal);
    couponDiscount = result.discount;
    appliedCoupon  = result.coupon;
  }

  const total = parseFloat(Math.max(0, subtotal - couponDiscount + shippingCost).toFixed(2));

  const PAYMENT_TIMEOUT_MS = parseInt(process.env.PAYMENT_TIMEOUT_MS || '360000', 10); // 6 min

  const [order] = await Order.create(
    [{
      orderNumber,
      user: userId,
      items: orderItems,
      shippingAddress,
      subtotal:       parseFloat(subtotal.toFixed(2)),
      taxAmount,
      shippingCost,
      couponCode:     appliedCoupon?.code  ?? null,
      couponType:     appliedCoupon?.type  ?? null,
      couponValue:    appliedCoupon?.value ?? null,
      couponDiscount: parseFloat(couponDiscount.toFixed(2)),
      total,
      notes,
      expiresAt:      new Date(Date.now() + PAYMENT_TIMEOUT_MS),
    }],
    { session: sess }
  );

  // Cart is NOT cleared here. It is cleared only after payment is confirmed
  // (in payment.controller.js for credit card) or by the frontend for COD.
  // Clearing eagerly caused a UX bug: a declined card left the backend cart empty,
  // so the customer's cart vanished on the next page refresh.

  return order;
};

// ─── Create order from cart ───────────────────────────────────────────────────
// Tries a Mongo multi-document transaction (requires replica set / Atlas).
// On standalone MongoDB (local dev), catches error code 20
// ("Transaction numbers are only allowed on a replica set member or mongos")
// and retries without a session — all operations still run, just not atomic.
const createOrder = async (userId, dto) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const _afterCreate = (order) => {
    notify(userId, 'order_confirmed', 'Order Confirmed',
      `Your order ${order.orderNumber} has been placed successfully.`,
      { orderId: order._id, orderNumber: order.orderNumber }
    );
    emitter.emit(EVENTS.ORDER_CREATED, {
      orderId:       order._id,
      orderNumber:   order.orderNumber,
      userId,
      total:         order.total,
      status:        order.status,
      paymentStatus: order.paymentStatus,
      itemCount:     order.items.length,
    });
    // Non-fatal: create InventoryMovement records for each item sold
    order.items.forEach(item => {
      InventoryMovement.create({
        product:       item.product,
        type:          'stock_out',
        quantity:      item.quantity,
        reason:        'sale',
        referenceType: 'order',
        referenceId:   order._id,
        actor:         userId,
        notes:         `הזמנה ${order.orderNumber}`,
      }).catch(() => {});
    });
  };

  try {
    const order = await _buildAndSaveOrder(userId, dto, session);
    await session.commitTransaction();
    _afterCreate(order);
    return order;
  } catch (err) {
    // Wrap abortTransaction: on standalone MongoDB it also throws, which would
    // mask the real error and prevent the fallback from running.
    try { await session.abortTransaction(); } catch (_) { /* standalone: ignore */ }

    // Error code 20 = IllegalOperation = standalone MongoDB, no replica set
    const isNoReplicaSet = err.code === 20 ||
      (typeof err.message === 'string' && err.message.includes('Transaction numbers'));

    if (isNoReplicaSet) {
      const order = await _buildAndSaveOrder(userId, dto, null);
      _afterCreate(order);
      return order;
    }

    throw err;
  } finally {
    session.endSession();
  }
};

// ─── List own orders ──────────────────────────────────────────────────────────
const listMyOrders = async (userId, query) => {
  const { page, limit, skip } = paginate(query);
  const filter = { user: userId };

  // Allow callers to narrow by order/payment status (used by CheckoutPage
  // on mount to recover the active pending-payment order server-side).
  if (query.status)        filter.status        = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return { orders, meta: paginateMeta(total, page, limit) };
};

// ─── Get single order — Fix 5: owner or admin only ───────────────────────────
const getOrder = async (orderId, userId, role) => {
  // Admins can fetch any order; users only their own
  const filter = role === 'admin'
    ? { _id: orderId }
    : { _id: orderId, user: userId };

  const order = await Order.findOne(filter);
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');
  return order;
};

// ─── Cancel own order ─────────────────────────────────────────────────────────
// actor: full req.user — needed for timeline changedBy and audit log
const cancelOrder = async (orderId, actor) => {
  const order = await Order.findOne({ _id: orderId, user: actor._id });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');

  if (order.status === 'cancelled') {
    throw new AppError('Order is already cancelled', StatusCodes.BAD_REQUEST, 'ORDER_ALREADY_CANCELLED');
  }

  if (!ALLOWED_TRANSITIONS[order.status].includes('cancelled')) {
    throw new AppError(
      `Cannot cancel an order with status "${order.status}"`,
      StatusCodes.BAD_REQUEST,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const prevStatus = order.status;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Restore stock and undo salesCount atomically per line item
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity, salesCount: -item.quantity } },
        { session }
      );
    }
    order.statusHistory.push({
      fromStatus: prevStatus,
      toStatus:   'cancelled',
      changedBy:  actor._id,
      changedAt:  new Date(),
      note:       'ביטול על ידי לקוח',
    });
    order.status = 'cancelled';
    await order.save({ session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  // Non-fatal: create InventoryMovement records for restored stock
  order.items.forEach(item => {
    InventoryMovement.create({
      product:       item.product,
      type:          'returned',
      quantity:      item.quantity,
      reason:        'cancellation',
      referenceType: 'order',
      referenceId:   order._id,
      actor:         actor._id,
      notes:         `ביטול הזמנה ${order.orderNumber}`,
    }).catch(() => {});
  });

  // Non-fatal audit — runs after the transaction commits
  audit.log({
    action:   'order.cancelled',
    entity:   'Order',
    entityId: order._id,
    actor,
    before:   { status: prevStatus },
    after:    { status: 'cancelled' },
  });

  emitter.emit(EVENTS.ORDER_CANCELLED, {
    orderId:     order._id,
    orderNumber: order.orderNumber,
    userId:      actor._id,
    prevStatus,
  });

  return order;
};

// ─── Admin / Warehouse: update order status ───────────────────────────────────
// actor: full req.user object ({ _id, role }) — required for audit log + timeline
// note:  optional human-readable reason for the change
const updateStatus = async (orderId, newStatus, actor, req = null, note = '') => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');

  // Superadmin can force any transition (e.g. to fix a stuck order).
  // All other roles must follow ALLOWED_TRANSITIONS.
  const isSuperadmin = actor.role === ROLES.SUPERADMIN;
  if (!isSuperadmin && !ALLOWED_TRANSITIONS[order.status].includes(newStatus)) {
    throw new AppError(
      `Cannot transition from "${order.status}" to "${newStatus}"`,
      StatusCodes.BAD_REQUEST,
      'INVALID_STATUS_TRANSITION'
    );
  }

  // Warehouse managers are restricted to fulfillment-only transitions regardless
  if (actor.role === ROLES.WAREHOUSE) {
    const warehouseAllowed = WAREHOUSE_TRANSITIONS[order.status] ?? [];
    if (!warehouseAllowed.includes(newStatus)) {
      throw new AppError(
        'Warehouse managers may only advance orders through fulfillment steps (confirmed→processing→shipped)',
        StatusCodes.FORBIDDEN,
        'FORBIDDEN'
      );
    }
  }

  const prevStatus = order.status;
  order.statusHistory.push({
    fromStatus: prevStatus,
    toStatus:   newStatus,
    changedBy:  actor._id,
    changedAt:  new Date(),
    note:       note.trim(),
  });
  order.status = newStatus;
  await order.save();

  // Non-fatal audit log — does not roll back the status change on failure
  audit.log({
    action:   'order.status_changed',
    entity:   'Order',
    entityId: order._id,
    actor,
    before:   { status: prevStatus },
    after:    { status: newStatus, ...(note ? { note } : {}) },
    req,
  });

  emitter.emit(EVENTS.ORDER_STATUS_CHANGED, {
    orderId:     order._id,
    orderNumber: order.orderNumber,
    fromStatus:  prevStatus,
    toStatus:    newStatus,
    changedBy:   { id: actor._id, role: actor.role },
    note:        note || null,
  });

  return order;
};

// ─── Order status timeline ────────────────────────────────────────────────────
// Staff roles can view any order timeline; customers can only view their own.
const getOrderTimeline = async (orderId, actor) => {
  const isStaff = [ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.WAREHOUSE].includes(actor.role);
  const filter  = isStaff ? { _id: orderId } : { _id: orderId, user: actor._id };

  const order = await Order.findOne(filter)
    .select('orderNumber status statusHistory')
    .populate('statusHistory.changedBy', 'name email role');

  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');

  return {
    orderId:       order._id,
    orderNumber:   order.orderNumber,
    currentStatus: order.status,
    timeline:      order.statusHistory,
  };
};

// ─── Admin: list all orders — full filtering, sorting, pagination ─────────────
const listAllOrders = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = {};
  if (query.status)        filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.userId)        filter.user = query.userId;
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo)   filter.createdAt.$lte = new Date(query.dateTo);
  }

  const sortMap = {
    newest:     { createdAt: -1 },
    oldest:     { createdAt:  1 },
    total_asc:  { total:  1 },
    total_desc: { total: -1 },
  };
  const sort = sortMap[query.sort] || { createdAt: -1 };

  // No populate on list endpoint — user._id is available; detail endpoint populates
  const [orders, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return { orders, meta: paginateMeta(total, page, limit) };
};

module.exports = { createOrder, listMyOrders, getOrder, cancelOrder, updateStatus, listAllOrders, getOrderTimeline };
