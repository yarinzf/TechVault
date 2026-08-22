'use strict';

const adminService = require('../services/admin.service');
const authService  = require('../services/auth.service');
const audit        = require('../services/audit.service');
const Category     = require('../models/Category');
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

const listClubMembers = async (req, res, next) => {
  try {
    const { members, meta } = await adminService.listClubMembers(req.query);
    sendSuccess(res, { members }, 'Club members retrieved', StatusCodes.OK, meta);
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

const listCategories = async (req, res, next) => {
  try {
    const categories = await adminService.listCategoriesWithCounts();
    sendSuccess(res, { categories }, 'Categories retrieved');
  } catch (err) { next(err); }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await adminService.createCategory(req.body);
    audit.log({
      action:   'category.created',
      entity:   'Category',
      entityId: category._id,
      actor:    req.user,
      after:    { name: category.name, slug: category.slug, parentCategory: category.parentCategory, isActive: category.isActive },
      req,
    });
    sendSuccess(res, { category }, 'Category created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const updateCategory = async (req, res, next) => {
  try {
    const before = await Category.findById(req.params.id).select('name isActive description').lean();
    const category = await adminService.updateCategory(req.params.id, req.body);
    audit.log({
      action:   'category.updated',
      entity:   'Category',
      entityId: category._id,
      actor:    req.user,
      before:   before ? { name: before.name, isActive: before.isActive, description: before.description } : null,
      after:    { name: category.name, isActive: category.isActive, description: category.description },
      req,
    });
    sendSuccess(res, { category }, 'Category updated');
  } catch (err) { next(err); }
};

const reorderCategories = async (req, res, next) => {
  try {
    const categories = await adminService.reorderCategories(req.body.items);
    audit.log({
      action:   'category.reordered',
      entity:   'Category',
      entityId: null,
      actor:    req.user,
      after:    { items: req.body.items },
      req,
    });
    sendSuccess(res, { categories }, 'Category order updated');
  } catch (err) { next(err); }
};

const deleteCategory = async (req, res, next) => {
  try {
    const before = await Category.findById(req.params.id).select('name slug parentCategory').lean();
    await adminService.deleteCategory(req.params.id);
    audit.log({
      action:   'category.deleted',
      entity:   'Category',
      entityId: req.params.id,
      actor:    req.user,
      before:   before ? { name: before.name, slug: before.slug, parentCategory: before.parentCategory } : null,
      after:    null,
      req,
    });
    res.status(StatusCodes.NO_CONTENT).send();
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
  listUsers, updateUser, listClubMembers,
  listAlerts, resolveAlert,
  listAuditLogs,
  listCategories, createCategory, updateCategory, reorderCategories, deleteCategory,
  getUserSessions, forceLogoutUser,
};
