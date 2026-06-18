'use strict';

const poService       = require('../services/purchase-order.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const listPurchaseOrders = async (req, res, next) => {
  try {
    const { orders, meta } = await poService.listPurchaseOrders(req.query);
    sendSuccess(res, { orders }, 'Purchase orders retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const getPurchaseOrder = async (req, res, next) => {
  try {
    const order = await poService.getPurchaseOrder(req.params.id);
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

const createPurchaseOrder = async (req, res, next) => {
  try {
    const order = await poService.createPurchaseOrder(req.body, req.user, req);
    sendSuccess(res, { order }, 'Purchase order created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const updatePurchaseOrder = async (req, res, next) => {
  try {
    const order = await poService.updatePurchaseOrder(req.params.id, req.body, req.user, req);
    sendSuccess(res, { order }, 'Purchase order updated');
  } catch (err) { next(err); }
};

const receivePurchaseOrder = async (req, res, next) => {
  try {
    const order = await poService.receivePurchaseOrder(req.params.id, req.body, req.user, req);
    sendSuccess(res, { order }, 'Items received');
  } catch (err) { next(err); }
};

const getRestockSuggestions = async (req, res, next) => {
  try {
    const suggestions = await poService.getRestockSuggestions();
    sendSuccess(res, { suggestions });
  } catch (err) { next(err); }
};

module.exports = {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  getRestockSuggestions,
};
