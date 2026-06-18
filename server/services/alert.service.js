'use strict';

const Alert = require('../models/Alert');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { paginate, paginateMeta } = require('../utils/paginate');
const emitter = require('../events/emitter');
const EVENTS  = require('../events/events');

// ─── Dedup helper ─────────────────────────────────────────────────────────────
/**
 * Creates an alert only if no unresolved alert with the same dedupKey exists.
 * This prevents the job from flooding the alerts table on every hourly run.
 * Emits ALERT_CREATED so admin dashboards update in real-time.
 */
const createAlertIfNew = async (alertData) => {
  const existing = await Alert.findOne({ dedupKey: alertData.dedupKey, isResolved: false });
  if (existing) return null; // already open — skip

  const alert = await Alert.create(alertData);

  emitter.emit(EVENTS.ALERT_CREATED, {
    alertId:  alert._id,
    type:     alert.type,
    severity: alert.severity,
    title:    alert.title,
    message:  alert.message,
    dedupKey: alert.dedupKey,
    entityType: alert.entityType,
    entityId:   alert.entityId,
  });

  return alert;
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────
const listAlerts = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = {};
  if (query.type)       filter.type = query.type;
  if (query.severity)   filter.severity = query.severity;
  if (query.isResolved !== undefined) {
    filter.isResolved = query.isResolved === 'true';
  }

  const [alerts, total] = await Promise.all([
    Alert.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Alert.countDocuments(filter),
  ]);

  return { alerts, meta: paginateMeta(total, page, limit) };
};

const resolveAlert = async (alertId, adminUserId) => {
  const alert = await Alert.findOneAndUpdate(
    { _id: alertId, isResolved: false },
    { isResolved: true, resolvedBy: adminUserId, resolvedAt: new Date() },
    { new: true }
  );
  if (!alert) throw new AppError('Alert not found or already resolved', StatusCodes.NOT_FOUND, 'ALERT_NOT_FOUND');

  emitter.emit(EVENTS.ALERT_RESOLVED, {
    alertId:  alert._id,
    type:     alert.type,
    severity: alert.severity,
    title:    alert.title,
    resolvedBy: adminUserId,
  });

  return alert;
};

module.exports = { createAlertIfNew, listAlerts, resolveAlert };
