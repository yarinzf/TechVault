'use strict';

const Joi = require('joi');

// Shipping V1 — canonical method identifiers, one enum used everywhere
// (React, this validator, shipping.service.js, the Order schema, tests).
// Defaults to 'standard' when omitted, matching the old implicit
// "physical home delivery" assumption from before Shipping V1 existed.
// shippingCost itself is NEVER accepted here — order.service.js is the
// sole authority on the actual charged amount (see shipping.service.js).
const createOrderSchema = Joi.object({
  shippingMethod: Joi.string().valid('store_pickup', 'standard', 'express').default('standard'),
  // Store Pickup has nothing to ship to — the address fields are optional
  // for it; standard/express (real physical delivery) still require a full
  // address (validated as Israel-only by order.service.js/shipping.service.js).
  shippingAddress: Joi.when('shippingMethod', {
    is: 'store_pickup',
    then: Joi.object({
      street:       Joi.string().trim().allow('').optional(),
      city:         Joi.string().trim().allow('').optional(),
      zip:          Joi.string().trim().allow('').optional(),
      country:      Joi.string().trim().allow('').optional(),
      // Real Hebrew display labels the customer saw in Checkout's
      // city/country pickers — presentation-only, never validated/required.
      cityLabel:    Joi.string().trim().allow('').optional(),
      countryLabel: Joi.string().trim().allow('').optional(),
    }).optional(),
    otherwise: Joi.object({
      street:       Joi.string().trim().required(),
      city:         Joi.string().trim().required(),
      zip:          Joi.string().trim().allow('').optional(),
      country:      Joi.string().trim().required(),
      cityLabel:    Joi.string().trim().allow('').optional(),
      countryLabel: Joi.string().trim().allow('').optional(),
    }).required(),
  }),
  notes:      Joi.string().trim().allow('').optional(),
  couponCode: Joi.string().trim().uppercase().min(3).max(20).optional(),
  // How many Club points the customer wants to redeem on this order — the
  // server (order.service.js) is the sole authority on whether this is
  // affordable/eligible/capped; this is only the customer's REQUEST.
  pointsToRedeem: Joi.number().integer().min(0).optional(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    .required(),
  note: Joi.string().trim().max(500).allow('').optional(),
});

module.exports = { createOrderSchema, updateStatusSchema };
