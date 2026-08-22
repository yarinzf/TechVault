'use strict';

const Order   = require('../models/Order');
const User    = require('../models/User');
const { isMembershipActive } = require('../models/User');
const { addCalendarTerm } = require('../config/membership');
const Product  = require('../models/Product');
const Alert    = require('../models/Alert');
const Category = require('../models/Category');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');
const { ROLES } = require('../config/roles');
const env = require('../config/env');
const audit       = require('./audit.service');
const alertSvc    = require('./alert.service');

// NOTE: revenue/order recognition rules (formerly local REVENUE_MATCH/
// SALES_MATCH constants here) now live in a single place —
// analyticsDaily.service.js's REVENUE_MATCH — since every revenue/order
// figure in this file is computed via that service's getRangeStats/
// getDailySeries rather than a local Order.aggregate. ProductSalesMonthly
// (getTopProducts) has its own equivalent qualifying-sale rule baked into
// productSalesAnalytics.service.js#rebuildProductSalesMonth.

const { getIsraelDayBoundaries, getIsraelMonthBoundaries, getIsraelDateParts } = require('../utils/timezone');
const { getRangeStats, getDailySeries, bucketSeriesByPeriod, resolveIsraelRangeParams, ALL_TIME_FLOOR } = require('./analyticsDaily.service');
const ProductSalesMonthly = require('../models/ProductSalesMonthly');

