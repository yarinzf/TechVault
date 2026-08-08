'use strict';

const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true, maxlength: 100 },
    discountPercent: { type: Number, required: true, min: 1, max: 90 },
    startDate:       { type: Date, required: true },
    endDate:         { type: Date, required: true },
    isActive:        { type: Boolean, default: true },
    products:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    // Controls where this campaign is surfaced on the storefront. A Weekly
    // Deal is still an ordinary percentage campaign — this field only
    // changes its display slot, never the discount mechanism itself.
    placement: {
      type: String,
      enum: ['none', 'homepage_weekly_deal'],
      default: 'none',
    },

    // Clearance is a distinct business concept from low stock — a product can
    // have low stock without being on clearance, and a clearance campaign can
    // target a product that currently has plenty of stock. This flag is the
    // ONLY source of truth for "is this a clearance deal"; the storefront
    // must never infer it from Product.stock.
    isClearance: { type: Boolean, default: false },

    // Per-product starting-stock snapshot for the clearance stock-progress
    // bar (percent = current Product.stock / startingStock). A single
    // scalar field would be wrong here because `products` is an array —
    // different products in the same clearance campaign started with
    // different stock levels. Written ONLY by campaign.service.js
    // (buildClearanceSnapshots), never accepted directly from a client
    // request (stripped by the Joi validator) — see campaign.validator.js.
    // An entry, once created for a given product, is never overwritten as
    // stock sells; it's the frozen "starting point" for that product's
    // clearance run.
    clearanceStockSnapshots: [
      {
        _id: false,
        product:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        startingStock: { type: Number, min: 0, required: true },
      },
    ],

    // ── VIP campaign benefits (Part G/H of the Club/VIP spec) ──────────────
    // A membership-only campaign uses the SAME discountPercent/products/date
    // mechanism as any other campaign — membershipOnly just restricts who it
    // applies to server-side (see campaign.service.js), rather than
    // inventing a second parallel pricing mechanism. Non-VIP customers must
    // never see or be able to check out at this price.
    membershipOnly: { type: Boolean, default: false },

    // "2x points" style promo — multiplies POINTS_DEFAULT_RATE (or a
    // product's own override) for this campaign's products while it's
    // active. 1 = no change (default); e.g. 2 → 10% effective when the
    // base rate is 5%.
    pointsMultiplier: { type: Number, default: 1, min: 1, max: 10 },

    // VIP members can see/use this campaign starting this many hours BEFORE
    // startDate; non-VIP customers only get it at the real startDate. 0
    // (default) = no early access — most campaigns are NOT early-access by
    // default, this must be set explicitly per campaign.
    vipEarlyAccessHours: { type: Number, default: 0, min: 0, max: 168 },
  },
  { timestamps: true }
);

// Two complementary indexes, not a redundant pair: getActiveDiscountMap()
// (the existing, high-traffic query enriching every product list/detail
// response) filters { isActive, startDate, endDate } WITHOUT placement, so
// it needs placement-less index as its prefix. The new Weekly Deal lookup
// and overlap-detection queries always filter placement as an equality
// match first. A single placement-first index can't serve the first query
// efficiently (placement isn't a query predicate there), so both are kept.
campaignSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
campaignSchema.index({ placement: 1, isActive: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
