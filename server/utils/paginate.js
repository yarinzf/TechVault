'use strict';

const DEFAULT_PAGE  = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT     = 1;
const MAX_LIMIT     = 100;

/**
 * Extract and clamp pagination params from query string.
 * Non-numeric or missing values fall back to defaults.
 * Out-of-range values are clamped silently (no 4xx — bad pagination is not a client error).
 * @returns {{ page: number, limit: number, skip: number }}
 */
const paginate = (query = {}) => {
  const rawPage  = parseInt(query.page,  10);
  const rawLimit = parseInt(query.limit, 10);

  const page  = (Number.isFinite(rawPage)  && rawPage  >= 1)   ? rawPage              : DEFAULT_PAGE;
  const limit = (Number.isFinite(rawLimit) && rawLimit >= 1)   ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const skip  = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Build pagination meta block for the response envelope.
 */
const paginateMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.ceil(total / limit),
});

module.exports = { paginate, paginateMeta };
