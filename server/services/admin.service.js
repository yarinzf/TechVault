'use strict';

const Order   = require('../models/Order');
const User    = require('../models/User');
const Product = require('../models/Product');
const Alert   = require('../models/Alert');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');
const { ROLES } = require('../config/roles');
const env = require('../config/env');
const audit       = require('./audit.service');
const alertSvc    = require('./alert.service');

// ─── Business rule: what counts as recognized revenue ────────────────────────
// Only orders where payment was collected AND the order was not cancelled/refunded.
// This filter is the single source of truth — used in both dashboard and analytics.
const REVENUE_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refunded'] },
};

// Only count product sales from orders that resulted in actual fulfillment
const SALES_MATCH = {
  status: { $nin: ['cancelled', 'refunded', 'pending'] },
};

const round2 = (n) => Math.round(n * 100) / 100;
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

// ─── Dashboard ────────────────────────────────────────────────────────────────
const getDashboard = async () => {
  const since30d = daysAgo(30);

  const [
    totalOrders,
    pendingOrders,
    processingOrders,
    revenueAgg,
    totalUsers,
    newUsers30d,
    recentOrders,
    lowStockProducts,
    todayRevenueAgg,
    monthRevenueAgg,
    refundedTotalAgg,
    cancelledCount,
    refundedOrderCount,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: 'pending' }),
    Order.countDocuments({ status: { $in: ['confirmed', 'processing', 'shipped'] } }),

    // Revenue: only paid orders that were not cancelled or refunded
    Order.aggregate([
      { $match: REVENUE_MATCH },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),

    // Customers only — not staff accounts
    User.countDocuments({ role: ROLES.USER }),
    User.countDocuments({ role: ROLES.USER, createdAt: { $gte: since30d } }),

    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber status total paymentStatus createdAt user'),

    // Low stock: products where current stock is at or below their own minStock threshold
    Product.find({ isDeleted: false, $expr: { $lte: ['$stock', '$minStock'] } })
      .sort({ stock: 1 })
      .limit(10)
      .select('name sku stock minStock'),

    // Today's paid revenue
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: startOfToday() } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),

    // This month's paid revenue
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: startOfMonth() } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),

    // Total money refunded (for net revenue + dashboard tile)
    Order.aggregate([
      { $match: { refundedAmount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$refundedAmount' } } },
    ]),

    // Cancellation rate numerator
    Order.countDocuments({ status: 'cancelled' }),

    // Refund rate numerator
    Order.countDocuments({ status: 'refunded' }),
  ]);

  const revenue    = revenueAgg[0] ?? { total: 0, count: 0 };
  const refundedRevenue = round2(refundedTotalAgg[0]?.total ?? 0);

  // Rate calculations — guard against division by zero
  const cancellationRate = totalOrders > 0
    ? round2((cancelledCount / totalOrders) * 100) : 0;
  const refundDenominator = revenue.count + refundedOrderCount;
  const refundRate = refundDenominator > 0
    ? round2((refundedOrderCount / refundDenominator) * 100) : 0;

  return {
    orders: {
      total:            totalOrders,
      pending:          pendingOrders,
      inProgress:       processingOrders,
      cancellationRate,
      refundRate,
    },
    revenue: {
      total:         round2(revenue.total),
      net:           round2(revenue.total - refundedRevenue),
      refunded:      refundedRevenue,
      paidOrders:    revenue.count,
      aov:           revenue.count > 0 ? round2(revenue.total / revenue.count) : 0,
      // _Paid fields only count paymentStatus:'paid' orders (not cancelled/refunded)
      todayPaid:     round2(todayRevenueAgg[0]?.total ?? 0),
      thisMonthPaid: round2(monthRevenueAgg[0]?.total ?? 0),
    },
    users: {
      total:  totalUsers,
      new30d: newUsers30d,
    },
    recentOrders,
    lowStockProducts,
  };
};

// ─── Revenue analytics ────────────────────────────────────────────────────────
const getRevenue = async (query) => {
  const { period = 'day', dateFrom, dateTo } = query;

  // Start from REVENUE_MATCH — do not count cancelled/refunded orders
  const match = { ...REVENUE_MATCH };
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   match.createdAt.$lte = new Date(dateTo);
  }

  const formatMap = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m' };
  const dateFormat = formatMap[period] || '%Y-%m-%d';

  return Order.aggregate([
    { $match: match },
    {
      $group: {
        _id:     { $dateToString: { format: dateFormat, date: '$createdAt' } },
        revenue: { $sum: '$total' },
        orders:  { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id:     0,
        period:  '$_id',
        revenue: { $round: ['$revenue', 2] },
        orders:  1,
      },
    },
  ]);
};

