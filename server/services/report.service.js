'use strict';

const mongoose      = require('mongoose');
const Order         = require('../models/Order');
const Product       = require('../models/Product');
const ReturnRequest = require('../models/ReturnRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const Coupon        = require('../models/Coupon');
const Campaign      = require('../models/Campaign');
const {
  getRangeStats, getDailySeries, bucketSeriesByPeriod, resolveIsraelRangeParams, ALL_TIME_FLOOR,
} = require('./analyticsDaily.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

function resolveRange(query) {
  const now = new Date();
  const from = query.dateFrom ? new Date(query.dateFrom) : null;
  let to = query.dateTo ? new Date(query.dateTo) : now;
  // Include full end day
  if (query.dateTo) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function dateFilter({ from, to }) {
  const f = {};
  if (from) f.$gte = from;
  if (to)   f.$lte = to;
  return Object.keys(f).length ? f : null;
}

const REVENUE_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refunded'] },
};

// ── 1. Sales report ───────────────────────────────────────────────────────────
// Summary: gross, net, refunded, AOV, orderCount
// Rows: grouped by day/week/month
//
// Historical-baseline + live reconciled — uses the SAME getDailySeries/
// getRangeStats primitive as the Dashboard and Analytics tab
// (analyticsDaily.service.js), so exporting this report for a date range
// that includes the seeded historical window can never show a different
// (or empty) total than what Dashboard/Analytics already showed for that
// same range. See tests/reportsReconciliation.test.js.
async function getSalesReport(query) {
  const { from, to } = resolveIsraelRangeParams({ dateFrom: query.dateFrom, dateTo: query.dateTo });
  const period = query.period || 'day';

  const [rangeStats, dailySeries] = await Promise.all([
    getRangeStats(from, to),
    getDailySeries(from, to),
  ]);
  const rows = bucketSeriesByPeriod(dailySeries, ['day', 'week', 'month'].includes(period) ? period : 'day')
    .map((r) => ({ period: r.period, revenue: r.revenue, orders: r.orders, avgOrder: r.avgOrder }));

  return {
    summary: {
      gross:       rangeStats.revenue,
      net:         round2(rangeStats.revenue - rangeStats.refundAmount),
      refunded:    rangeStats.refundAmount,
      aov:         rangeStats.aov,
      ordersCount: rangeStats.paidOrders,
    },
    rows,
  };
}

// ── 2. Orders report ──────────────────────────────────────────────────────────
// Rows: flat order list (≤500) with customer snapshot
//
// `summary` (total/revenue/refunded) is historical-baseline + live
// reconciled via getRangeStats — matches the Dashboard/Sales Report exactly
// for the same range. `rows` remain REAL Order documents only — by design,
// no fake historical Order rows were ever created (see requirement #6), so
// a date range reaching into the seeded historical window will show fewer
// (or zero) itemized rows than `summary.total` implies. `historicalNote` is
// set whenever the range overlaps the pre-cutoff window, so the frontend/
// CSV can surface this honestly instead of silently looking incomplete.
async function getOrdersReport(query) {
  // Israel-aligned boundaries, shared with `summary` below — using a
  // separate naive UTC range for the row query here would let a real order
  // near a day boundary appear in `summary.total` (reconciled) but silently
  // vanish from `rows` (or vice versa), which is exactly the kind of
  // Dashboard/Reports mismatch this fix exists to prevent.
  const { HISTORICAL_DATA_CUTOFF } = require('../config/analytics');
  const { from: reconciledFrom, to: reconciledTo } = resolveIsraelRangeParams({ dateFrom: query.dateFrom, dateTo: query.dateTo });
  const overlapsHistorical = reconciledFrom < HISTORICAL_DATA_CUTOFF;

  const match = {};
  if (query.dateFrom || query.dateTo) match.createdAt = { $gte: reconciledFrom, $lt: reconciledTo };
  if (query.status)        match.status        = query.status;
  if (query.paymentStatus) match.paymentStatus = query.paymentStatus;

  const LIMIT = 500;

  const [orders, rangeStats] = await Promise.all([
    Order.find(match)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .populate('user', 'name email')
      .lean(),
    getRangeStats(reconciledFrom, reconciledTo),
  ]);

  const rows = orders.map(o => ({
    orderNumber:    o.orderNumber,
    createdAt:      o.createdAt,
    customerName:   o.user?.name  ?? '—',
    customerEmail:  o.user?.email ?? '—',
    status:         o.status,
    paymentStatus:  o.paymentStatus,
    itemsCount:     o.items?.length ?? 0,
    subtotal:       round2(o.subtotal),
    couponCode:     o.couponCode    ?? '',
    couponDiscount: round2(o.couponDiscount ?? 0),
    total:          round2(o.total),
    refundedAmount: round2(o.refundedAmount ?? 0),
    city:           o.shippingAddress?.city    ?? '',
    country:        o.shippingAddress?.country ?? '',
  }));

  return {
    summary: {
      total:    rangeStats.orders,
      revenue:  rangeStats.revenue,
      refunded: rangeStats.refundAmount,
      limited:  orders.length === LIMIT,
    },
    // True when the requested range reaches before HISTORICAL_DATA_CUTOFF —
    // summary.total legitimately exceeds rows.length in that case, since no
    // fake historical Order documents exist to itemize (see comment above).
    historicalNote: overlapsHistorical
      ? 'הטווח המבוקש כולל תקופה היסטורית — הסיכום כולל את נתוני הבסיס ההיסטוריים, אך רשומות מפורטות מוצגות רק עבור הזמנות אמיתיות'
      : null,
    rows,
  };
}

// ── 3. Inventory report ───────────────────────────────────────────────────────
// Rows: product snapshot with stock-value and status
async function getInventoryReport(query) {
  const match = { isDeleted: false };

  if (query.lowStock === 'true') {
    match.$expr = { $lte: ['$stock', '$minStock'] };
  }
  if (query.category) {
    try {
      match.category = new mongoose.Types.ObjectId(query.category);
    } catch { /* ignore bad ObjectId */ }
  }

  const products = await Product.find(match)
    .populate('category', 'name')
    .sort({ stock: 1, name: 1 })
    .limit(500)
    .lean();

  const totalValue    = products.reduce((s, p) => s + (p.stock || 0) * (p.price || 0), 0);
  const outOfStock    = products.filter(p => p.stock === 0).length;
  const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= (p.minStock || 5)).length;

  const rows = products.map(p => ({
    name:        p.name,
    sku:         p.sku,
    category:    p.category?.name ?? '—',
    brand:       p.brand ?? '',
    price:       round2(p.price),
    stock:       p.stock,
    minStock:    p.minStock,
    // Lifetime total (historical baseline + live), matching Product Sales
    // History and every other "units sold" figure elsewhere in the app —
    // never the live-only salesCount field alone.
    salesCount:  (p.historicalSalesCount ?? 0) + (p.salesCount ?? 0),
    stockValue:  round2(p.stock * p.price),
    stockStatus: p.stock === 0 ? 'out_of_stock' : p.stock <= p.minStock ? 'low_stock' : 'ok',
    isPublished: p.isPublished,
    createdAt:   p.createdAt,
  }));

  return {
    summary: {
      total:         products.length,
      totalValue:    round2(totalValue),
      outOfStock,
      lowStockCount,
    },
    rows,
  };
}

// ── 4. Returns report ─────────────────────────────────────────────────────────
// Rows: return requests (≤500) with order + customer info
//
// Deliberately live-only, unlike Sales/Orders above: ReturnRequest has no
// seeded historical-baseline equivalent (no fake historical return requests
// were ever created, matching the "no fake bulk transactional entities"
// principle), so there is nothing to reconcile against for a pre-cutoff
// range — this report has always meant "real return requests on file",
// which is unaffected by this redesign.
async function getReturnsReport(query) {
  const range = resolveRange(query);
  const cf    = dateFilter(range);

  const match = {};
  if (cf)           match.createdAt = cf;
  if (query.status) match.status    = query.status;

  const LIMIT = 500;

  const [returns, countAgg] = await Promise.all([
    ReturnRequest.find(match)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .populate('user',  'name email')
      .populate('order', 'orderNumber total')
      .lean(),
    ReturnRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id:           null,
          total:         { $sum: 1 },
          totalRefunded: { $sum: { $ifNull: ['$refundAmount', 0] } },
        },
      },
    ]),
  ]);

  const rows = returns.map(r => ({
    returnId:      r._id.toString(),
    orderNumber:   r.order?.orderNumber ?? r.orderNumber ?? '—',
    createdAt:     r.createdAt,
    customerName:  r.user?.name  ?? '—',
    customerEmail: r.user?.email ?? '—',
    status:        r.status,
    itemsCount:    r.items?.length ?? 0,
    refundAmount:  round2(r.refundAmount ?? 0),
    refundType:    r.refundType ?? '',
    resolvedAt:    r.resolvedAt ?? '',
    adminNote:     r.adminNote  ?? '',
  }));

  return {
    summary: {
      total:         countAgg[0]?.total         ?? 0,
      totalRefunded: round2(countAgg[0]?.totalRefunded ?? 0),
      limited:       returns.length === LIMIT,
    },
    rows,
  };
}

