'use strict';

const settingsService = require('../services/settings.service');
const { sendSuccess }  = require('../utils/response');

const getAdminSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings('admin');
    sendSuccess(res, { settings }, 'Admin settings retrieved');
  } catch (err) { next(err); }
};

const updateAdminSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.updateSettings('admin', req.body, req.user, req);
    sendSuccess(res, { settings }, 'Admin settings updated');
  } catch (err) { next(err); }
};

const getWarehouseSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings('warehouse');
    sendSuccess(res, { settings }, 'Warehouse settings retrieved');
  } catch (err) { next(err); }
};

const updateWarehouseSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.updateSettings('warehouse', req.body, req.user, req);
    sendSuccess(res, { settings }, 'Warehouse settings updated');
  } catch (err) { next(err); }
};

module.exports = { getAdminSettings, updateAdminSettings, getWarehouseSettings, updateWarehouseSettings };
