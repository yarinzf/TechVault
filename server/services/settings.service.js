'use strict';

const Settings = require('../models/Settings');
const audit    = require('./audit.service');

// Safe defaults returned when no document exists yet for a scope — the
// document is only ever created on the FIRST write (updateSettings), never
// implicitly by a read, so GET is always safe even before any admin/
// warehouse user has ever saved anything.
const DEFAULTS_BY_SCOPE = {
  admin: {
    notifications: { email: true, push: true, sms: false },
    alertTypes: {
      criticalAlerts: true, stockAlerts: true, salesAlerts: true,
      orderAlerts: true, securityAlerts: true,
    },
    thresholds: { highSalesIncrease: 100, salesDecrease: 30, priceChange: 10, orderDelay: 24 },
  },
  warehouse: {
    minStockDefault: 10,
    alertEmail: '',
    lowStockAlert: true,
    supplierNotify: true,
    autoOrder: false,
  },
};

const FIELDS_BY_SCOPE = {
  admin:     ['notifications', 'alertTypes', 'thresholds'],
  warehouse: ['minStockDefault', 'alertEmail', 'lowStockAlert', 'supplierNotify', 'autoOrder'],
};

// Projects only the fields that belong to `scope` — a warehouse document's
// (unused) admin-shaped fields, or vice versa, are never exposed either way.
function projectScope(doc, scope) {
  const defaults = DEFAULTS_BY_SCOPE[scope];
  const out = {};
  for (const field of FIELDS_BY_SCOPE[scope]) {
    out[field] = doc?.[field] !== undefined && doc?.[field] !== null ? doc[field] : defaults[field];
  }
  return out;
}

const getSettings = async (scope) => {
  const doc = await Settings.findOne({ scope }).lean();
  return projectScope(doc, scope);
};

// dto has already passed the scope-specific Joi allowlist at the route layer
// — every key here is a real, known field for this scope.
const updateSettings = async (scope, dto, actor, req = null) => {
  const before = await Settings.findOne({ scope }).lean();
  const beforeValues = projectScope(before, scope);

  // Dot-path $set so a partial nested update (e.g. only notifications.sms)
  // never clobbers sibling keys in the same sub-object.
  const $set = { updatedBy: actor._id };
  for (const [key, value] of Object.entries(dto)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        $set[`${key}.${subKey}`] = subValue;
      }
    } else {
      $set[key] = value;
    }
  }

  // Single atomic upsert — never a delete+recreate. The `scope` equality in
  // the filter is carried over to the inserted document automatically on
  // upsert, and the unique index on `scope` guarantees at most one document
  // per scope even under concurrent first-write requests.
  const updated = await Settings.findOneAndUpdate(
    { scope },
    { $set },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  const afterValues = projectScope(updated, scope);

  // Non-fatal — a logging failure must never roll back a successful save.
  audit.log({
    action:   'settings.updated',
    entity:   'Settings',
    entityId: updated._id,
    actor,
    before:   beforeValues,
    after:    afterValues,
    metadata: { scope },
    req,
  });

  return afterValues;
};

module.exports = { getSettings, updateSettings };
