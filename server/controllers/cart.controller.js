'use strict';

const cartService = require('../services/cart.service');
const { sendSuccess } = require('../utils/response');

const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user._id);
    sendSuccess(res, { cart });
  } catch (err) { next(err); }
};

const addItem = async (req, res, next) => {
  try {
    const cart = await cartService.addItem(req.user._id, req.body);
    sendSuccess(res, { cart }, 'Item added to cart');
  } catch (err) { next(err); }
};

const updateItem = async (req, res, next) => {
  try {
    const cart = await cartService.updateItem(req.user._id, req.params.productId, req.body.quantity);
    sendSuccess(res, { cart }, 'Cart updated');
  } catch (err) { next(err); }
};

const removeItem = async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(req.user._id, req.params.productId);
    sendSuccess(res, { cart }, 'Item removed');
  } catch (err) { next(err); }
};

const clearCart = async (req, res, next) => {
  try {
    await cartService.clearCart(req.user._id);
    sendSuccess(res, null, 'Cart cleared');
  } catch (err) { next(err); }
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
