'use strict';

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');
const { getActiveDiscountMap } = require('./campaign.service');

// Minimal populate — snapshot data already stored on each item
const ITEM_POPULATE = { path: 'items.product', select: 'name slug isPublished isDeleted' };

const getCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return { user: userId, items: [], subtotal: 0 };

  // Recalculate every item's price against the current active campaign map.
  // This ensures the cart always reflects live discount state, not a stale snapshot.
  if (cart.items.length > 0) {
    const discountMap = await getActiveDiscountMap();
    const productIds  = cart.items.map(i => i.product);
    const products    = await Product.find({ _id: { $in: productIds } }).select('price').lean();
    const priceById   = new Map(products.map(p => [p._id.toString(), p.price]));

    let dirty = false;
    for (const item of cart.items) {
      const basePrice   = priceById.get(item.product.toString());
      if (basePrice == null) continue;
      const discountPct = discountMap.get(item.product.toString());
      const effective   = discountPct != null
        ? Math.round(basePrice * (1 - discountPct / 100) * 100) / 100
        : basePrice;
      const original    = discountPct != null ? basePrice : null;
      if (item.priceAtAdd !== effective || item.originalPriceAtAdd !== original) {
        item.priceAtAdd         = effective;
        item.originalPriceAtAdd = original;
        dirty = true;
      }
    }
    if (dirty) await cart.save();
  }

  return cart.populate(ITEM_POPULATE);
};

const addItem = async (userId, { productId, quantity }) => {
  const product = await Product.findById(productId)
    .select('name price stock images isPublished isDeleted');

  if (!product || !product.isPublished || product.isDeleted) {
    throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');
  }
  if (product.stock < quantity) {
    throw new AppError(`Only ${product.stock} unit(s) in stock`, StatusCodes.BAD_REQUEST, 'INSUFFICIENT_STOCK');
  }

  // Use campaign-discounted price if one is active for this product
  const discountMap = await getActiveDiscountMap();
  const discountPct = discountMap.get(product._id.toString());
  const effectivePrice = discountPct != null
    ? Math.round(product.price * (1 - discountPct / 100) * 100) / 100
    : product.price;
  const originalPriceAtAdd = discountPct != null ? product.price : null;

  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = new Cart({ user: userId, items: [] });

  const existing = cart.items.find(i => i.product.toString() === productId);
  if (existing) {
    existing.quantity          += quantity;
    existing.priceAtAdd         = effectivePrice;
    existing.originalPriceAtAdd = originalPriceAtAdd;
  } else {
    cart.items.push({
      product:    productId,
      quantity,
      priceAtAdd: effectivePrice,
      originalPriceAtAdd,
      nameAtAdd:  product.name,
      imageAtAdd: product.images?.[0] ?? '',
    });
  }

  await cart.save();
  return cart.populate(ITEM_POPULATE);
};

const updateItem = async (userId, productId, quantity) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new AppError('Cart not found', StatusCodes.NOT_FOUND, 'CART_NOT_FOUND');

  const item = cart.items.find(i => i.product.toString() === productId);
  if (!item) throw new AppError('Item not in cart', StatusCodes.NOT_FOUND, 'ITEM_NOT_FOUND');

  // Verify product still exists and is available before accepting new quantity
  const product = await Product.findOne({ _id: productId, isPublished: true, isDeleted: false })
    .select('stock');
  if (!product) throw new AppError('Product not found', StatusCodes.NOT_FOUND, 'PRODUCT_NOT_FOUND');
  if (product.stock < quantity) {
    throw new AppError(`Only ${product.stock} unit(s) in stock`, StatusCodes.BAD_REQUEST, 'INSUFFICIENT_STOCK');
  }

  item.quantity = quantity;
  await cart.save();
  return cart.populate(ITEM_POPULATE);
};

const removeItem = async (userId, productId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new AppError('Cart not found', StatusCodes.NOT_FOUND, 'CART_NOT_FOUND');

  const before = cart.items.length;
  cart.items = cart.items.filter(i => i.product.toString() !== productId);
  if (cart.items.length === before) {
    throw new AppError('Item not in cart', StatusCodes.NOT_FOUND, 'ITEM_NOT_FOUND');
  }

  await cart.save();
  return cart.populate(ITEM_POPULATE);
};

const clearCart = async (userId) => {
  await Cart.findOneAndUpdate({ user: userId }, { items: [] });
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
