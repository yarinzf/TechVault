'use strict';

/**
 * keyboardSpecNormalizer
 *
 * Transforms raw brand-file product objects into fully normalized Product
 * documents ready for MongoDB insertion.
 *
 * What it does:
 *  - Validates required fields and spec keys
 *  - Derives 'Hot Swap', 'Size %', 'Usage', 'Release Year' spec entries
 *  - Generates deterministic ratings (seeded on SKU) unless overridden
 *  - Promotes hotSwap / trending / bestSeller / releaseYear / usage hints
 *    from the raw object into the right places on the final document
 *  - Deduplicates and enriches the tags array
 *  - Strips fields the Product model doesn't know about
 */

const {
  VALID_KEYBOARD_TYPES,
  VALID_LAYOUTS,
  VALID_CONNECTIONS,
  VALID_LANGUAGES,
  VALID_BACKLIGHTS,
  VALID_SWITCH_TYPES,
} = require('./keyboardFilterConfig');

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_TOP_LEVEL = ['sku', 'name', 'brand', 'price', 'description', 'specs', 'images'];
const REQUIRED_SPECS     = ['Keyboard Type', 'Connection', 'Layout', 'Language', 'Switch Type', 'Backlight', 'RGB', 'Numpad', 'Wireless', 'Bluetooth'];

const LAYOUT_TO_SIZE = {
  'Full Size': '100',
  'TKL':       '87',
  '96%':       '96',
  '75%':       '75',
  '65%':       '65',
  '60%':       '60',
};

// Keywords that signal office/productivity usage
const OFFICE_SIGNALS = /\b(office|productivity|typing|professional|business|work|htpc|quiet|silent|secretary)\b/i;
// Keywords that signal gaming usage
const GAMING_SIGNALS = /\b(gaming|fps|esport|competitive|rgb|streamer|macro|rapid|actuati|reflex)\b/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministic pseudo-random float in [0, 1) seeded from a string.
 * Ensures ratings don't change between --force re-seeds.
 */