// ─── Top products ─────────────────────────────────────────────────────────────
const getTopProducts = async (query) => {
  const limit = Math.min(parseInt(query.limit, 10) || 10, 100);

  // Exclude cancelled/refunded/pending — only count confirmed sales
  const match = { ...SALES_MATCH };
  if (query.dateFrom || query.dateTo) {
    match.createdAt = {};
    if (query.dateFrom) match.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo)   match.createdAt.$lte = new Date(query.dateTo);
  }

  return Order.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id:      '$items.product',
        name:     { $first: '$items.name' },
        sku:      { $first: '$items.sku' },
        totalQty: { $sum: '$items.quantity' },
        revenue:  { $sum: '$items.totalPrice' },
        orders:   { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    {
      $project: {
        _id:      0,
        product:  '$_id',
        name:     1,
        sku:      1,
        totalQty: 1,
        revenue:  { $round: ['$revenue', 2] },
        orders:   1,
      },
    },
  ]);
};

// ─── User management (superadmin only) ───────────────────────────────────────
const listUsers = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = {};
  if (query.role)              filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    const re = new RegExp(query.search, 'i');
    filter.$or = [{ name: re }, { email: re }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .select('name email role isActive createdAt'),
    User.countDocuments(filter),
  ]);

  return { users, meta: paginateMeta(total, page, limit) };
};

// actor: req.user (has _id and role); req: Express request for ip/userAgent
const updateUser = async (targetId, dto, requestingUserId, actor = null, req = null) => {
  const isSelf = targetId.toString() === requestingUserId.toString();

  // Guard: cannot change own role
  if (isSelf && dto.role !== undefined) {
    throw new AppError('You cannot change your own role', StatusCodes.FORBIDDEN, 'SELF_ROLE_CHANGE');
  }

  // Guard: cannot deactivate own account
  if (isSelf && dto.isActive === false) {
    throw new AppError('You cannot deactivate your own account', StatusCodes.FORBIDDEN, 'SELF_DEACTIVATION');
  }

  // Fetch target before update to evaluate last-superadmin guard
  const target = await User.findById(targetId).select('role isActive');
  if (!target) throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');

  // Guard: prevent removing or disabling the last active superadmin
  const wouldLoseActiveSuperadmin =
    target.role === ROLES.SUPERADMIN &&
    (
      (dto.role !== undefined && dto.role !== ROLES.SUPERADMIN) ||
      dto.isActive === false
    );

  if (wouldLoseActiveSuperadmin) {
    const activeSuperadminCount = await User.countDocuments({
      role: ROLES.SUPERADMIN,
      isActive: true,
    });
    if (activeSuperadminCount <= 1) {
      throw new AppError(
        'Cannot remove or disable the last active superadmin',
        StatusCodes.FORBIDDEN,
        'LAST_SUPERADMIN'
      );
    }
  }

  const updated = await User.findByIdAndUpdate(
    targetId,
    { $set: dto },
    { new: true, runValidators: true }
  ).select('name email role isActive');

  // Non-fatal audit log
  if (actor) {
    const action = dto.role !== undefined ? 'user.role_changed'
      : dto.isActive === false             ? 'user.deactivated'
      : dto.isActive === true              ? 'user.activated'
      : 'user.role_changed';

    audit.log({
      action,
      entity:   'User',
      entityId: targetId,
      actor,
      before:   { role: target.role, isActive: target.isActive },
      after:    { role: updated.role, isActive: updated.isActive },
      req,
    });
  }

  return updated;
};

// ─── Recent activity feed ─────────────────────────────────────────────────────
/**
 * Combines recent orders + open alerts into a unified timeline sorted by date.
 * Used by the dashboard's LiveActivityFeed component.
 */
const getRecentActivity = async (limit = 12) => {
  const half = Math.ceil(limit / 2);

  const [recentOrders, recentAlerts] = await Promise.all([
    Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('orderNumber status total createdAt user')
      .populate('user', 'name')
      .lean(),
    Alert.find({ isResolved: false })
      .sort({ createdAt: -1 })
      .limit(half)
      .select('type severity title message createdAt')
      .lean(),
  ]);

  const STATUS_HE = {
    pending: 'ממתינה', confirmed: 'אושרה', processing: 'בעיבוד',
    shipped: 'נשלחה', delivered: 'נמסרה', cancelled: 'בוטלה', refunded: 'הוחזר',
  };

  const orderItems = recentOrders.map((o) => ({
    _id:       o._id.toString(),
    type:      'order',
    title:     `הזמנה ${o.orderNumber}`,
    subtitle:  o.user?.name ?? 'לא ידוע',
    status:    o.status,
    statusHe:  STATUS_HE[o.status] ?? o.status,
    amount:    o.total,
    createdAt: o.createdAt,
  }));

  const alertItems = recentAlerts.map((a) => ({
    _id:       a._id.toString(),
    type:      'alert',
    severity:  a.severity,
    title:     a.title,
    subtitle:  a.message,
    amount:    null,
    createdAt: a.createdAt,
  }));

  return [...orderItems, ...alertItems]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
};

// Direct references — the admin controller has a single service import point
const { listAlerts, resolveAlert } = alertSvc;
const { listAuditLogs } = audit;

module.exports = { getDashboard, getRevenue, getTopProducts, getRecentActivity, listUsers, updateUser, listAlerts, resolveAlert, listAuditLogs };
