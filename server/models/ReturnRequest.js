'use strict';

const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema(
  {
    product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name:      { type: String, required: true },
    sku:       { type: String, default: '' },
    image:     { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity:  { type: Number, required: true, min: 1 },
    reason:    { type: String, required: true, trim: true },
    // Set by warehouse staff when they physically receive the item
    condition: { type: String, enum: ['unknown', 'sellable', 'damaged'], default: 'unknown' },
  },
  { _id: false }
);

const RETURN_STATUSES = ['pending', 'approved', 'rejected', 'received', 'refunded'];

const returnRequestSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    order:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, default: '' },

    items: { type: [returnItemSchema], required: true },

    status: {
      type:    String,
      enum:    { values: RETURN_STATUSES, message: 'Invalid return status' },
      default: 'pending',
    },

    refundAmount: { type: Number, default: null },
    refundType:   { type: String, enum: ['original_payment', 'store_credit', null], default: null },

    adminNote:    { type: String, trim: true, default: null },
    customerNote: { type: String, trim: true, default: null },

    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ order: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1, createdAt: -1 });
returnRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
module.exports.RETURN_STATUSES = RETURN_STATUSES;
