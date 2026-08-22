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

    // Set by cleanupCarts.job.js the first time this cart is observed to
    // have crossed CART_ABANDONMENT_HOURS of inactivity while still holding
    // items — lets the job count this cart into AnalyticsDaily.abandonedCarts
    // exactly once, even though the job runs daily and would otherwise see
    // the same still-stale cart again on its next run before the 30-day
    // wipe finally empties it.
    lastAbandonedCheckAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ─── Virtual: subtotal ────────────────────────────────────────────────────────
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, item) => sum + item.priceAtAdd * item.quantity, 0);
});

cartSchema.set('toJSON',   { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
