'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

// slug is intentionally NOT accepted — Category's own pre('save') hook
// derives it from `name` (slugify), the same way every existing category
// was created. See admin.service.js#createCategory.
const createCategorySchema = Joi.object({
  name:           Joi.string().trim().min(2).max(50).required(),
  description:    Joi.string().trim().max(300).allow('').optional(),
  parentCategory: objectId.allow(null).optional(),
  isActive:       Joi.boolean().optional(),
});

const updateCategorySchema = Joi.object({
  name:        Joi.string().trim().min(2).max(50).optional(),
  description: Joi.string().trim().max(300).allow('').optional(),
  isActive:    Joi.boolean().optional(),
}).min(1);

const reorderCategoriesSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id:        objectId.required(),
      sortOrder: Joi.number().integer().min(0).required(),
    })
  ).min(1).required(),
});

module.exports = { createCategorySchema, updateCategorySchema, reorderCategoriesSchema };
