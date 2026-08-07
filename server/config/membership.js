'use strict';

/**
 * Single source of truth for TechVault Club membership commerce constants.
 * The frontend may import a display-only copy of the price, but the server
 * value here is the only one ever used to build an Order — client-submitted
 * pricing is always ignored.
 */
const MEMBERSHIP_PRICE     = 50; // ₪, one-time / lifetime
const MEMBERSHIP_ITEM_TYPE = 'membership';
const MEMBERSHIP_SKU       = 'MEMBERSHIP-LIFETIME';
const MEMBERSHIP_NAME      = 'TechVault Club Membership';
const MEMBERSHIP_TYPE      = 'lifetime'; // only tier for now — see membership.metadata.membershipType

module.exports = {
  MEMBERSHIP_PRICE,
  MEMBERSHIP_ITEM_TYPE,
  MEMBERSHIP_SKU,
  MEMBERSHIP_NAME,
  MEMBERSHIP_TYPE,
};
