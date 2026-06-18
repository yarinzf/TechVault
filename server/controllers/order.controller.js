'use strict';

const orderService = require('../services/order.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const createOrder = async (req, res, next) => {
  try {
    const order = await orderService.createOrder(req.user._id, req.body);
    sendSuccess(res, { order }, 'Order created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const listMyOrders = async (req, res, next) => {
  try {
    const { orders, meta } = await orderService.listMyOrders(req.user._id, req.query);
    sendSuccess(res, { orders }, 'Orders retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrder(req.params.id, req.user._id, req.user.role);
    sendSuccess(res, { order }, 'Order retrieved');
  } catch (err) { next(err); }
};

const cancelOrder = async (req, res, next) => {
  try {
    // Pass full actor so cancelOrder can write the timeline entry and audit log
    const order = await orderService.cancelOrder(req.params.id, req.user);
    sendSuccess(res, { order }, 'Order cancelled');
  } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try {
    const order = await orderService.updateStatus(
      req.params.id,
      req.body.status,
      req.user,
      req,
      req.body.note ?? ''
    );
    sendSuccess(res, { order }, 'Order status updated');
  } catch (err) { next(err); }
};

const getTimeline = async (req, res, next) => {
  try {
    const data = await orderService.getOrderTimeline(req.params.id, req.user);
    sendSuccess(res, data, 'Order timeline retrieved');
  } catch (err) { next(err); }
};

const listAllOrders = async (req, res, next) => {
  try {
    const { orders, meta } = await orderService.listAllOrders(req.query);
    sendSuccess(res, { orders }, 'Orders retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

module.exports = { createOrder, listMyOrders, getOrder, cancelOrder, updateStatus, listAllOrders, getTimeline };