function deterministicRand(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Second hash pass for better distribution
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * Generate realistic ratings based on sales count and SKU.
 * More popular products (high salesCount) skew slightly higher.
 */
function generateRatings(sku, salesCount) {
  const r1 = deterministicRand(sku + '_avg');
  const r2 = deterministicRand(sku + '_cnt');

  // Base average: 3.7–4.8 range, higher for popular products
  const baseMin = salesCount > 100 ? 4.1 : salesCount > 50 ? 3.9 : 3.7;
  const baseMax = salesCount > 100 ? 4.8 : salesCount > 50 ? 4.6 : 4.4;
  const average = parseFloat((baseMin + r1 * (baseMax - baseMin)).toFixed(1));

  // Review count: 20–60% of sales
  const countMin = Math.floor(salesCount * 0.20);
  const countMax = Math.floor(salesCount * 0.60);
  const count    = countMin + Math.floor(r2 * (countMax - countMin + 1));

  return { average, count };
}

/**
 * Derive 'Usage' tag from description text and explicit tags.
 */
function deriveUsage(description, tags, explicitUsage) {
  if (explicitUsage) return explicitUsage;
  const tagSet = new Set(tags || []);
  const isGaming = tagSet.has('gaming') || tagSet.has('fps') || tagSet.has('esports') || GAMING_SIGNALS.test(description);
  const isOffice  = tagSet.has('office') || tagSet.has('productivity') || OFFICE_SIGNALS.test(description);
  if (isGaming && isOffice) return 'Gaming & Office';
  if (isOffice)              return 'Office';
  return 'Gaming';
}

/**
 * Build the enriched tags array: preserve originals, add usage, flags, SEO hints.
 */
function buildTags(raw, usage, hotSwap) {
  const base = [...(raw.tags || [])];
  const set  = new Set(base.map(t => t.toLowerCase()));

  // Usage tag
  const usageTag = usage.toLowerCase().replace(/ & /g, '-and-');
  set.add(usageTag);

  // Hot-swap tag
  if (hotSwap === 'true') set.add('hot-swap');

  // Flags
  if (raw.bestSeller) set.add('best-seller');
  if (raw.trending)   set.add('trending');

  // Wireless convenience tag
  if (raw.specs?.['Wireless'] === 'true' || raw.specs?.['Bluetooth'] === 'true') {
    set.add('wireless');
  }

  // Layout convenience tags
  const layout = raw.specs?.['Layout'];
  if (layout) set.add(layout.toLowerCase().replace(' ', '-'));

  // Switch family tags
  const sw = (raw.specs?.['Switch Type'] || '').toLowerCase();
  if (sw.includes('red'))    set.add('linear');
  if (sw.includes('brown'))  set.add('tactile');
  if (sw.includes('blue'))   set.add('clicky');
  if (sw.includes('silent')) set.add('silent');
  if (sw.includes('optical')) set.add('optical');

  // Language tag
  if (raw.specs?.['Language'] === 'Hebrew + English') set.add('hebrew');

  return [...set];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(raw) {
  const errors = [];

  // Required top-level fields
  for (const field of REQUIRED_TOP_LEVEL) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (raw.price !== undefined && (typeof raw.price !== 'number' || raw.price <= 0)) {
    errors.push(`Invalid price: ${raw.price}`);
  }
  if (raw.compareAtPrice !== undefined && raw.compareAtPrice <= raw.price) {
    errors.push(`compareAtPrice (${raw.compareAtPrice}) must exceed price (${raw.price})`);
  }
  if (raw.stock !== undefined && (typeof raw.stock !== 'number' || raw.stock < 0)) {
    errors.push(`Invalid stock: ${raw.stock}`);
  }
  if (!Array.isArray(raw.images) || raw.images.length === 0) {
    errors.push('images array is empty');
  }

  if (raw.specs && typeof raw.specs === 'object') {
    // Required spec keys
    for (const key of REQUIRED_SPECS) {
      if (!raw.specs[key]) errors.push(`Missing spec: "${key}"`);
    }

    // Value validation (warn rather than fail for wrong values)
    const warns = [];
    if (raw.specs['Keyboard Type'] && !VALID_KEYBOARD_TYPES.has(raw.specs['Keyboard Type'])) {
      warns.push(`Unknown Keyboard Type: "${raw.specs['Keyboard Type']}"`);
    }
    if (raw.specs['Layout'] && !VALID_LAYOUTS.has(raw.specs['Layout'])) {
      warns.push(`Unknown Layout: "${raw.specs['Layout']}"`);
    }
    if (raw.specs['Connection'] && !VALID_CONNECTIONS.has(raw.specs['Connection'])) {
      warns.push(`Unknown Connection: "${raw.specs['Connection']}"`);
    }
    if (raw.specs['Language'] && !VALID_LANGUAGES.has(raw.specs['Language'])) {
      warns.push(`Unknown Language: "${raw.specs['Language']}"`);
    }
    if (raw.specs['Backlight'] && !VALID_BACKLIGHTS.has(raw.specs['Backlight'])) {
      warns.push(`Unknown Backlight: "${raw.specs['Backlight']}"`);
    }
    if (raw.specs['Switch Type'] && !VALID_SWITCH_TYPES.has(raw.specs['Switch Type'])) {
      warns.push(`Unknown Switch Type: "${raw.specs['Switch Type']}"`);
    }
    return { errors, warns };
  }

  return { errors, warns: [] };
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Normalizes a raw brand-file product into a clean Product document.
 *
 * @param {object} raw        - Raw product from a brand data file
 * @param {ObjectId} categoryId - Mongoose ObjectId for the Keyboards category
 * @returns {{ valid: boolean, errors: string[], warns: string[], product: object|null }}
 */
function normalize(raw, categoryId) {
  const { errors, warns } = validate(raw);
  if (errors.length > 0) {
    return { valid: false, errors, warns, product: null };
  }

  // ── Derived spec values ────────────────────────────────────────────────────
  const layout   = raw.specs['Layout'];
  const sizePercent = LAYOUT_TO_SIZE[layout] || layout.replace('%', '').trim();

  // Hot Swap: explicit field → tag → description scan
  let hotSwap = 'false';
  if (raw.hotSwap === true || raw.hotSwap === 'true') {
    hotSwap = 'true';
  } else if ((raw.tags || []).includes('hot-swap')) {
    hotSwap = 'true';
  } else if (/hot.?swap/i.test(raw.description || '')) {
    hotSwap = 'true';
  }

  const usage = deriveUsage(raw.description || '', raw.tags || [], raw.usage || null);

  // ── Ratings ────────────────────────────────────────────────────────────────
  const salesCount = raw.salesCount || 0;
  let ratings;
  if (typeof raw.ratingAverage === 'number' && typeof raw.ratingCount === 'number') {
    ratings = { average: raw.ratingAverage, count: raw.ratingCount };
  } else {
    ratings = generateRatings(raw.sku, salesCount);
  }

  // ── Enriched specs ─────────────────────────────────────────────────────────
  const normalizedSpecs = {
    ...raw.specs,
    'Hot Swap':     hotSwap,
    'Size %':       sizePercent,
    'Usage':        usage,
  };
  if (raw.releaseYear) {
    normalizedSpecs['Release Year'] = String(raw.releaseYear);
  }

  // ── Tags ───────────────────────────────────────────────────────────────────
  const tags = buildTags(raw, usage, hotSwap);

  // ── Fields the Product model doesn't know — strip before insert ────────────
  const {
    hotSwap: _hs,
    trending: _tr,
    bestSeller: _bs,
    releaseYear: _ry,
    usage: _us,
    ratingAverage: _ra,
    ratingCount: _rc,
    seoTitle: _st,
    seoDescription: _sd,
    ...rest
  } = raw;

  const product = {
    ...rest,
    category: categoryId,
    specs:    normalizedSpecs,
    tags,
    ratings,
    salesCount,
    isPublished: raw.isPublished !== false,  // default true
    isFeatured:  raw.isFeatured === true,
  };

  return { valid: true, errors: [], warns, product };
}

module.exports = { normalize, validate, generateRatings };
