'use strict';

const mongoose = require('mongoose');
const crypto   = require('crypto');

const PO_STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'];

const poItemSchema = new mongoose.Schema(
  {
    product:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name:             { type: String, required: true },
    sku:              { type: String, default: '' },
    quantityOrdered:  { type: Number, required: true, min: 1 },
    quantityReceived: { type: Number, default: 0, min: 0 },
    unitCost:         { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: { type: String, unique: true },

    supplier:  { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },

    items: { type: [poItemSchema], required: true },

    status: {
      type:    String,
      enum:    { values: PO_STATUSES, message: 'Invalid PO status' },
      default: 'draft',
    },

    expectedDate: { type: Date, default: null },
    notes:        { type: String, trim: true, default: '' },

    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Virtual: total cost across all items ──────────────────────────────────────
purchaseOrderSchema.virtual('totalCost').get(function () {
  return this.items.reduce((sum, item) => sum + item.unitCost * item.quantityOrdered, 0);
});

purchaseOrderSchema.set('toJSON',   { virtuals: true });
purchaseOrderSchema.set('toObject', { virtuals: true });

purchaseOrderSchema.pre('save', async function (next) {
  if (!this.poNumber) {
    const year   = new Date().getFullYear();
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    this.poNumber = `PO-${year}-${suffix}`;
  }
  next();
});

purchaseOrderSchema.index({ supplier: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ createdBy: 1 });
purchaseOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
module.exports.PO_STATUSES = PO_STATUSES;
