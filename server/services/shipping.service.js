'use strict';

const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

/**
 * Shipping V1 — Israel-only, three static methods, server-authoritative.
 * No ShippingRule collection, no admin configuration, no zones/weight/
 * carrier integration — those are explicitly future work (see the Shipping
 * V1 spec). Every number here is the single source of truth; the client is
 * never trusted for shippingCost.
 */
const SHIPPING_METHODS = ['store_pickup', 'standard', 'express'];

const STANDARD_SHIPPING_COST = 29.90;
const EXPRESS_SHIPPING_COST  = 49.90;

// Free-standard-shipping eligibility is based on the authoritative
// merchandise subtotal AFTER product/campaign/VIP pricing but BEFORE any
// coupon discount and BEFORE shipping itself — see order.service.js. A
// coupon must never retroactively strip an already-earned free-shipping
// benefit (e.g. ₪610 subtotal + ₪50 coupon still ships free, because
// eligibility is decided from ₪610, not ₪560).
const FREE_SHIPPING_THRESHOLD_REGULAR = 599.00;
const FREE_SHIPPING_THRESHOLD_MEMBER  = 299.00;

// Shipping V1 is Israel-only. The real checkout form and location.service.js
// both use the full country name 'Israel'; 'IL' (ISO 3166-1 alpha-2) is
// accepted as an equivalent alias since it's a common representation for
// the same country and nothing in this codebase currently enforces a single
// canonical country string.
const ISRAEL_COUNTRY_ALIASES = new Set(['israel', 'il']);
const isIsraelCountry = (country) =>
  !!country && ISRAEL_COUNTRY_ALIASES.has(String(country).trim().toLowerCase());

const assertValidShippingMethod = (method) => {
  if (!SHIPPING_METHODS.includes(method)) {
    throw new AppError(`Invalid shipping method "${method}"`, StatusCodes.BAD_REQUEST, 'INVALID_SHIPPING_METHOD');
  }
};

// store_pickup never needs a delivery address, so it's exempt — only
// standard/express (real physical delivery) are Israel-only in Shipping V1.
const assertShippingCountrySupported = (method, country) => {
  if (method === 'store_pickup') return;
  if (!isIsraelCountry(country)) {
    throw new AppError(
      'Physical delivery is currently only available within Israel',
      StatusCodes.BAD_REQUEST,
      'SHIPPING_COUNTRY_NOT_SUPPORTED'
    );
  }
};

/**
 * calculateShipping({ method, merchandiseSubtotal, isActiveClubMember })
 *   → { method, cost, isFree, freeShippingReason }
 *
 * Assumes method/country have already been validated (see the two asserts
 * above) — this function only prices an already-legal request. Express is
 * NEVER free, regardless of subtotal or membership. Store Pickup is ALWAYS
 * free. Standard is free once merchandiseSubtotal reaches the caller's
 * threshold (₪299 for an active Club member, ₪599 otherwise).
 */
const calculateShipping = ({ method, merchandiseSubtotal, isActiveClubMember }) => {
  if (method === 'store_pickup') {
    return { method, cost: 0, isFree: true, freeShippingReason: 'store_pickup' };
  }

  if (method === 'express') {
    return { method, cost: EXPRESS_SHIPPING_COST, isFree: false, freeShippingReason: null };
  }

  // method === 'standard'
  const threshold = isActiveClubMember ? FREE_SHIPPING_THRESHOLD_MEMBER : FREE_SHIPPING_THRESHOLD_REGULAR;
  const roundedSubtotal = Math.round(merchandiseSubtotal * 100) / 100;
  if (roundedSubtotal >= threshold) {
    return {
      method,
      cost: 0,
      isFree: true,
      freeShippingReason: isActiveClubMember ? 'club_threshold' : 'regular_threshold',
    };
  }
  return { method, cost: STANDARD_SHIPPING_COST, isFree: false, freeShippingReason: null };
};

module.exports = {
  SHIPPING_METHODS,
  STANDARD_SHIPPING_COST,
  EXPRESS_SHIPPING_COST,
  FREE_SHIPPING_THRESHOLD_REGULAR,
  FREE_SHIPPING_THRESHOLD_MEMBER,
  isIsraelCountry,
  assertValidShippingMethod,
  assertShippingCountrySupported,
  calculateShipping,
};
