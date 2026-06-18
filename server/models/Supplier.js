'use strict';

const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    contactName: { type: String, trim: true, default: '' },
    email:       { type: String, trim: true, lowercase: true, default: '' },
    phone:       { type: String, trim: true, default: '' },
    address:     { type: String, trim: true, default: '' },
    website:     { type: String, trim: true, default: '' },
    isActive:    { type: Boolean, default: true },
    notes:       { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 });
supplierSchema.index({ isActive: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
