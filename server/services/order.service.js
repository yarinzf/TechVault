'use strict';

const crypto   = require('crypto');
const mongoose = require('mongoose');
const Order    = require('../models/Order');
const Cart     = require('../models/Cart');
const Product  = require('../models/Product');
const User     = require('../models/User');
const { isMembershipActive } = require('../models/User');
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
const { getActiveDiscountMap, getActivePointsMultiplierMap } = require('./campaign.service');
const pointsService = require('./points.service');
const { POINTS_DEFAULT_RATE, POINTS_REDEMPTION_RATE } = require('../config/membership');

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
const _buildAndSaveOrder = async (userId, { shippingAddress, notes, couponCode, pointsToRedeem }, sess) => {
  const cart = await Cart.findOne({ user: userId }, null, { session: sess });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Cart is empty', StatusCodes.BAD_REQUEST, 'CART_EMPTY');
  }

  const user = await User.findById(userId, 'membership', { session: sess });
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');
  const isMember = isMembershipActive(user.membership);

  const orderNumber = await generateOrderNumber(sess);
  const orderId      = new mongoose.Types.ObjectId(); // pre-generated — see points.service.js#reservePoints
  const orderItems  = [];
  let   subtotal    = 0;

  // Never trust the cart's stored priceAtAdd as the charged price — it's
  // refreshed on every GET /cart, but a customer can still reach checkout
  // without hitting that route again after a campaign changed. Recompute
  // every line from the real, just-verified product price plus a single
  // fresh discount-map lookup (one query for the whole order, not per item)
  // so the campaign system remains the sole, live source of truth for price.
  // Both maps are VIP-aware (membershipOnly campaigns / vipEarlyAccessHours /
  // pointsMultiplier) — real, server-verified isMember only, never a client
  // claim (see user.membership above).
  const [discountMap, pointsMultiplierMap] = await Promise.all([
    getActiveDiscountMap({ isMember }),
    getActivePointsMultiplierMap({ isMember }),
  ]);

  for (const item of cart.items) {
    // Atomic check-and-decrement: update only succeeds if stock is sufficient.
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: item.product, isPublished: true, isDeleted: false, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, salesCount: item.quantity } },
      { new: true, session: sess }
    ).select('name sku images price pointsEligible pointsRateOverride');

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

    const discountPct = discountMap.get(updatedProduct._id.toString());
    const unitPrice    = discountPct != null
      ? Math.round(updatedProduct.price * (1 - discountPct / 100) * 100) / 100
      : updatedProduct.price;
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    orderItems.push({
      product:    updatedProduct._id,
      name:       updatedProduct.name,
      sku:        updatedProduct.sku,
      image:      updatedProduct.images?.[0] ?? item.imageAtAdd,
      unitPrice,
      quantity:   item.quantity,
      totalPrice: lineTotal,
      // Points-earning inputs — resolved NOW from live Product/Campaign
      // state, then LOCKED into computeOrderPointsPlan below. Never
      // recomputed later from state that may have since changed.
      pointsEligible: updatedProduct.pointsEligible !== false,
      pointsRate:     updatedProduct.pointsRateOverride ?? POINTS_DEFAULT_RATE,
      pointsMultiplier: pointsMultiplierMap.get(updatedProduct._id.toString()) ?? 1,
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

  // ── Club points redemption — server-authoritative, never trust a client
  // total. Capped at the order's real payable amount so redemption can
  // never buy points-value that doesn't exist on this order, and gated on
  // CURRENT real VIP status (never a client claim). See points.service.js
  // for the atomic reservation (this deducts the user's balance immediately
  // — reverseRedemption gives it back on cancel/expiry/refund).
  const requestedPoints = Math.max(0, Math.floor(pointsToRedeem || 0));
  if (requestedPoints > 0 && !isMember) {
    throw new AppError('Only active Club members can redeem points', StatusCodes.BAD_REQUEST, 'NOT_A_MEMBER');
  }
  const maxRedeemableValue = Math.max(0, subtotal - couponDiscount);
  const actualPointsToRedeem = Math.min(requestedPoints, Math.floor(maxRedeemableValue / POINTS_REDEMPTION_RATE));

  let pointsRedeemedValue = 0;
  if (actualPointsToRedeem > 0) {
    const reserved = await pointsService.reservePoints(userId, actualPointsToRedeem, orderId, sess);
    pointsRedeemedValue = reserved.pointsRedeemedValue;
  }

  const total = parseFloat(Math.max(0, subtotal - couponDiscount - pointsRedeemedValue + shippingCost).toFixed(2));

  // ── Club points earning — locked at checkout, realized only once the
  // order reaches 'delivered' (see updateStatus below / points.service.js).
  const pointsPlan = pointsService.computeOrderPointsPlan({
    items: orderItems.map(it => ({ totalPrice: it.totalPrice, pointsEligible: it.pointsEligible, pointsRate: it.pointsRate, pointsMultiplier: it.pointsMultiplier })),
    isMember,
    pointsRedeemedValue,
  });
  orderItems.forEach((it, i) => { it.pointsEarned = pointsPlan.items[i].pointsEarned; });

  const PAYMENT_TIMEOUT_MS = parseInt(process.env.PAYMENT_TIMEOUT_MS || '360000', 10); // 6 min

  const [order] = await Order.create(
    [{
      _id: orderId,
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
      pointsRedeemed:      actualPointsToRedeem,
      pointsRedeemedValue: parseFloat(pointsRedeemedValue.toFixed(2)),
      pointsEarned:        pointsPlan.pointsEarned,
      isVipOrder:          isMember,
      membershipPlanSnapshot: isMember ? (user.membership.plan ?? null) : null,
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
    // (product is required on InventoryMovement — digital/service items skip this)
    order.items.filter(item => item.itemType === 'product').forEach(item => {
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

  // In-memory mutations happen exactly ONCE, before any DB attempt — so a
  // retry (see below) never double-pushes into statusHistory. Only the
  // actual DB writes are retried.
  order.statusHistory.push({
    fromStatus: prevStatus,
    toStatus:   'cancelled',
    changedBy:  actor._id,
    changedAt:  new Date(),
    note:       'ביטול על ידי לקוח',
  });
  order.status = 'cancelled';
  // Release the membership duplicate-purchase lock (no-op for physical
  // orders — the field is never set for them).
  order.membershipPendingLock = null;

  // Same replica-set-required-for-transactions fallback as createOrder
  // above: standalone MongoDB (local dev / the test harness's
  // mongodb-memory-server, which is NOT a replica set) throws error code 20
  // on startTransaction — retry the same DB operations without a session in
  // that case. All operations still run, just not atomically as a group.
  const runCancel = async (sess) => {
    // Restore stock and undo salesCount atomically per line item.
    // Digital/service items (e.g. membership) never touched stock at
    // purchase time and have no `product` ref — skip them explicitly.
    for (const item of order.items) {
      if (item.itemType !== 'product') continue;
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity, salesCount: -item.quantity } },
        { session: sess }
      );
    }
    // Return any reserved Club points — idempotent no-op if none were
    // redeemed on this order (see points.service.js#reverseRedemption).
    await pointsService.reverseRedemption(order, sess);
    await order.save({ session: sess });
  };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await runCancel(session);
    await session.commitTransaction();
  } catch (err) {
    try { await session.abortTransaction(); } catch (_) { /* standalone: ignore */ }

    const isNoReplicaSet = err.code === 20 ||
      (typeof err.message === 'string' && err.message.includes('Transaction numbers'));
    if (!isNoReplicaSet) throw err;

    await runCancel(null);
  } finally {
    session.endSession();
  }

  // Non-fatal: create InventoryMovement records for restored stock
  // (product is required on InventoryMovement — digital/service items skip this)
  order.items.filter(item => item.itemType === 'product').forEach(item => {
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

  // Club points become earned/available only once the order reaches this
  // safe, sufficiently-final status — never at cart/checkout/payment-intent
  // time (see Part D of the Club/VIP spec). 'delivered' is the chosen point
  // because it is the existing terminal, non-reversible-in-the-ordinary-
  // course status the fulfillment pipeline already uses (shipped→delivered
  // is the last normal transition; only a refund reverses it afterward —
  // see refund.service.js#reverseEarnedPoints). Idempotent — safe even if
  // called more than once for the same order.
  if (newStatus === 'delivered') {
    await pointsService.realizeEarnedPoints(order);
  }

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
    // Warehouse fulfillment queue — VIP orders first, oldest-first within
    // each group (fair FIFO among equally-prioritized orders). Opt-in only
    // (WarehouseOrdersPage requests it explicitly); the Admin order list's
    // default ('newest') is completely untouched by this addition.
    priority:   { isVipOrder: -1, createdAt: 1 },
  };
  const sort = sortMap[query.sort] || { createdAt: -1 };

  // No populate on list endpoint — user._id is available; detail endpoint populates
  const [orders, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return { orders, meta: paginateMeta(total, page, limit) };
};

module.exports = {
  createOrder, listMyOrders, getOrder, cancelOrder, updateStatus, listAllOrders, getOrderTimeline,
  // Exported for reuse by membership.service.js — the membership checkout
  // flow creates an Order directly (bypassing Cart) but needs the same
  // collision-safe order number generator as the product checkout path.
  generateOrderNumber,
};
