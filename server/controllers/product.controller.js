'use strict';

const Product        = require('../models/Product');
const productService = require('../services/product.service');
const audit          = require('../services/audit.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const list = async (req, res, next) => {
  try {
    const { products, meta } = await productService.listProducts(req.query);
    sendSuccess(res, { products }, 'Products retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const product = await productService.getProduct(req.params.slug);
    sendSuccess(res, { product }, 'Product retrieved');
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const product = await productService.createProduct(req.body);
    audit.log({
      action:   'product.created',
      entity:   'Product',
      entityId: product._id,
      actor:    req.user,
      after:    { name: product.name, sku: product.sku, price: product.price, stock: product.stock },
      req,
    });
    sendSuccess(res, { product }, 'Product created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const before = await Product.findById(req.params.id).select('name sku price stock category isActive').lean();
    const product = await productService.updateProduct(req.params.id, req.body);
    audit.log({
      action:   'product.updated',
      entity:   'Product',
      entityId: product._id,
      actor:    req.user,
      before:   before ? { name: before.name, sku: before.sku, price: before.price, stock: before.stock, isActive: before.isActive } : null,
      after:    { name: product.name, sku: product.sku, price: product.price, stock: product.stock, isActive: product.isActive },
      req,
    });
    sendSuccess(res, { product }, 'Product updated');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const before = await Product.findById(req.params.id).select('name sku price').lean();
    await productService.deleteProduct(req.params.id);
    audit.log({
      action:   'product.deleted',
      entity:   'Product',
      entityId: req.params.id,
      actor:    req.user,
      before:   before ? { name: before.name, sku: before.sku, price: before.price } : null,
      after:    null,
      req,
    });
    sendSuccess(res, null, 'Product deleted');
  } catch (err) { next(err); }
};

const autocomplete = async (req, res, next) => {
  try {
    const products = await productService.autocomplete(req.query.q, req.query.limit);
    sendSuccess(res, { products });
  } catch (err) { next(err); }
};

const updateStock = async (req, res, next) => {
  try {
    const product = await productService.updateStock(
      req.params.id,
      req.user._id,
      req.body.type,
      req.body.amount
    );
    sendSuccess(res, { product }, 'Stock updated');
  } catch (err) { next(err); }
};

const stockHistory = async (req, res, next) => {
  try {
    const result = await productService.getStockHistory(req.params.id);
    sendSuccess(res, result, 'Stock history retrieved');
  } catch (err) { next(err); }
};

const listCategories = async (req, res, next) => {
  try {
    const categories = await productService.listCategories();
    sendSuccess(res, { categories });
  } catch (err) { next(err); }
};

module.exports = { list, getOne, create, update, remove, autocomplete, updateStock, stockHistory, listCategories };
