'use strict';

const supplierService = require('../services/supplier.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const listSuppliers = async (req, res, next) => {
  try {
    const { suppliers, meta } = await supplierService.listSuppliers(req.query);
    sendSuccess(res, { suppliers }, 'Suppliers retrieved', StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const getSupplier = async (req, res, next) => {
  try {
    const supplier = await supplierService.getSupplier(req.params.id);
    sendSuccess(res, { supplier });
  } catch (err) { next(err); }
};

const createSupplier = async (req, res, next) => {
  try {
    const supplier = await supplierService.createSupplier(req.body, req.user, req);
    sendSuccess(res, { supplier }, 'Supplier created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await supplierService.updateSupplier(req.params.id, req.body, req.user, req);
    sendSuccess(res, { supplier }, 'Supplier updated');
  } catch (err) { next(err); }
};

const deleteSupplier = async (req, res, next) => {
  try {
    await supplierService.deleteSupplier(req.params.id, req.user, req);
    res.status(StatusCodes.NO_CONTENT).send();
  } catch (err) { next(err); }
};

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier };
