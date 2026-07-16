// Centralized bilingual fallback logic for product-authored content (name,
// short description, full description) — as opposed to interface text,
// which stays in the existing i18n `translations.js` system. See the
// optional `nameHe`/`shortDescriptionHe`/`descriptionHe` fields added to
// server/models/Product.js.
//
// Brand/model identifiers (e.g. "ASUS ROG Swift PG27AQDM") normally stay in
// the base `name` field even in Hebrew mode — `nameHe` is only used when the
// catalog actually set a genuinely localized name for that specific product.

// Defensive: the API should always return strings, but never let a
// non-string (or literal "undefined"/"null" text) leak into the UI.
function safeString(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';
  return trimmed;
}

/**
 * @param {object} product
 * @param {'he'|'en'} language
 * @returns {string} Product name — localized only when a real `nameHe` exists.
 */
export function getLocalizedProductName(product, language) {
  const name = safeString(product?.name);
  const nameHe = safeString(product?.nameHe);
  if (language === 'he') return nameHe || name;
  return name || nameHe;
}

/**
 * @param {object} product
 * @param {'he'|'en'} language
 * @returns {string} Short description, falling back to the other language, then ''.
 */
export function getLocalizedShortDescription(product, language) {
  const short = safeString(product?.shortDescription);
  const shortHe = safeString(product?.shortDescriptionHe);
  if (language === 'he') return shortHe || short;
  return short || shortHe;
}

/**
 * @param {object} product
 * @param {'he'|'en'} language
 * @returns {string} Full description, falling back to the other language, then ''.
 */
export function getLocalizedDescription(product, language) {
  const desc = safeString(product?.description);
  const descHe = safeString(product?.descriptionHe);
  if (language === 'he') return descHe || desc;
  return desc || descHe;
}
