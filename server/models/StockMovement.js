'use strict';

const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    productId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Product',
      required: true,
      index:    true,
    },
    type:   { type: String, enum: ['increase', 'decrease'], required: true },
    amount: { type: Number, required: true, min: 1 },
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