// ── 5. Coupons report ─────────────────────────────────────────────────────────
// Rows: all coupons enriched with actual order usage from Order collection
//
// Deliberately live-only — same reasoning as Returns above: no fake
// historical coupon usage was seeded (it would require fake historical
// Orders to attach to, which this redesign explicitly avoids).
async function getCouponsReport(query) {
  const match = {};
  if (query.isActive !== undefined) match.isActive = query.isActive === 'true';

  const coupons = await Coupon.find(match).sort({ usedCount: -1 }).lean();

  const couponCodes = coupons.map(c => c.code);
  const usageAgg = couponCodes.length
    ? await Order.aggregate([
        { $match: { couponCode: { $in: couponCodes }, paymentStatus: 'paid' } },
        {
          $group: {
            _id:           '$couponCode',
            totalDiscount: { $sum: '$couponDiscount' },
            orderCount:    { $sum: 1 },
          },
        },
      ])
    : [];

  const usageMap = {};
  for (const u of usageAgg) usageMap[u._id] = u;

  const rows = coupons.map(c => ({
    code:           c.code,
    type:           c.type,
    value:          c.value,
    minOrderAmount: c.minOrderAmount,
    usageLimit:     c.usageLimit ?? 'unlimited',
    usedCount:      c.usedCount,
    isActive:       c.isActive,
    validFrom:      c.validFrom  ?? '',
    validUntil:     c.validUntil ?? '',
    totalDiscount:  round2(usageMap[c.code]?.totalDiscount ?? 0),
    orderCount:     usageMap[c.code]?.orderCount ?? 0,
    createdAt:      c.createdAt,
  }));

  return {
    summary: {
      total:         coupons.length,
      active:        coupons.filter(c => c.isActive).length,
      totalDiscount: round2(rows.reduce((s, r) => s + r.totalDiscount, 0)),
      totalUsage:    coupons.reduce((s, c) => s + c.usedCount, 0),
    },
    rows,
  };
}

