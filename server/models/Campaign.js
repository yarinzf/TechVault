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
