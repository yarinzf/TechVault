'use strict';

const mongoose         = require('mongoose');
const inventoryService = require('../services/inventory.service');
const audit            = require('../services/audit.service');
const { sendSuccess }  = require('../utils/response');

/**
 * POST /api/v1/admin/inventory/scan-alerts
 * Scans all products, creates missing low-stock/out-of-stock alerts,
 * auto-resolves alerts where stock has recovered.
 */
const scanAlerts = async (req, res, next) => {
  try {
    const result = await inventoryService.scanAlerts();

    // Non-fatal audit — a scan is a system-wide action, not tied to a single entity.
    // We generate a fresh ObjectId to uniquely identify this scan event.
    audit.log({
      action:   'inventory.scan',
      entity:   'System',
      entityId: new mongoose.Types.ObjectId(),
      actor:    req.user,
      before:   null,
      after:    {
        outOfStockCount: result.outOfStockCount,
        lowStockCount:   result.lowStockCount,
        alertsCreated:   result.created,
        alertsResolved:  result.resolved,
      },
      req,
    });

    sendSuccess(res, result, 'Inventory scan complete');
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/admin/inventory/health
 * Returns current inventory health snapshot without modifying alerts.
 */
const getHealth = async (req, res, next) => {
  try {
    const report = await inventoryService.getHealthReport();
    sendSuccess(res, report, 'Inventory health report');
  } catch (err) { next(err); }
};

module.exports = { scanAlerts, getHealth };
