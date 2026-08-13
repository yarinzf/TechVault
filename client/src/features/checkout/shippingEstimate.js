// Shipping V1 — display-only estimate, mirrors server/services/shipping.service.js.
// NEVER authoritative: the real shippingCost charged is always recalculated
// server-side by order.service.js from the server-verified merchandise
// subtotal and real Club membership status. This module exists only so the
// Cart/Checkout UI can show a truthful price/free-shipping state instead of
// a hardcoded "free" label before the order is actually created.

export const SHIPPING_METHODS = ['store_pickup', 'standard', 'express'];

export const STANDARD_SHIPPING_COST = 29.90;
export const EXPRESS_SHIPPING_COST  = 49.90;

export const FREE_SHIPPING_THRESHOLD_REGULAR = 599.00;
export const FREE_SHIPPING_THRESHOLD_MEMBER  = 299.00;

export function freeShippingThreshold(isMember) {
  return isMember ? FREE_SHIPPING_THRESHOLD_MEMBER : FREE_SHIPPING_THRESHOLD_REGULAR;
}

// merchandiseSubtotal: cart/order subtotal BEFORE coupon discount — matches
// the server rule that a coupon must never retroactively remove an
// already-earned free-shipping benefit.
export function estimateShipping(method, merchandiseSubtotal, isMember) {
  if (method === 'store_pickup') return { cost: 0, isFree: true };
  if (method === 'express')      return { cost: EXPRESS_SHIPPING_COST, isFree: false };
  if (method === 'standard') {
    const isFree = merchandiseSubtotal >= freeShippingThreshold(isMember);
    return { cost: isFree ? 0 : STANDARD_SHIPPING_COST, isFree };
  }
  return { cost: null, isFree: false }; // no method chosen yet
}