const round2 = (n) => Math.round(n * 100) / 100;
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
// Israel-calendar-day/month boundaries (not server-local/UTC) — a payment
// made at 00:15 Israel time must count toward "today's" revenue even though
// it's still the previous UTC calendar day. See server/utils/timezone.js.
const startOfToday = () => getIsraelDayBoundaries(new Date()).start;
const startOfMonth = () => {
  const { year, month } = getIsraelDateParts(new Date());
  return getIsraelMonthBoundaries(year, month).start;
};
// ─── Dashboard ────────────────────────────────────────────────────────────────
// Revenue/order/rate figures below are historical-baseline + live reconciled
// (via analyticsDaily.service.js#getRangeStats — the SAME function backing
// the Analytics tab and Reports/CSV, so all three can never disagree for the
// same range). `pending`/`inProgress` order counts and `recentOrders`/
// `lowStockProducts` remain real, live-only Order/Product queries — these
// are operational/actionable facts (what needs fulfillment RIGHT NOW), not
// historical business-performance metrics, so blending them with the seeded
// narrative would be meaningless. `users.total`/`users.new30d` are also
// deliberately real-only (see server/docs/analytics-architecture.md §"single
// source of truth" — no fake historical User accounts were ever created).
const getDashboard = async () => {
  const since30d = daysAgo(30);

  const [
    totalOrders,
    pendingOrders,
    processingOrders,
    totalUsers,
    newUsers30d,
    recentOrders,
    lowStockProducts,
    allTimeStats,
    monthStats,
    todayStats,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: 'pending' }),
    Order.countDocuments({ status: { $in: ['confirmed', 'processing', 'shipped'] } }),

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

    getRangeStats(ALL_TIME_FLOOR, new Date()),
    getRangeStats(startOfMonth(), new Date()),
    getRangeStats(startOfToday(), new Date()),
  ]);

  return {
    orders: {
      total:            totalOrders,
      pending:          pendingOrders,
      inProgress:       processingOrders,
      cancellationRate: allTimeStats.cancellationRate,
      refundRate:       allTimeStats.refundedOrders + allTimeStats.paidOrders > 0
        ? round2((allTimeStats.refundedOrders / (allTimeStats.refundedOrders + allTimeStats.paidOrders)) * 100)
        : 0,
    },
    revenue: {
      total:         allTimeStats.revenue,
      net:           round2(allTimeStats.revenue - allTimeStats.refundAmount),
      refunded:      allTimeStats.refundAmount,
      paidOrders:    allTimeStats.paidOrders,
      aov:           allTimeStats.aov,
      // _Paid fields only count paymentStatus:'paid' orders (not cancelled/refunded)
      todayPaid:     todayStats.revenue,
      thisMonthPaid: monthStats.revenue,
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
// Historical-baseline + live reconciled — backs the Dashboard's SalesChart
// (week/month/year period selector). Uses the SAME getDailySeries/
// bucketSeriesByPeriod primitive as report.service.js#getSalesReport and
// analytics.service.js#getRevenueAnalytics, so all three can never disagree
// for the same range.
const getRevenue = async (query) => {
  const { period = 'day', dateFrom, dateTo } = query;
  const { from, to } = resolveIsraelRangeParams({ dateFrom, dateTo });
  const dailySeries = await getDailySeries(from, to);
  return bucketSeriesByPeriod(dailySeries, ['day', 'week', 'month'].includes(period) ? period : 'day');
};

// ─── Top products ─────────────────────────────────────────────────────────────
// Historical-baseline + live reconciled — sourced from ProductSalesMonthly
// (which already carries both 'historical_seed_v1' and 'live' rows; the
// current/live month is kept fresh by the incremental rebuild wired to real
// order events — see events/analyticsHandlers.js), NOT a live-only Order
// scan. A date range narrows which {year, month} rows are summed; with no
// range given, every month is included (true all-time top sellers).
const getTopProducts = async (query) => {
  const limit = Math.min(parseInt(query.limit, 10) || 10, 100);
  const { from, to } = resolveIsraelRangeParams({ dateFrom: query.dateFrom, dateTo: query.dateTo });

  const monthMatch = buildMonthRangeMatch(from, to);

  const rows = await ProductSalesMonthly.aggregate([
    { $match: monthMatch },
    {
      $group: {
        _id:      '$product',
        totalQty: { $sum: '$unitsSold' },
        revenue:  { $sum: '$revenue' },
        orders:   { $sum: '$orderCount' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prod' } },
    { $unwind: '$prod' },
    {
      $project: {
        _id: 0, product: '$_id', name: '$prod.name', sku: '$prod.sku',
        totalQty: 1, orders: 1, revenue: { $round: ['$revenue', 2] },
      },
    },
  ]);

  return rows;
};

// Converts an [from, to) instant range into a Mongo $or match over
// ProductSalesMonthly's {year, month} key — a month is included if ANY part
// of it overlaps the requested range (matching the report/dashboard
// convention of showing whole-month granularity for historical data).
function buildMonthRangeMatch(from, to) {
  const start = getIsraelDateParts(from);
  const endInstant = new Date(to.getTime() - 1); // 'to' is exclusive
  const end = getIsraelDateParts(endInstant);

  const keys = [];
  let y = start.year, m = start.month;
  while (y < end.year || (y === end.year && m <= end.month)) {
    keys.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { $or: keys };
}

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

// ─── Customer Club members (admin, read-only) ──────────────────────────────
// A deliberately narrow, read-only projection — membership status/plan/
// points/join date only. Never role, password, or anything else the generic
// /users endpoint exposes, and no write capability exists here at all, so
// this is safe for both admin and superadmin (unlike /users, which stays
// superadmin-only because it can also change roles via PATCH).
const listClubMembers = async (query) => {
  const { page, limit, skip } = paginate(query);

  // $in (not $ne: 'none') — a User document with no membership subdocument at
  // all (legacy accounts predating the membership schema) has no
  // membership.status field, and $ne would incorrectly match "field absent"
  // as "not equal to none". $in only matches a real, present status value.
  // role: 'user' — a Customer Club roster is a customer-facing concept; a
  // staff account (admin/superadmin/warehouse) that happens to carry
  // membership fields (e.g. from internal testing) is not a "club member"
  // and must never appear in this list.
  const filter = { role: 'user', 'membership.status': { $in: ['active', 'expired'] } };
  if (query.status) filter['membership.status'] = query.status;
  if (query.search) {
    const re = new RegExp(query.search, 'i');
    filter.$or = [{ name: re }, { email: re }];
  }

  const [members, total] = await Promise.all([
    User.find(filter).sort({ 'membership.joinedAt': -1 }).skip(skip).limit(limit)
      .select('name email membership.status membership.plan membership.points membership.lifetimePoints membership.joinedAt membership.expiresAt'),
    User.countDocuments(filter),
  ]);

  return { members, meta: paginateMeta(total, page, limit) };
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
  const target = await User.findById(targetId).select('role isActive membership');
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

  // Membership fields are stored as dot-paths so a partial update (e.g. just
  // `status`) never clobbers the rest of the subdocument via a bare $set.
  const { membership: membershipDto, ...rest } = dto;
  const setFields = { ...rest };

  if (membershipDto) {
    if (membershipDto.status !== undefined) {
      setFields['membership.status'] = membershipDto.status;
      if (membershipDto.status === 'active') {
        if (!target.membership?.joinedAt) {
          setFields['membership.joinedAt'] = new Date();
        }
        // A real membership always needs plan/startedAt/expiresAt — the old
        // "active with no expiresAt = forever" rule is retired (see
        // isMembershipActive on the User model). Grant a real term here
        // unless the target already has one that's still currently valid —
        // this admin tool predates that removal and must not be able to
        // silently create a dead "active" record. Only a real, calendar-
        // dated term is ever assigned (no direct expiresAt input exists on
        // this endpoint — see admin.validator.js).
        if (!isMembershipActive(target.membership)) {
          const now = new Date();
          setFields['membership.plan']      = 'annual';
          setFields['membership.startedAt'] = now;
          setFields['membership.expiresAt'] = addCalendarTerm(now, 'annual');
        }
      } else if (membershipDto.status === 'none') {
        setFields['membership.joinedAt'] = null;
      }
    }
    if (membershipDto.notificationPreference !== undefined) {
      setFields['membership.notificationPreference'] = membershipDto.notificationPreference;
    }
    if (membershipDto.points !== undefined) {
      setFields['membership.points'] = membershipDto.points;
    }
    if (membershipDto.lifetimePoints !== undefined) {
      setFields['membership.lifetimePoints'] = membershipDto.lifetimePoints;
    }
  }

  const updated = await User.findByIdAndUpdate(
    targetId,
    { $set: setFields },
    { new: true, runValidators: true }
  ).select('name email role isActive membership');

  // Non-fatal audit log
  if (actor) {
    const action = membershipDto                ? 'user.membership_updated'
      : dto.role !== undefined                   ? 'user.role_changed'
      : dto.isActive === false                    ? 'user.deactivated'
      : dto.isActive === true                     ? 'user.activated'
      : 'user.role_changed';

    audit.log({
      action,
      entity:   'User',
      entityId: targetId,
      actor,
      before:   { role: target.role, isActive: target.isActive, membership: target.membership },
      after:    { role: updated.role, isActive: updated.isActive, membership: updated.membership },
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

// ─── Categories (admin) ─────────────────────────────────────────────────────
// The public catalog endpoint (product.service.js#listCategories) only
// returns isActive:true categories, since it drives customer-facing nav/
// filters. Admins need the full real picture — every category regardless of
// active state, plus a genuine live product count per category (never a
// fabricated/estimated number) — so this is a separate read, not a
// duplicate: same Category collection, no active-state filter, with counts
// merged in via a real Product aggregation.
const listCategoriesWithCounts = async () => {
  const [categories, counts] = await Promise.all([
    // sortOrder ascending, name as a stable tiebreaker for any pair that
    // still shares the default 0 (i.e. never explicitly reordered) — never
    // MongoDB's incidental insertion order.
    Category.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
    Product.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({ ...c, productCount: countMap.get(String(c._id)) ?? 0 }));
};

// New category (main when parentCategory is omitted/null, otherwise a
// subcategory of that real, existing parent). slug is never accepted from
// the client — Category's own pre('save') hook derives it from `name`
// (slugify), the same mechanism every other category in the DB was created
// with; accepting a client-supplied slug would create a second, divergent
// source of truth for something routing/product-filtering depends on.
// sortOrder is computed server-side, placing the new category last among
// its real siblings (same parentCategory) — never client-settable on create.
const createCategory = async (dto) => {
  // slugify(..., {strict:true}) has no Hebrew transliteration table — a
  // Hebrew-only name silently produces an EMPTY slug (confirmed directly),
  // which would break routing/product-filtering for this category. The
  // frontend already warns the admin and blocks this client-side; this is
  // the server-side backstop for that same rule.
  const slugify = require('slugify');
  if (!slugify(dto.name, { lower: true, strict: true })) {
    throw new AppError('Category name must contain at least one Latin letter or digit so a valid slug can be generated', StatusCodes.BAD_REQUEST, 'CATEGORY_NAME_PRODUCES_EMPTY_SLUG');
  }

  let parentCategory = null;
  if (dto.parentCategory) {
    parentCategory = await Category.findById(dto.parentCategory);
    if (!parentCategory) throw new AppError('Parent category not found', StatusCodes.NOT_FOUND, 'CATEGORY_NOT_FOUND');
    if (parentCategory.parentCategory) {
      // Real taxonomy is exactly two levels (main -> sub) — see
      // categoryTaxonomy.js. Refusing a third level keeps that invariant
      // true for every category this endpoint can ever create.
      throw new AppError('Cannot nest a subcategory under another subcategory', StatusCodes.BAD_REQUEST, 'CATEGORY_NESTING_TOO_DEEP');
    }
  }

  const maxOrder = await Category.findOne({ parentCategory: dto.parentCategory ?? null })
    .sort({ sortOrder: -1 }).select('sortOrder').lean();

  const category = await Category.create({
    name: dto.name,
    description: dto.description,
    parentCategory: dto.parentCategory ?? null,
    isActive: dto.isActive ?? true,
    sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
  });
  return category.toObject();
};

// name/isActive/description only — parentCategory (re-parenting) is
// deliberately out of scope for this pass (it would require re-deriving
// sortOrder among a different sibling group and has no real admin use case
// yet); sortOrder itself is changed only via reorderCategories below, never
// through this generic update, so the two concerns can't race each other.
const updateCategory = async (id, dto) => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', StatusCodes.NOT_FOUND, 'CATEGORY_NOT_FOUND');
  if (dto.name !== undefined) {
    const slugify = require('slugify');
    if (!slugify(dto.name, { lower: true, strict: true })) {
      throw new AppError('Category name must contain at least one Latin letter or digit so a valid slug can be generated', StatusCodes.BAD_REQUEST, 'CATEGORY_NAME_PRODUCES_EMPTY_SLUG');
    }
    category.name = dto.name;
  }
  if (dto.description !== undefined) category.description = dto.description;
  if (dto.isActive !== undefined) category.isActive = dto.isActive;
  await category.save();
  return category.toObject();
};

// Bulk-persists a new sibling order. `items` is [{ id, sortOrder }, ...] for
// ONE sibling group at a time (either every main category, or every
// subcategory of one specific parent) — the caller (frontend) always sends
// a full, freshly-renumbered group, never a partial reorder, so there's no
// ambiguity about where a not-included sibling should land.
const reorderCategories = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('items must be a non-empty array', StatusCodes.BAD_REQUEST, 'INVALID_REORDER_PAYLOAD');
  }
  const ids = items.map((i) => i.id);
  const found = await Category.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) throw new AppError('One or more categories not found', StatusCodes.NOT_FOUND, 'CATEGORY_NOT_FOUND');

  await Promise.all(items.map((i) => Category.updateOne({ _id: i.id }, { $set: { sortOrder: i.sortOrder } })));
  return listCategoriesWithCounts();
};

// Refuses to delete anything that would silently orphan real catalog data:
// a category with live (non-deleted) products attached, or a main category
// that still has subcategories. Both are real, cheap, already-necessary
// reads (not a fabricated safety theater check) — the admin must first move
// or remove what's underneath before the category itself can go.
const deleteCategory = async (id) => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', StatusCodes.NOT_FOUND, 'CATEGORY_NOT_FOUND');

  const [productCount, childCount] = await Promise.all([
    Product.countDocuments({ category: id, isDeleted: { $ne: true } }),
    Category.countDocuments({ parentCategory: id }),
  ]);
  if (productCount > 0) {
    throw new AppError(`Cannot delete — ${productCount} product(s) still assigned to this category`, StatusCodes.CONFLICT, 'CATEGORY_HAS_PRODUCTS');
  }
  if (childCount > 0) {
    throw new AppError(`Cannot delete — ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} still exist under this category`, StatusCodes.CONFLICT, 'CATEGORY_HAS_CHILDREN');
  }

  await Category.deleteOne({ _id: id });
};

// Direct references — the admin controller has a single service import point
const { listAlerts, resolveAlert } = alertSvc;
const { listAuditLogs } = audit;

module.exports = {
  getDashboard, getRevenue, getTopProducts, getRecentActivity, listUsers, updateUser,
  listAlerts, resolveAlert, listAuditLogs, listCategoriesWithCounts, listClubMembers,
  createCategory, updateCategory, reorderCategories, deleteCategory,
};
