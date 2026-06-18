'use strict';

const {
  VALID_CONNECTIONS,
  VALID_MOUSE_TYPES,
  VALID_HAND_ORIENTATIONS,
  VALID_SENSORS,
  VALID_POLLING_RATES,
  VALID_USAGES,
  VALID_GRIP_STYLES,
} = require('./mouseFilterConfig');

const REQUIRED_TOP_LEVEL = ['sku', 'name', 'brand', 'price', 'description', 'specs', 'images'];
const REQUIRED_SPECS = [
  'Mouse Type', 'Sensor', 'Hand Orientation', 'Polling Rate', 'Grip Style',
  'Connection', 'DPI', 'Buttons', 'Weight', 'RGB', 'Usage', 'Color', 'Warranty',
];

function deterministicRand(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

function generateRatings(sku, salesCount) {
  const r1 = deterministicRand(sku + '_avg');
  const r2 = deterministicRand(sku + '_cnt');
  const baseMin = salesCount > 100 ? 4.1 : salesCount > 50 ? 3.9 : 3.7;
  const baseMax = salesCount > 100 ? 4.8 : salesCount > 50 ? 4.6 : 4.4;
  const average = parseFloat((baseMin + r1 * (baseMax - baseMin)).toFixed(1));
  const countMin = Math.floor(salesCount * 0.20);
  const countMax = Math.floor(salesCount * 0.60);
  const count    = countMin + Math.floor(r2 * (countMax - countMin + 1));
  return { average, count };
}

function deriveUsage(description, tags, explicitUsage) {
  if (explicitUsage) return explicitUsage;
  const tagSet = new Set((tags || []).map(t => t.toLowerCase()));
  const text   = (description || '').toLowerCase();
  if (tagSet.has('esports') || text.includes('esport') || text.includes('competitive') || text.includes('fps'))
    return 'Esports';
  if (tagSet.has('gaming') || text.includes('gaming') || text.includes('game'))
    return 'Gaming';
  if (tagSet.has('mmo') || text.includes('mmo') || text.includes('massively multiplayer'))
    return 'MMO';
  if (tagSet.has('creator') || text.includes('creator') || text.includes('creative'))
    return 'Creator';
  if (tagSet.has('travel') || text.includes('travel') || text.includes('compact') || text.includes('portable'))
    return 'Travel';
  return 'Office';
}

function buildTags(raw, usage) {
  const set = new Set((raw.tags || []).map(t => t.toLowerCase()));

  set.add(usage.toLowerCase());
  if (raw.bestSeller) set.add('best-seller');
  if (raw.trending)   set.add('trending');
  if (raw.isFeatured) set.add('featured');

  const specs = raw.specs || {};
  const conn  = (specs['Connection'] || '').toLowerCase();
  if (conn.includes('wireless') || conn.includes('bluetooth') || conn.includes('multi-mode'))
    set.add('wireless');
  if (conn.includes('wired'))
    set.add('wired');

  if (specs['RGB'] === 'true') set.add('rgb');

  const sensor = (specs['Sensor'] || '').toLowerCase().replace(/[- ]/g, '');
  if (sensor) set.add(sensor);

  const orient = (specs['Hand Orientation'] || '').toLowerCase();
  if (orient.includes('left'))  set.add('left-handed');
  if (orient.includes('right')) set.add('right-handed');
  if (orient.includes('ambidextrous')) set.add('ambidextrous');

  const dpiStr = specs['DPI'] || '';
  const maxDpi = parseInt(dpiStr.replace(/[^0-9]/g, '')) || 0;
  if (maxDpi >= 25000) set.add('ultra-high-dpi');
  else if (maxDpi >= 12000) set.add('high-dpi');

  const grip = (specs['Grip Style'] || '').toLowerCase();
  if (grip) set.add(grip + '-grip');

  const mouseType = (specs['Mouse Type'] || '').toLowerCase();
  if (mouseType) set.add(mouseType);

  return [...set];
}

function validate(raw) {
  const errors = [];
  const warns  = [];

  for (const field of REQUIRED_TOP_LEVEL) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === '')
      errors.push(`Missing required field: ${field}`);
  }
  if (raw.price !== undefined && (typeof raw.price !== 'number' || raw.price <= 0))
    errors.push(`Invalid price: ${raw.price}`);
  if (raw.compareAtPrice !== undefined && raw.compareAtPrice <= raw.price)
    errors.push(`compareAtPrice (${raw.compareAtPrice}) must exceed price (${raw.price})`);
  if (raw.stock !== undefined && (typeof raw.stock !== 'number' || raw.stock < 0))
    errors.push(`Invalid stock: ${raw.stock}`);
  if (!Array.isArray(raw.images) || raw.images.length === 0)
    errors.push('images array is empty');

  if (raw.specs && typeof raw.specs === 'object') {
    for (const key of REQUIRED_SPECS) {
      if (!raw.specs[key]) errors.push(`Missing spec: "${key}"`);
    }
    if (raw.specs['Mouse Type']      && !VALID_MOUSE_TYPES.has(raw.specs['Mouse Type']))
      warns.push(`Unknown Mouse Type: "${raw.specs['Mouse Type']}"`);
    if (raw.specs['Sensor']          && !VALID_SENSORS.has(raw.specs['Sensor']))
      warns.push(`Unknown Sensor: "${raw.specs['Sensor']}"`);
    if (raw.specs['Hand Orientation'] && !VALID_HAND_ORIENTATIONS.has(raw.specs['Hand Orientation']))
      warns.push(`Unknown Hand Orientation: "${raw.specs['Hand Orientation']}"`);
    if (raw.specs['Polling Rate']    && !VALID_POLLING_RATES.has(raw.specs['Polling Rate']))
      warns.push(`Unknown Polling Rate: "${raw.specs['Polling Rate']}"`);
    if (raw.specs['Grip Style']      && !VALID_GRIP_STYLES.has(raw.specs['Grip Style']))
      warns.push(`Unknown Grip Style: "${raw.specs['Grip Style']}"`);
    if (raw.specs['Connection']      && !VALID_CONNECTIONS.has(raw.specs['Connection']))
      warns.push(`Unknown Connection: "${raw.specs['Connection']}"`);
    if (raw.specs['Usage']           && !VALID_USAGES.has(raw.specs['Usage']))
      warns.push(`Unknown Usage: "${raw.specs['Usage']}"`);
  }

  return { errors, warns };
}

