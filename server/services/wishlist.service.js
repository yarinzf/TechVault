'use strict';

const Wishlist = require('../models/Wishlist');
const Product  = require('../models/Product');
const { getProductsByIds } = require('./product.service');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

// Wishlist docs only store ObjectId refs — actual product data (including
// live campaign discountedPrice/discountPercent, which are computed, not
// schema fields) is resolved via the same enrichment path as the rest of
// the catalog (see product.service.js#getProductsByIds). This also drops
// stale references to deleted/unpublished products for free (Step 11).
const getWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId }).lean();
  const products = await getProductsByIds((wishlist?.products ?? []).map(String));
  return { user: userId, products };
};

const addProduct = async (userId, productId) => {
  const product = await Product.findOne({ _id: productId, isPublished: true, isDeleted: false });
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');

  await Wishlist.findOneAndUpdate(
    { user: userId },
    { $addToSet: { products: productId } },
    { upsert: true }
  );

  return getWishlist(userId);
};

const removeProduct = async (userId, productId) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: userId },
    { $pull: { products: productId } },
    { new: true }
  );

  if (!wishlist) throw new AppError('Wishlist not found', StatusCodes.NOT_FOUND, 'WISHLIST_NOT_FOUND');
  return getWishlist(userId);
};

const clearWishlist = async (userId) => {
  await Wishlist.findOneAndUpdate(
    { user: userId },
    { $set: { products: [] } },
    { upsert: true }
  );
  return { user: userId, products: [] };
};

module.exports = { getWishlist, addProduct, removeProduct, clearWishlist };
