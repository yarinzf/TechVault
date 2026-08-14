'use strict';

const mongoose = require('mongoose');

/**
 * Per-scope application settings — one document per scope ('admin' |
 * 'warehouse'), enforced by a unique index on `scope` so a scope can never
 * accidentally split across two documents (no delete+recreate pattern is
 * ever needed; updates are a single atomic findOneAndUpdate upsert).
 *
 * Every field here is a real, typed, validated setting — never an arbitrary
 * Mixed/JSON blob — so the server can never persist a key the client
 * invented. Which fields belong to which scope is enforced twice: once
 * structurally here, and again by the strict per-scope Joi schemas in
 * settings.validator.js that reject any unknown key before it ever reaches
 * this model.
 *
 * Deliberately excludes: secrets, JWT values, DB/AWS credentials, and any
 * infrastructure/security configuration — none of that belongs in an
 * editable business/warehouse settings surface (see the Super Admin
 * "System Settings" placeholder for why that stays a separate, still-
 * unimplemented concern).
 */
const settingsSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['admin', 'warehouse'], required: true, unique: true },

    // ── Admin (business) scope ──────────────────────────────────────────────
    notifications: {
      email: { type: Boolean, default: true },
      push:  { type: Boolean, default: true },
      sms:   { type: Boolean, default: false },
    },
    alertTypes: {
      criticalAlerts: { type: Boolean, default: true },
      stockAlerts:    { type: Boolean, default: true },
      salesAlerts:    { type: Boolean, default: true },
      orderAlerts:    { type: Boolean, default: true },
      securityAlerts: { type: Boolean, default: true },
    },
    thresholds: {
      highSalesIncrease: { type: Number, default: 100, min: 0,   max: 1000 },
      salesDecrease:      { type: Number, default: 30,  min: 0,   max: 100 },
      priceChange:        { type: Number, default: 10,  min: 0,   max: 100 },
      orderDelay:          { type: Number, default: 24,  min: 1,   max: 720 },
    },

    // ── Warehouse (operational) scope ───────────────────────────────────────
    minStockDefault: { type: Number,  default: 10, min: 0, max: 100000 },
    alertEmail:      { type: String,  default: '', trim: true },
    lowStockAlert:   { type: Boolean, default: true },
    supplierNotify:  { type: Boolean, default: true },
    autoOrder:       { type: Boolean, default: false },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
