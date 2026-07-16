'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');
const crypto = require('crypto');

// Must be imported so Mongoose registers the 'Category' model before any
// populate('category') call runs — otherwise Mongoose throws "Schema hasn't
// been registered for model Category".
require('./Category');

const generateSku = () => crypto.randomBytes(4).toString('hex').toUpperCase();

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    slug: { type: String, unique: true, lowercase: true },

    description: { type: String, required: [true, 'Description is required'], trim: true },
    shortDescription: { type: String, trim: true },

    // Optional Hebrew counterparts — additive, backward-compatible bilingual
    // support. Brand/model names typically stay in the base `name` field
    // (e.g. "ASUS ROG Swift PG27AQDM"); `nameHe` is only set when a genuinely
    // localized product name makes sense. Both frontend and API fall back to
    // the English fields whenever these are absent — see
    // client/src/features/products/utils/localizedProduct.js.
    nameHe:             { type: String, trim: true, maxlength: [200, 'Name cannot exceed 200 characters'] },
    descriptionHe:       { type: String, trim: true },
    shortDescriptionHe:  { type: String, trim: true },

    sku: { type: String, unique: true, uppercase: true },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },

    brand: { type: String, trim: true },

    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    compareAtPrice: { type: Number, min: 0 },
    taxRate: {
      type: Number,
      default: () => parseFloat(process.env.TAX_RATE || '0.17'),
      min: 0,
      max: 1,
    },

    stock:    { type: Number, required: true, min: [0, 'Stock cannot be negative'], default: 0 },
    minStock: { type: Number, default: 5,   min: [0, 'minStock cannot be negative'] },

    images: { type: [String], default: [] },

    specs: { type: Map, of: String, default: {} },
    tags:  { type: [String], default: [] },

    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count:   { type: Number, default: 0, min: 0 },
    },

    // Cumulative count of units sold across confirmed orders.
    // Incremented on order creation, decremented on cancellation.
    salesCount: { type: Number, default: 0, min: 0 },

    isFeatured:  { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },

    // Soft-delete — use isDeleted/deletedAt instead of destroying records
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date,    default: null },
  },
  { timestamps: true }
);

// ─── Pre-save hooks ───────────────────────────────────────────────────────────
productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  if (!this.sku) {
    this.sku = `TV-${generateSku()}`;
  }
  next();
});

// ─── Text index for search ────────────────────────────────────────────────────
productSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ isDeleted: 1 });
productSchema.index({ salesCount: -1 });

module.exports = mongoose.model('Product', productSchema);
