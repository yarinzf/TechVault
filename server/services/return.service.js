'use strict';

const { StatusCodes }     = require('http-status-codes');
const ReturnRequest       = require('../models/ReturnRequest');
const Order               = require('../models/Order');
const InventoryMovement   = require('../models/InventoryMovement');
const Product             = require('../models/Product');
const { AppError }        = require('../middleware/errorHandler');
const { paginate, paginateMeta } = require('../utils/paginate');
const refundService       = require('./refund.service');
const notificationService = require('./notification.service');
const audit               = require('./audit.service');
const emitter             = require('../events/emitter');
const EVENTS              = require('../events/events');

// ── Customer flow ─────────────────────────────────────────────────────────────

const requestReturn = async (userId, orderId, { items, customerNote = '' }, req) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');
  if (order.user.toString() !== userId.toString()) {
    throw new AppError('Access denied', StatusCodes.FORBIDDEN, 'FORBIDDEN');
  }

  if (order.status !== 'delivered') {
    throw new AppError(
      'Return requests can only be made for delivered orders',
      StatusCodes.BAD_REQUEST,
      'ORDER_NOT_DELIVERED'
    );
  }

  if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) {
    throw new AppError(
      'Order is not eligible for a return',
      StatusCodes.BAD_REQUEST,
      'ORDER_NOT_REFUNDABLE'
    );
  }

  // Prevent duplicate pending/approved return on the same order
  const existing = await ReturnRequest.findOne({
    order: orderId,
    status: { $in: ['pending', 'approved', 'received'] },
  });
  if (existing) {
    throw new AppError(
      'A return request is already in progress for this order',
      StatusCodes.CONFLICT,
      'RETURN_ALREADY_PENDING'
    );
  }

  // Validate each item: must exist in order, qty ≤ purchased qty
  const itemsMap = {};
  for (const oi of order.items) {
    itemsMap[oi.product.toString()] = oi;
  }

  const returnItems = [];
  for (const ri of items) {
    const orderItem = itemsMap[ri.product.toString()];
    if (!orderItem) {
      throw new AppError(
        `Product ${ri.product} was not part of this order`,
        StatusCodes.BAD_REQUEST,
        'INVALID_RETURN_ITEM'
      );
    }
    if (ri.quantity > orderItem.quantity) {
      throw new AppError(
        `Cannot return more than purchased quantity for "${orderItem.name}"`,
        StatusCodes.BAD_REQUEST,
        'RETURN_QUANTITY_EXCEEDS_PURCHASE'
      );
    }
    returnItems.push({
      product:   orderItem.product,
      name:      orderItem.name,
      sku:       orderItem.sku,
      image:     orderItem.image ?? '',
      unitPrice: orderItem.unitPrice,
      quantity:  ri.quantity,
      reason:    ri.reason,
      condition: 'unknown',
    });
  }

  const returnRequest = await ReturnRequest.create({
    user:         userId,
    order:        order._id,
    orderNumber:  order.orderNumber,
    items:        returnItems,
    customerNote: customerNote.trim() || null,
  });

  // Admin notification is propagated via the emitter — no per-user notify here
  // (admins discover new returns via the socket bridge or by polling /admin/returns)

  audit.log({
    action:   'return.requested',
    entity:   'ReturnRequest',
    entityId: returnRequest._id,
    actor:    { _id: userId, role: 'user' },
    after:    { orderNumber: order.orderNumber, items: returnItems.length, customerNote: customerNote || null },
    req,
  });

  emitter.emit(EVENTS.RETURN_REQUESTED, {
    returnRequestId: returnRequest._id,
    orderId:         order._id,
    orderNumber:     order.orderNumber,
    userId,
    itemCount:       returnItems.length,
  });

  return returnRequest;
};

// ── Admin / warehouse flows ───────────────────────────────────────────────────

