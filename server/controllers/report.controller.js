'use strict';

const reportService  = require('../services/report.service');
const { sendSuccess } = require('../utils/response');

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCSV(val) {
  if (val == null) return '';
  const s = val instanceof Date
    ? val.toISOString()
    : String(val);
  // Wrap in double-quotes if value contains comma, quote, newline, or CR
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(headers, rows) {
  const head = headers.map(h => escapeCSV(h.label)).join(',');
  const body = rows.map(row =>
    headers.map(h => escapeCSV(row[h.key])).join(',')
  );
  return [head, ...body].join('\r\n');
}

function sendCSV(res, filename, headers, rows) {
  const csv = '﻿' + toCSV(headers, rows); // UTF-8 BOM for Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
}

// ── Sales ─────────────────────────────────────────────────────────────────────

const SALES_HEADERS = [
  { key: 'period',   label: 'Period' },
  { key: 'revenue',  label: 'Revenue ($)' },
  { key: 'orders',   label: 'Orders' },
  { key: 'avgOrder', label: 'Avg Order ($)' },
];

exports.getSalesReport = async (req, res, next) => {
  try {
    const data = await reportService.getSalesReport(req.query);
    sendSuccess(res, { summary: data.summary, rows: data.rows }, 'Sales report');
  } catch (e) { next(e); }
};

exports.exportSalesCSV = async (req, res, next) => {
  try {
    const { rows } = await reportService.getSalesReport(req.query);
    sendCSV(res, 'sales-report.csv', SALES_HEADERS, rows);
  } catch (e) { next(e); }
};

// ── Orders ────────────────────────────────────────────────────────────────────

const ORDERS_HEADERS = [
  { key: 'orderNumber',    label: 'Order Number' },
  { key: 'createdAt',      label: 'Date' },
  { key: 'customerName',   label: 'Customer' },
  { key: 'customerEmail',  label: 'Email' },
  { key: 'status',         label: 'Status' },
  { key: 'paymentStatus',  label: 'Payment Status' },
  { key: 'itemsCount',     label: 'Items' },
  { key: 'subtotal',       label: 'Subtotal ($)' },
  { key: 'couponCode',     label: 'Coupon Code' },
  { key: 'couponDiscount', label: 'Coupon Discount ($)' },
  { key: 'total',          label: 'Total ($)' },
  { key: 'refundedAmount', label: 'Refunded ($)' },
  { key: 'city',           label: 'City' },
  { key: 'country',        label: 'Country' },
];

exports.getOrdersReport = async (req, res, next) => {
  try {
    const data = await reportService.getOrdersReport(req.query);
    sendSuccess(res, { summary: data.summary, rows: data.rows }, 'Orders report');
  } catch (e) { next(e); }
};

exports.exportOrdersCSV = async (req, res, next) => {
  try {
    const { rows } = await reportService.getOrdersReport(req.query);
    sendCSV(res, 'orders-report.csv', ORDERS_HEADERS, rows);
  } catch (e) { next(e); }
};

// ── Inventory ─────────────────────────────────────────────────────────────────

const INVENTORY_HEADERS = [
  { key: 'name',        label: 'Product Name' },
  { key: 'sku',         label: 'SKU' },
  { key: 'category',    label: 'Category' },
  { key: 'brand',       label: 'Brand' },
  { key: 'price',       label: 'Price ($)' },
  { key: 'stock',       label: 'Stock' },
  { key: 'minStock',    label: 'Min Stock' },
  { key: 'salesCount',  label: 'Units Sold' },
  { key: 'stockValue',  label: 'Stock Value ($)' },
  { key: 'stockStatus', label: 'Status' },
  { key: 'isPublished', label: 'Published' },
  { key: 'createdAt',   label: 'Created At' },
];

exports.getInventoryReport = async (req, res, next) => {
  try {
    const data = await reportService.getInventoryReport(req.query);
    sendSuccess(res, { summary: data.summary, rows: data.rows }, 'Inventory report');
  } catch (e) { next(e); }
};

exports.exportInventoryCSV = async (req, res, next) => {
  try {
    const { rows } = await reportService.getInventoryReport(req.query);
    sendCSV(res, 'inventory-report.csv', INVENTORY_HEADERS, rows);
  } catch (e) { next(e); }
};

// ── Returns ───────────────────────────────────────────────────────────────────

const RETURNS_HEADERS = [
  { key: 'returnId',      label: 'Return ID' },
  { key: 'orderNumber',   label: 'Order Number' },
  { key: 'createdAt',     label: 'Date' },
  { key: 'customerName',  label: 'Customer' },
  { key: 'customerEmail', label: 'Email' },
  { key: 'status',        label: 'Status' },
  { key: 'itemsCount',    label: 'Items' },
  { key: 'refundAmount',  label: 'Refund Amount ($)' },
  { key: 'refundType',    label: 'Refund Type' },
  { key: 'resolvedAt',    label: 'Resolved At' },
  { key: 'adminNote',     label: 'Admin Note' },
];

exports.getReturnsReport = async (req, res, next) => {
  try {
    const data = await reportService.getReturnsReport(req.query);
    sendSuccess(res, { summary: data.summary, rows: data.rows }, 'Returns report');
  } catch (e) { next(e); }
};

exports.exportReturnsCSV = async (req, res, next) => {
  try {
    const { rows } = await reportService.getReturnsReport(req.query);
    sendCSV(res, 'returns-report.csv', RETURNS_HEADERS, rows);
  } catch (e) { next(e); }
};

// ── Coupons ───────────────────────────────────────────────────────────────────

const COUPONS_HEADERS = [
  { key: 'code',           label: 'Code' },
  { key: 'type',           label: 'Type' },
  { key: 'value',          label: 'Value' },
  { key: 'minOrderAmount', label: 'Min Order ($)' },
  { key: 'usageLimit',     label: 'Usage Limit' },
  { key: 'usedCount',      label: 'Used Count' },
  { key: 'orderCount',     label: 'Orders Used In' },
  { key: 'totalDiscount',  label: 'Total Discount ($)' },
  { key: 'isActive',       label: 'Active' },
  { key: 'validFrom',      label: 'Valid From' },
  { key: 'validUntil',     label: 'Valid Until' },
  { key: 'createdAt',      label: 'Created At' },
];

exports.getCouponsReport = async (req, res, next) => {
  try {
    const data = await reportService.getCouponsReport(req.query);
    sendSuccess(res, { summary: data.summary, rows: data.rows }, 'Coupons report');
  } catch (e) { next(e); }
};

exports.exportCouponsCSV = async (req, res, next) => {
  try {
    const { rows } = await reportService.getCouponsReport(req.query);
    sendCSV(res, 'coupons-report.csv', COUPONS_HEADERS, rows);
  } catch (e) { next(e); }
};

// ── Purchase Orders ───────────────────────────────────────────────────────────

const PO_HEADERS = [
  { key: 'poNumber',      label: 'PO Number' },
  { key: 'createdAt',     label: 'Date' },
  { key: 'supplier',      label: 'Supplier' },
  { key: 'status',        label: 'Status' },
  { key: 'itemsCount',    label: 'Items' },
  { key: 'totalOrdered',  label: 'Qty Ordered' },
  { key: 'totalReceived', label: 'Qty Received' },
  { key: 'totalCost',     label: 'Total Cost ($)' },
  { key: 'expectedDate',  label: 'Expected Date' },
  { key: 'createdBy',     label: 'Created By' },
  { key: 'notes',         label: 'Notes' },
];

exports.getPurchaseOrdersReport = async (req, res, next) => {
  try {
    const data = await reportService.getPurchaseOrdersReport(req.query);
    sendSuccess(res, { summary: data.summary, rows: data.rows }, 'Purchase orders report');
  } catch (e) { next(e); }
};

exports.exportPurchaseOrdersCSV = async (req, res, next) => {
  try {
    const { rows } = await reportService.getPurchaseOrdersReport(req.query);
    sendCSV(res, 'purchase-orders-report.csv', PO_HEADERS, rows);
  } catch (e) { next(e); }
};
