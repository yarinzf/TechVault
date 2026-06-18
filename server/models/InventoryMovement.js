'use strict';

const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Product',
      required: true,
    },

    // Direction and nature of the movement
    type: {
      type:     String,
      enum:     ['stock_in', 'stock_out', 'adjustment', 'damaged', 'returned'],
      required: true,
    },

    // Always a positive number — direction is encoded in `type`
    quantity: { type: Number, required: true, min: 0 },

    // Human-readable reason (restock / sale / cancellation / correction / damage / return / refund)
    reason: { type: String, trim: true, default: null },

    // What triggered this movement
    referenceType: {
      type:    String,
      enum:    ['order', 'manual', 'restock', 'damage', 'refund', 'return', 'adjustment', 'purchase_order', null],
      default: null,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // Who performed the action
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Free-text notes
    notes: { type: String, trim: true, default: null },

    // Stock snapshots at the time of movement
    beforeStock: { type: Number, default: null },
    afterStock:  { type: Number, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // movements are immutable
  }
);

inventoryMovementSchema.index({ product: 1, createdAt: -1 });
inventoryMovementSchema.index({ actor: 1, createdAt: -1 });
inventoryMovementSchema.index({ type: 1, createdAt: -1 });
inventoryMovementSchema.index({ referenceType: 1, referenceId: 1 });
inventoryMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
