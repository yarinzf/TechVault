'use strict';

const Joi = require('joi');

const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(60).trim().required(),
  email:    Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(128).required(),
  phone:    Joi.string().trim().optional(),
});

const loginSchema = Joi.object({
  email:    Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  name:  Joi.string().min(2).max(60).trim(),
  phone: Joi.string().trim().allow('', null),
  addresses: Joi.array().items(
    Joi.object({
      label:     Joi.string().trim(),
      street:    Joi.string().trim(),
      city:      Joi.string().trim(),
      zip:       Joi.string().trim(),
      country:   Joi.string().trim(),
      isDefault: Joi.boolean(),
    })
  ),
}).min(1); // at least one field must be provided

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     Joi.string().min(8).max(128).required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

const resetPasswordSchema = Joi.object({
  token:       Joi.string().hex().length(64).required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

module.exports = {
  registerSchema, loginSchema, updateProfileSchema,
  changePasswordSchema, forgotPasswordSchema, resetPasswordSchema,
};
