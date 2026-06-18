'use strict';

const mongoose      = require('mongoose');
const Order         = require('../models/Order');
const Product       = require('../models/Product');
const ReturnRequest = require('../models/ReturnRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const Coupon        = require('../models/Coupon');
const Campaign      = require('../models/Campaign');

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
async function getSalesReport(query) {
  const range = resolveRange(query);
  const cf    = dateFilter(range);
  const period = query.period || 'day';

  const match = { ...REVENUE_MATCH, ...(cf ? { createdAt: cf } : {}) };

  const formatMap = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m' };
  const dateFmt   = formatMap[period] ?? '%Y-%m-%d';

  const [summaryAgg, refundedAgg, seriesAgg] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: { _id: null, gross: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...(cf ? { createdAt: cf } : {}), refundedAmount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$refundedAmount' } } },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id:      { $dateToString: { format: dateFmt, date: '$createdAt' } },
          revenue:  { $sum: '$total' },
          orders:   { $sum: 1 },
          avgOrder: { $avg: '$total' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          period:   '$_id',
          revenue:  { $round: ['$revenue',  2] },
          orders:   1,
          avgOrder: { $round: ['$avgOrder', 2] },
        },
      },
    ]),
  ]);

  const gross    = summaryAgg[0]?.gross ?? 0;
  const count    = summaryAgg[0]?.count ?? 0;
  const refunded = refundedAgg[0]?.total ?? 0;

  return {
    summary: {
      gross:       round2(gross),
      net:         round2(gross - refunded),
      refunded:    round2(refunded),
      aov:         count > 0 ? round2(gross / count) : 0,
      ordersCount: count,
    },
    rows: seriesAgg,
  };
}

// ── 2. Orders report ──────────────────────────────────────────────────────────
// Rows: flat order list (≤500) with customer snapshot
async function getOrdersReport(query) {
  const range = resolveRange(query);
  const cf    = dateFilter(range);

  const match = {};
  if (cf)                  match.createdAt     = cf;
  if (query.status)        match.status        = query.status;
  if (query.paymentStatus) match.paymentStatus = query.paymentStatus;

  const LIMIT = 500;

  const [orders, countAgg] = await Promise.all([
    Order.find(match)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .populate('user', 'name email')
      .lean(),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id:      null,
          total:    { $sum: 1 },
          revenue:  { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
          refunded: { $sum: '$refundedAmount' },
        },
      },
    ]),
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
      total:    countAgg[0]?.total    ?? 0,
      revenue:  round2(countAgg[0]?.revenue  ?? 0),
      refunded: round2(countAgg[0]?.refunded ?? 0),
      limited:  orders.length === LIMIT,
    },
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
    salesCount:  p.salesCount,
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
