'use strict';

const wishlistService = require('../services/wishlist.service');
const { sendSuccess } = require('../utils/response');

const getWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.getWishlist(req.user._id);
    sendSuccess(res, { wishlist });
  } catch (err) { next(err); }
};

const addProduct = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.addProduct(req.user._id, req.params.productId);
    sendSuccess(res, { wishlist }, 'Product added to wishlist');
  } catch (err) { next(err); }
};

const removeProduct = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.removeProduct(req.user._id, req.params.productId);
    sendSuccess(res, { wishlist }, 'Product removed from wishlist');
  } catch (err) { next(err); }
};

module.exports = { getWishlist, addProduct, removeProduct };
