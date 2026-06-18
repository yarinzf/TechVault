'use strict';

/**
 * Single source of truth for all role names and permission sets.
 * Import this anywhere roles need to be referenced — never use string literals.
 */
const ROLES = Object.freeze({
  USER:       'user',
  ADMIN:      'admin',
  SUPERADMIN: 'superadmin',
  WAREHOUSE:  'warehouse',
});

/** admin + superadmin — analytics, product management, order management */
const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPERADMIN];

/** all staff — admin_roles + warehouse fulfillment access */
const STAFF_ROLES = [ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.WAREHOUSE];

/** all valid roles — used for Joi validation */
const ALL_ROLES = Object.values(ROLES);

module.exports = { ROLES, ADMIN_ROLES, STAFF_ROLES, ALL_ROLES };
