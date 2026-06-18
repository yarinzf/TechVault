'use strict';

const Wishlist = require('../models/Wishlist');
const Product  = require('../models/Product');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

const PRODUCT_FIELDS = 'name slug images price discountedPrice discountPercent brand ratings stock isPublished isDeleted';

const filterActive = (wishlist) => {
  wishlist.products = wishlist.products.filter(p => p.isPublished && !p.isDeleted);
  return wishlist;
};

const getWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId })
    .populate('products', PRODUCT_FIELDS);
  if (!wishlist) return { user: userId, products: [] };
  return filterActive(wishlist);
};

const addProduct = async (userId, productId) => {
  const product = await Product.findOne({ _id: productId, isPublished: true, isDeleted: false });
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');

  const wishlist = await Wishlist.findOneAndUpdate(
    { user: userId },
    { $addToSet: { products: productId } },
    { new: true, upsert: true }
  ).populate('products', PRODUCT_FIELDS);

  return filterActive(wishlist);
};

const removeProduct = async (userId, productId) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: userId },
    { $pull: { products: productId } },
    { new: true }
  ).populate('products', PRODUCT_FIELDS);

  if (!wishlist) throw new AppError('Wishlist not found', StatusCodes.NOT_FOUND, 'WISHLIST_NOT_FOUND');
  return filterActive(wishlist);
};

module.exports = { getWishlist, addProduct, removeProduct };
