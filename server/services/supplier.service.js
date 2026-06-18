'use strict';

const { StatusCodes }  = require('http-status-codes');
const Supplier         = require('../models/Supplier');
const { AppError }     = require('../middleware/errorHandler');
const { paginate, paginateMeta } = require('../utils/paginate');
const audit            = require('./audit.service');

const listSuppliers = async (query = {}) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};

  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;
  if (query.search) {
    const rx = new RegExp(query.search.trim(), 'i');
    filter.$or = [{ name: rx }, { contactName: rx }, { email: rx }];
  }

  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Supplier.countDocuments(filter),
  ]);

  return { suppliers, meta: paginateMeta(total, page, limit) };
};

const getSupplier = async (id) => {
  const supplier = await Supplier.findById(id).lean();
  if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND, 'SUPPLIER_NOT_FOUND');
  return supplier;
};

const createSupplier = async (dto, actor, req) => {
  const supplier = await Supplier.create(dto);

  audit.log({
    action:   'supplier.created',
    entity:   'Supplier',
    entityId: supplier._id,
    actor,
    after:    { name: supplier.name, email: supplier.email, isActive: supplier.isActive },
    req,
  });

  return supplier;
};

const updateSupplier = async (id, dto, actor, req) => {
  const before = await Supplier.findById(id).lean();
  if (!before) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND, 'SUPPLIER_NOT_FOUND');

  const updated = await Supplier.findByIdAndUpdate(id, dto, { new: true, runValidators: true }).lean();

  audit.log({
    action:   'supplier.updated',
    entity:   'Supplier',
    entityId: id,
    actor,
    before:   { name: before.name, isActive: before.isActive, email: before.email },
    after:    { name: updated.name, isActive: updated.isActive, email: updated.email },
    req,
  });

  return updated;
};

const deleteSupplier = async (id, actor, req) => {
  const supplier = await Supplier.findById(id).lean();
  if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND, 'SUPPLIER_NOT_FOUND');

  await Supplier.findByIdAndDelete(id);

  audit.log({
    action:   'supplier.deleted',
    entity:   'Supplier',
    entityId: id,
    actor,
    before:   { name: supplier.name },
    after:    null,
    req,
  });
};

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier };
