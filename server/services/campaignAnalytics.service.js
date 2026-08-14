'use strict';

const mongoose = require('mongoose');
const Order     = require('../models/Order');
const Campaign  = require('../models/Campaign');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

// ─── What counts as a campaign-attributed sale ─────────────────────────────────
//
// An Order ITEM counts when its persisted `campaignId` (locked at checkout —
// see order.service.js / Order.js) equals the requested campaign, AND its
// Order has paymentStatus 'paid'.
//
// Deliberately narrower than the order-level "totalPaidSpend" formula used
// elsewhere (order.service.js#getMyStats), which nets 'partially_refunded'
// and 'refunded' orders against their order-level `refundedAmount`.
// OrderItem has no per-item refunded-quantity field (the same known,
// pre-existing modeling gap already documented for points reversal — see
// points.service.js#reverseEarnedPoints), so a partially/fully refunded
// order's per-line revenue can't be precisely allocated. Excluding both
// statuses entirely — rather than guessing an allocation — avoids ever
// overstating a campaign's attributed revenue.
//
// A cancelled-but-still-paid order (cancelOrder never touches
// paymentStatus) DOES still count — matching the existing, already-tested
// precedent that "paid without a matching refund is real spend" (see
// tests/orderStats.test.js).
//
// Legacy orders and non-campaign purchases simply have campaignId: null —
// they are excluded by the $match, never guessed retroactively from
// "which campaign contains this product today" (a product can move
// between campaigns, so that would be historically incorrect).
const QUALIFYING_PAYMENT_STATUS = 'paid';

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

const getCampaignAnalytics = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId)
    .select('name title discountPercent startDate endDate isActive products')
    .lean();
  if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND, 'CAMPAIGN_NOT_FOUND');

  const campaignObjectId = new mongoose.Types.ObjectId(campaignId);

  // Discount-generated reconstructs the pre-discount unit price from the
  // persisted snapshot (unitPrice / (1 - discountPercent/100)) — never from
  // the product's CURRENT price, which may have changed since. Guarded
  // against a malformed/edge-case 100% value to avoid a division by zero
  // (Campaign.discountPercent is schema-capped at 90, so this is defensive
  // only, never expected to trigger on real data).
  const discountPerLine = {
    $cond: [
      { $and: [
          { $ne: ['$items.campaignDiscountPercent', null] },
          { $lt: ['$items.campaignDiscountPercent', 100] },
      ] },
      {
        $multiply: [
          '$items.quantity',
          {
            $subtract: [
              { $divide: ['$items.unitPrice', { $subtract: [1, { $divide: ['$items.campaignDiscountPercent', 100] }] }] },
              '$items.unitPrice',
            ],
          },
        ],
      },
      0,
    ],
  };

  const [result] = await Order.aggregate([
    { $match: { paymentStatus: QUALIFYING_PAYMENT_STATUS, 'items.campaignId': campaignObjectId } },
    { $unwind: '$items' },
    { $match: { 'items.campaignId': campaignObjectId } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              orderIds:          { $addToSet: '$_id' },
              unitsSold:         { $sum: '$items.quantity' },
              revenue:           { $sum: '$items.totalPrice' },
              discountGenerated: { $sum: discountPerLine },
            },
          },
        ],
        timeSeries: [
          {
            $group: {
              _id:      { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              orderIds: { $addToSet: '$_id' },
              units:    { $sum: '$items.quantity' },
              revenue:  { $sum: '$items.totalPrice' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        products: [
          {
            $group: {
              _id:       '$items.product',
              name:      { $first: '$items.name' },
              sku:       { $first: '$items.sku' },
              unitsSold: { $sum: '$items.quantity' },
              revenue:   { $sum: '$items.totalPrice' },
            },
          },
          { $sort: { revenue: -1 } },
        ],
      },
    },
  ]);

  const summaryRow = result.summary[0];

  return {
    campaign: {
      _id: campaign._id, name: campaign.name, title: campaign.title ?? null,
      discountPercent: campaign.discountPercent,
      startDate: campaign.startDate, endDate: campaign.endDate, isActive: campaign.isActive,
    },
    summary: {
      attributedOrders:  summaryRow?.orderIds.length ?? 0,
      unitsSold:         summaryRow?.unitsSold ?? 0,
      revenue:            round2(summaryRow?.revenue),
      discountGenerated:  round2(summaryRow?.discountGenerated),
    },
    timeSeries: result.timeSeries.map((row) => ({
      date:    row._id,
      orders:  row.orderIds.length,
      units:   row.units,
      revenue: round2(row.revenue),
    })),
    products: result.products.map((row) => ({
      productId: row._id,
      name:      row.name,
      sku:       row.sku,
      unitsSold: row.unitsSold,
      revenue:   round2(row.revenue),
    })),
  };
};

module.exports = { getCampaignAnalytics };
