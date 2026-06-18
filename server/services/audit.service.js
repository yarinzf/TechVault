'use strict';

const AuditLog = require('../models/AuditLog');
const User     = require('../models/User');
const logger   = require('../config/logger');
const { paginate, paginateMeta } = require('../utils/paginate');

/**
 * Record an audit event. Non-fatal — failure never bubbles up to the caller.
 */
const log = async ({ action, entity, entityId, actor, before = null, after = null, metadata = null, req = null }) => {
  try {
    await AuditLog.create({
      action,
      entity,
      entityId,
      actorId:   actor._id,
      actorRole: actor.role,
      before,
      after,
      metadata,
      ip:        req ? (req.ip || req.headers['x-forwarded-for'] || null) : null,
      userAgent: req ? (req.headers['user-agent'] || null) : null,
    });
  } catch (err) {
    // Audit log failure is non-fatal — warn so it shows in ops logs without breaking the request
    logger.warn('audit_log_failed', { action, entity, message: err.message });
  }
};

// ─── Admin query ──────────────────────────────────────────────────────────────
const listAuditLogs = async (query) => {
  const { page, limit, skip } = paginate(query);

  const filter = {};

  // action exact match
  if (query.action)     filter.action = query.action;

  // entity / entityType both accepted
  const entityType = query.entityType || query.entity;
  if (entityType)       filter.entity = new RegExp(entityType, 'i');

  // actor by ID
  if (query.actorId)    filter.actorId = query.actorId;

  // date range
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo)   filter.createdAt.$lte = new Date(query.dateTo);
  }

  // search: try to find matching actor IDs by name/email, OR entity-name match
  if (query.search) {
    const searchRx = new RegExp(query.search, 'i');
    const matchingActors = await User.find({
      $or: [{ name: searchRx }, { email: searchRx }],
    }).select('_id').lean();

    const actorIds = matchingActors.map(u => u._id);

    // Combine: entity matches OR actor matches
    const orClauses = [{ entity: searchRx }];
    if (actorIds.length) orClauses.push({ actorId: { $in: actorIds } });

    // Merge with existing actorId filter if present
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: orClauses }];
      delete filter.$or;
    } else {
      filter.$or = orClauses;
    }
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'name email'),
    AuditLog.countDocuments(filter),
  ]);

  return { logs, meta: paginateMeta(total, page, limit) };
};

module.exports = { log, listAuditLogs };