// ── 6. Purchase orders report ─────────────────────────────────────────────────
// Rows: POs (≤500) with supplier, cost, and receipt progress
//
// Deliberately live-only — PurchaseOrder is a real supplier/warehouse
// workflow with no seeded historical equivalent (see AnalyticsDaily's
// coarse restockEvents count for the only historical inventory-event
// signal this redesign provides).
async function getPurchaseOrdersReport(query) {
  const range = resolveRange(query);
  const cf    = dateFilter(range);

  const match = {};
  if (cf)             match.createdAt = cf;
  if (query.status)   match.status    = query.status;
  if (query.supplier) {
    try {
      match.supplier = new mongoose.Types.ObjectId(query.supplier);
    } catch { /* ignore */ }
  }

  const LIMIT = 500;

  const pos = await PurchaseOrder.find(match)
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .populate('supplier',  'name')
    .populate('createdBy', 'name')
    .lean();

  const totalCostAll = pos.reduce((s, po) =>
    s + po.items.reduce((a, it) => a + it.unitCost * it.quantityOrdered, 0), 0);

  const rows = pos.map(po => {
    const totalCost     = po.items.reduce((a, it) => a + it.unitCost * it.quantityOrdered, 0);
    const totalOrdered  = po.items.reduce((a, it) => a + it.quantityOrdered, 0);
    const totalReceived = po.items.reduce((a, it) => a + it.quantityReceived, 0);
    return {
      poNumber:      po.poNumber,
      createdAt:     po.createdAt,
      supplier:      po.supplier?.name ?? '—',
      status:        po.status,
      itemsCount:    po.items.length,
      totalOrdered,
      totalReceived,
      totalCost:     round2(totalCost),
      expectedDate:  po.expectedDate ?? '',
      createdBy:     po.createdBy?.name ?? '—',
      notes:         po.notes ?? '',
    };
  });

  return {
    summary: {
      total:     pos.length,
      totalCost: round2(totalCostAll),
      limited:   pos.length === LIMIT,
    },
    rows,
  };
}

module.exports = {
  getSalesReport,
  getOrdersReport,
  getInventoryReport,
  getReturnsReport,
  getCouponsReport,
  getPurchaseOrdersReport,
};
