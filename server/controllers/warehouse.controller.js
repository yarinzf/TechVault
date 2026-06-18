'use strict';

const warehouseService = require('../services/warehouse.service');
const { sendSuccess }  = require('../utils/response');
const { StatusCodes }  = require('http-status-codes');

const listInventory = async (req, res, next) => {
  try {
    const { products, meta } = await warehouseService.listInventory(req.query);
    sendSuccess(res, { products }, 'Inventory retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const listMovements = async (req, res, next) => {
  try {
    const { movements, meta } = await warehouseService.listMovements(req.query);
    sendSuccess(res, { movements }, 'Movements retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const restock = async (req, res, next) => {
  try {
    const product = await warehouseService.restockProduct(req.params.id, req.body, req.user, req);
    sendSuccess(res, { product }, 'Stock replenished');
  } catch (err) { next(err); }
};

const adjust = async (req, res, next) => {
  try {
    const product = await warehouseService.adjustStock(req.params.id, req.body, req.user, req);
    sendSuccess(res, { product }, 'Stock adjusted');
  } catch (err) { next(err); }
};

const damaged = async (req, res, next) => {
  try {
    const product = await warehouseService.markDamaged(req.params.id, req.body, req.user, req);
    sendSuccess(res, { product }, 'Damaged stock recorded');
  } catch (err) { next(err); }
};

module.exports = { listInventory, listMovements, restock, adjust, damaged };
