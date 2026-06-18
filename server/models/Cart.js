'use strict';

const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity:   { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    // ── Snapshot fields — locked at time of add, independent of live product data ──
    priceAtAdd:         { type: Number, required: true, min: 0 },
    originalPriceAtAdd: { type: Number, default: null }, // set only when a campaign discount applied at add time
    nameAtAdd:          { type: String, required: true },
    imageAtAdd:         { type: String, default: '' },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

// ─── Virtual: subtotal ────────────────────────────────────────────────────────
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, item) => sum + item.priceAtAdd * item.quantity, 0);
});

cartSchema.set('toJSON',   { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

cartSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('Cart', cartSchema);