const approveReturn = async (returnId, { adminNote = '' }, actor, req) => {
  const rr = await ReturnRequest.findById(returnId);
  if (!rr) throw new AppError('Return request not found', StatusCodes.NOT_FOUND, 'RETURN_NOT_FOUND');
  if (rr.status !== 'pending') {
    throw new AppError(
      `Cannot approve a return with status "${rr.status}"`,
      StatusCodes.BAD_REQUEST,
      'INVALID_RETURN_STATUS'
    );
  }

  rr.status    = 'approved';
  rr.adminNote = adminNote.trim() || null;
  await rr.save();

  notificationService.notify(
    rr.user,
    'return',
    'בקשת ההחזרה אושרה',
    `בקשת ההחזרה שלך עבור הזמנה ${rr.orderNumber} אושרה. אנא שלח את הפריטים בחזרה.`,
    { returnRequestId: rr._id }
  ).catch(() => {});

  audit.log({
    action:   'return.approved',
    entity:   'ReturnRequest',
    entityId: rr._id,
    actor,
    before:   { status: 'pending' },
    after:    { status: 'approved', adminNote: rr.adminNote },
    req,
  });

  emitter.emit(EVENTS.RETURN_STATUS_CHANGED, { returnRequestId: rr._id, status: 'approved', changedBy: actor._id });

  return rr;
};

const rejectReturn = async (returnId, { adminNote = '' }, actor, req) => {
  const rr = await ReturnRequest.findById(returnId);
  if (!rr) throw new AppError('Return request not found', StatusCodes.NOT_FOUND, 'RETURN_NOT_FOUND');
  if (rr.status !== 'pending') {
    throw new AppError(
      `Cannot reject a return with status "${rr.status}"`,
      StatusCodes.BAD_REQUEST,
      'INVALID_RETURN_STATUS'
    );
  }

  rr.status     = 'rejected';
  rr.adminNote  = adminNote.trim() || null;
  rr.resolvedAt = new Date();
  rr.resolvedBy = actor._id;
  await rr.save();

  notificationService.notify(
    rr.user,
    'return',
    'בקשת ההחזרה נדחתה',
    `בקשת ההחזרה שלך עבור הזמנה ${rr.orderNumber} נדחתה${rr.adminNote ? `: ${rr.adminNote}` : '.'}`,
    { returnRequestId: rr._id }
  ).catch(() => {});

  audit.log({
    action:   'return.rejected',
    entity:   'ReturnRequest',
    entityId: rr._id,
    actor,
    before:   { status: 'pending' },
    after:    { status: 'rejected', adminNote: rr.adminNote },
    req,
  });

  emitter.emit(EVENTS.RETURN_STATUS_CHANGED, { returnRequestId: rr._id, status: 'rejected', changedBy: actor._id });

  return rr;
};

const markReceived = async (returnId, { itemConditions = [] }, actor, req) => {
  const rr = await ReturnRequest.findById(returnId);
  if (!rr) throw new AppError('Return request not found', StatusCodes.NOT_FOUND, 'RETURN_NOT_FOUND');
  if (rr.status !== 'approved') {
    throw new AppError(
      `Cannot mark as received a return with status "${rr.status}"`,
      StatusCodes.BAD_REQUEST,
      'INVALID_RETURN_STATUS'
    );
  }

  // Apply conditions supplied by warehouse staff
  const conditionsMap = {};
  for (const ic of itemConditions) {
    conditionsMap[ic.index] = ic.condition;
  }

  for (let i = 0; i < rr.items.length; i++) {
    rr.items[i].condition = conditionsMap[i] ?? 'sellable';
  }

  rr.status = 'received';
  await rr.save();

  // Inventory: route each item based on condition (fire-and-forget)
  for (const item of rr.items) {
    if (item.condition === 'sellable') {
      // Restore stock
      Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } }, { new: true })
        .then(async (updated) => {
          if (!updated) return;
          await InventoryMovement.create({
            product:       item.product,
            type:          'returned',
            quantity:      item.quantity,
            reason:        'return',
            referenceType: 'return',
            referenceId:   rr._id,
            actor:         actor._id,
            notes:         `החזרה מהזמנה ${rr.orderNumber} — מצב: תקין`,
            afterStock:    updated.stock,
            beforeStock:   updated.stock - item.quantity,
          });
        })
        .catch(() => {});
    } else {
      // Damaged — record movement, no stock increase
      InventoryMovement.create({
        product:       item.product,
        type:          'damaged',
        quantity:      item.quantity,
        reason:        'return',
        referenceType: 'return',
        referenceId:   rr._id,
        actor:         actor._id,
        notes:         `החזרה מהזמנה ${rr.orderNumber} — מצב: פגום`,
      }).catch(() => {});
    }
  }

  audit.log({
    action:   'return.received',
    entity:   'ReturnRequest',
    entityId: rr._id,
    actor,
    before:   { status: 'approved' },
    after:    { status: 'received', items: rr.items.map(i => ({ name: i.name, condition: i.condition })) },
    req,
  });

  emitter.emit(EVENTS.RETURN_STATUS_CHANGED, { returnRequestId: rr._id, status: 'received', changedBy: actor._id });

  return rr;
};

