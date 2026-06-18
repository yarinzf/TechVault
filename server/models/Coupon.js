'use strict';

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    type:  { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: [0, 'Value cannot be negative'] },

    minOrderAmount:    { type: Number, default: 0, min: 0 },
    maxDiscountAmount: { type: Number, default: null }, // cap for percentage coupons

    usageLimit: { type: Number, default: null }, // null = unlimited
    usedCount:  { type: Number, default: 0, min: 0 },

    perUserLimit: { type: Number, default: 1 },
    userUsage: [
      {
        user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 },
        _id:   false,
      },
    ],

    validFrom:  { type: Date, default: null },
    validUntil: { type: Date, default: null },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
