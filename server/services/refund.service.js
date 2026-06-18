'use strict';

const { StatusCodes } = require('http-status-codes');
const Order          = require('../models/Order');
const { AppError }   = require('../middleware/errorHandler');
const paymentService = require('./payment.service');
const audit          = require('./audit.service');
const emitter        = require('../events/emitter');
const EVENTS         = require('../events/events');

// Refund validation rules:
//   - paymentStatus must be 'paid' or 'partially_refunded'
//   - amount must be > 0 and ≤ (order.total − already-refunded)
//   - no double-refund: 'refunded' status is terminal

const refundOrder = async (orderId, { amount, reason = '', note = '' }, actor) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND, 'ORDER_NOT_FOUND');

  if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) {
    throw new AppError(
      `Cannot refund an order with payment status "${order.paymentStatus}"`,
      StatusCodes.BAD_REQUEST,
      'NOT_REFUNDABLE'
    );
  }

  const alreadyRefunded = order.refundedAmount ?? 0;
  const remaining       = parseFloat((order.total - alreadyRefunded).toFixed(2));

  if (amount > remaining) {
    throw new AppError(
      `Refund amount (${amount}) exceeds remaining refundable amount (${remaining})`,
      StatusCodes.BAD_REQUEST,
      'REFUND_EXCEEDS_AMOUNT'
    );
  }

  // Delegate to payment provider (mock or real)
  const result = await paymentService.processRefund(order, amount, reason);
  if (!result.success) {
    throw new AppError(
      result.message || 'Refund failed at payment provider',
      StatusCodes.BAD_GATEWAY,
      'PAYMENT_PROVIDER_ERROR'
    );
  }

  const prevPaymentStatus = order.paymentStatus;
  const newRefundedAmount = parseFloat((alreadyRefunded + amount).toFixed(2));
  const isFullRefund      = newRefundedAmount >= order.total;
  const newPaymentStatus  = isFullRefund ? 'refunded' : 'partially_refunded';

  order.refundedAmount = newRefundedAmount;
  order.paymentStatus  = newPaymentStatus;
  order.paymentHistory.push({
    fromStatus:    prevPaymentStatus,
    toStatus:      newPaymentStatus,
    changedAt:     new Date(),
    changedBy:     actor._id,
    note:          note.trim(),
    transactionId: result.transactionId,
    amount,
  });

  // Full refund on a delivered order advances order status to 'refunded'
  if (isFullRefund && order.status === 'delivered') {
    order.statusHistory.push({
      fromStatus: 'delivered',
      toStatus:   'refunded',
      changedBy:  actor._id,
      changedAt:  new Date(),
      note:       reason ? `החזר תשלום מלא — ${reason}` : 'החזר תשלום מלא',
    });
    order.status = 'refunded';
  }

  await order.save();

  audit.log({
    action:   'payment.refunded',
    entity:   'Order',
    entityId: order._id,
    actor,
    before:   { paymentStatus: prevPaymentStatus, refundedAmount: alreadyRefunded },
    after:    { paymentStatus: newPaymentStatus, refundedAmount: newRefundedAmount, amountRefunded: amount, reason: reason || null },
  });

  emitter.emit(EVENTS.PAYMENT_REFUNDED, {
    orderId:        order._id,
    orderNumber:    order.orderNumber,
    amount,
    isFullRefund,
    paymentStatus:  newPaymentStatus,
    refundedAmount: newRefundedAmount,
    changedBy:      { id: actor._id, role: actor.role },
    reason:         reason || null,
  });

  return order;
};

module.exports = { refundOrder };
