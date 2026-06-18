'use strict';

/**
 * Email event bridge.
 * Listens to internal emitter events and fires transactional emails.
 * All handlers are fire-and-forget — failures are logged but never re-thrown.
 *
 * Call init() once during server startup (after DB connection is ready).
 */

const emitter       = require('../../events/emitter');
const EVENTS        = require('../../events/events');
const { sendTemplate } = require('./email.service');
const User          = require('../../models/User');
const Order         = require('../../models/Order');
const ReturnRequest = require('../../models/ReturnRequest');
const Product       = require('../../models/Product');

// ── helpers ───────────────────────────────────────────────────────────────────

const safe = (fn) => async (...args) => {
  try { await fn(...args); } catch (err) {
    console.error('[email.listener]', err.message);
  }
};

const getUser = (id) => User.findById(id).lean();
const getOrder = (id) => Order.findById(id).populate('user', 'name email emailOrderUpdates emailSecurityAlerts').lean();
const getAdmins = () => User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true, emailAdminAlerts: true }, 'email name').lean();

// ── handlers ─────────────────────────────────────────────────────────────────

const onOrderCreated = safe(async ({ orderId, userId }) => {
  const order = await getOrder(orderId);
  if (!order) return;
  const user = order.user || (await getUser(userId));
  if (!user || user.emailOrderUpdates === false) return;
  await sendTemplate('order-confirmation', user.email, { order, user });
});

const onPaymentRefunded = safe(async ({ orderId, amount, isFullRefund, reason }) => {
  const order = await getOrder(orderId);
  if (!order) return;
  const user = order.user || (await getUser(order.user));
  if (!user || user.emailOrderUpdates === false) return;
  await sendTemplate('refund-processed', user.email, {
    order,
    user,
    refund: { amount, isFullRefund, reason },
  });
});

const onReturnRequested = safe(async ({ returnRequestId, orderId }) => {
  const [rr, order] = await Promise.all([
    ReturnRequest.findById(returnRequestId).lean(),
    getOrder(orderId),
  ]);
  if (!order) return;
  const user = order.user || (await getUser(order.user));
  if (!user || user.emailOrderUpdates === false) return;
  await sendTemplate('return-received', user.email, { returnRequest: rr, order, user });
});

const onReturnStatusChanged = safe(async ({ returnRequestId, status, refundAmount }) => {
  if (status === 'received') return; // internal warehouse step, no customer email needed
  const rr = await ReturnRequest.findById(returnRequestId).lean();
  if (!rr) return;
  const order = await getOrder(rr.order);
  if (!order) return;
  const user = order.user || (await getUser(order.user));
  if (!user || user.emailOrderUpdates === false) return;
  await sendTemplate('return-status', user.email, { returnRequest: rr, order, user, status, refundAmount });
});

const onLowStock = safe(async ({ productId, productName, sku, stock, minStock }) => {
  const product = { _id: productId, name: productName, sku, stock, minStock };
  const admins  = await getAdmins();
  await Promise.all(admins.map(a => sendTemplate('low-stock-alert', a.email, { product })));
});

// ── init ──────────────────────────────────────────────────────────────────────

let _initialized = false;

const init = () => {
  if (_initialized) return;
  _initialized = true;

  emitter.on(EVENTS.ORDER_CREATED,        onOrderCreated);
  emitter.on(EVENTS.PAYMENT_REFUNDED,     onPaymentRefunded);
  emitter.on(EVENTS.RETURN_REQUESTED,     onReturnRequested);
  emitter.on(EVENTS.RETURN_STATUS_CHANGED, onReturnStatusChanged);
  emitter.on(EVENTS.INVENTORY_LOW_STOCK,  onLowStock);
};

module.exports = { init };
