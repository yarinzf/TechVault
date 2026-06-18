'use strict';

const adminService = require('../services/admin.service');
const authService  = require('../services/auth.service');
const audit        = require('../services/audit.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const getDashboard = async (req, res, next) => {
  try {
    const data = await adminService.getDashboard();
    sendSuccess(res, data, 'Dashboard retrieved');
  } catch (err) { next(err); }
};

const getRevenue = async (req, res, next) => {
  try {
    const data = await adminService.getRevenue(req.query);
    sendSuccess(res, { revenue: data }, 'Revenue analytics retrieved');
  } catch (err) { next(err); }
};

const getTopProducts = async (req, res, next) => {
  try {
    const data = await adminService.getTopProducts(req.query);
    sendSuccess(res, { products: data }, 'Top products retrieved');
  } catch (err) { next(err); }
};

const listUsers = async (req, res, next) => {
  try {
    const { users, meta } = await adminService.listUsers(req.query);
    sendSuccess(res, { users }, 'Users retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await adminService.updateUser(req.params.id, req.body, req.user._id, req.user, req);
    sendSuccess(res, { user }, 'User updated');
  } catch (err) { next(err); }
};

// ─── Alerts ───────────────────────────────────────────────────────────────────
const listAlerts = async (req, res, next) => {
  try {
    const { alerts, meta } = await adminService.listAlerts(req.query);
    sendSuccess(res, { alerts }, 'Alerts retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const resolveAlert = async (req, res, next) => {
  try {
    const alert = await adminService.resolveAlert(req.params.id, req.user._id);
    sendSuccess(res, { alert }, 'Alert resolved');
  } catch (err) { next(err); }
};

// ─── Audit logs ───────────────────────────────────────────────────────────────
const listAuditLogs = async (req, res, next) => {
  try {
    const { logs, meta } = await adminService.listAuditLogs(req.query);
    sendSuccess(res, { logs }, 'Audit logs retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const getActivity = async (req, res, next) => {
  try {
    const activities = await adminService.getRecentActivity(12);
    sendSuccess(res, { activities }, 'Recent activity retrieved');
  } catch (err) { next(err); }
};

// ── Admin: user session management ───────────────────────────────────────────

const getUserSessions = async (req, res, next) => {
  try {
    const sessions = await authService.getUserSessions(req.params.id);
    sendSuccess(res, { sessions });
  } catch (err) { next(err); }
};

const forceLogoutUser = async (req, res, next) => {
  try {
    const count = await authService.forceRevokeUserSessions(req.params.id);

    audit.log({
      action:   'auth.logout_all',
      entity:   'User',
      entityId: req.params.id,
      actor:    req.user,
      metadata: { revokedSessions: count, reason: 'admin_force' },
      req,
    });

    sendSuccess(res, { revokedSessions: count }, 'User logged out from all devices');
  } catch (err) { next(err); }
};

module.exports = {
  getDashboard, getRevenue, getTopProducts, getActivity,
  listUsers, updateUser,
  listAlerts, resolveAlert,
  listAuditLogs,
  getUserSessions, forceLogoutUser,
};
