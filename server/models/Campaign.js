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
  },
  { timestamps: true }
);

campaignSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