const processRefund = async (returnId, { refundAmount, refundType = 'original_payment', adminNote = '' }, actor, req) => {
  const rr = await ReturnRequest.findById(returnId).populate('order');
  if (!rr) throw new AppError('Return request not found', StatusCodes.NOT_FOUND, 'RETURN_NOT_FOUND');
  if (rr.status !== 'received') {
    throw new AppError(
      `Cannot process refund for a return with status "${rr.status}"`,
      StatusCodes.BAD_REQUEST,
      'INVALID_RETURN_STATUS'
    );
  }

  const amount = parseFloat(refundAmount);
  if (!amount || amount <= 0) {
    throw new AppError('Refund amount must be positive', StatusCodes.BAD_REQUEST, 'INVALID_REFUND_AMOUNT');
  }

  // Delegate to refund.service (handles validation, payment provider, paymentHistory)
  const updatedOrder = await refundService.refundOrder(
    rr.order._id,
    { amount, reason: `החזרת מוצר — בקשה #${rr._id}`, note: adminNote },
    actor
  );

  rr.status       = 'refunded';
  rr.refundAmount = amount;
  rr.refundType   = refundType;
  rr.adminNote    = adminNote.trim() || null;
  rr.resolvedAt   = new Date();
  rr.resolvedBy   = actor._id;
  await rr.save();

  notificationService.notify(
    rr.user,
    'return',
    'ההחזר כספי בוצע',
    `ההחזר הכספי בסך $${amount.toFixed(2)} עבור הזמנה ${rr.orderNumber} בוצע בהצלחה.`,
    { returnRequestId: rr._id, refundAmount: amount }
  ).catch(() => {});

  audit.log({
    action:   'return.refunded',
    entity:   'ReturnRequest',
    entityId: rr._id,
    actor,
    before:   { status: 'received', refundAmount: null },
    after:    { status: 'refunded', refundAmount: amount, refundType },
    req,
  });

  emitter.emit(EVENTS.RETURN_STATUS_CHANGED, { returnRequestId: rr._id, status: 'refunded', changedBy: actor._id, refundAmount: amount });

  return { returnRequest: rr, order: updatedOrder };
};

// ── Listing ───────────────────────────────────────────────────────────────────

const listReturns = async (query) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.orderId) filter.order = query.orderId;

  if (query.search) {
    filter.orderNumber = new RegExp(query.search, 'i');
  }

  const [returns, total] = await Promise.all([
    ReturnRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .populate('order', 'orderNumber total paymentStatus')
      .populate('resolvedBy', 'name email')
      .lean(),
    ReturnRequest.countDocuments(filter),
  ]);

  return { returns, meta: paginateMeta(total, page, limit) };
};

const getReturn = async (returnId) => {
  const rr = await ReturnRequest.findById(returnId)
    .populate('user', 'name email')
    .populate('order', 'orderNumber total paymentStatus refundedAmount')
    .populate('resolvedBy', 'name email')
    .populate('items.product', 'name sku images')
    .lean();
  if (!rr) throw new AppError('Return request not found', StatusCodes.NOT_FOUND, 'RETURN_NOT_FOUND');
  return rr;
};

const getMyReturns = async (userId, orderId) => {
  const filter = { user: userId };
  if (orderId) filter.order = orderId;
  return ReturnRequest.find(filter).sort({ createdAt: -1 }).lean();
};

module.exports = {
  requestReturn,
  approveReturn,
  rejectReturn,
  markReceived,
  processRefund,
  listReturns,
  getReturn,
  getMyReturns,
};