function normalize(raw, categoryId) {
  const { errors, warns } = validate(raw);
  if (errors.length > 0) return { valid: false, errors, warns, product: null };

  const usage      = deriveUsage(raw.description || '', raw.tags || [], raw.specs?.['Usage'] || raw.usage || null);
  const salesCount = raw.salesCount || 0;
  const ratings    = (typeof raw.ratingAverage === 'number' && typeof raw.ratingCount === 'number')
    ? { average: raw.ratingAverage, count: raw.ratingCount }
    : generateRatings(raw.sku, salesCount);

  const normalizedSpecs = { ...raw.specs, 'Usage': usage };
  if (raw.releaseYear) normalizedSpecs['Release Year'] = String(raw.releaseYear);

  const tags = buildTags(raw, usage);

  const {
    trending: _tr, bestSeller: _bs, releaseYear: _ry, usage: _us,
    ratingAverage: _ra, ratingCount: _rc,
    ...rest
  } = raw;

  return {
    valid: true,
    errors: [],
    warns,
    product: {
      ...rest,
      category:    categoryId,
      specs:       normalizedSpecs,
      tags,
      ratings,
      salesCount,
      isPublished: raw.isPublished !== false,
      isFeatured:  raw.isFeatured === true,
    },
  };
}

module.exports = { normalize, validate, generateRatings };
