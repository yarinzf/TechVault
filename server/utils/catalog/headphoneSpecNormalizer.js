'use strict';

const {
  VALID_CONNECTIONS,
  VALID_HEADPHONE_TYPES,
  VALID_USAGES,
  VALID_MICROPHONES,
  VALID_NOISE_CANCELLATIONS,
  VALID_WATER_RESISTANCE,
  VALID_CHARGING_TYPES,
} = require('./headphoneFilterConfig');

const REQUIRED_TOP_LEVEL = ['sku', 'name', 'brand', 'price', 'description', 'specs', 'images'];

const REQUIRED_SPECS = [
  'Connection',
  'Headphone Type',
  'Usage',
  'Microphone',
  'Noise Cancellation',
  'Color',
  'Warranty',
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
  const average  = parseFloat((baseMin + r1 * (baseMax - baseMin)).toFixed(1));
  const countMin = Math.floor(salesCount * 0.20);
  const countMax = Math.floor(salesCount * 0.60);
  const count    = countMin + Math.floor(r2 * (countMax - countMin + 1));
  return { average, count };
}

function deriveUsage(description, tags, explicitUsage) {
  if (explicitUsage && VALID_USAGES.has(explicitUsage)) return explicitUsage;
  const tagSet = new Set((tags || []).map(t => t.toLowerCase()));
  const text   = (description || '').toLowerCase();
  if (tagSet.has('gaming') || text.includes('gaming') || text.includes('גיימינג'))
    return 'Gaming';
  if (tagSet.has('studio') || text.includes('studio') || text.includes('סטודיו'))
    return 'Studio';
  if (tagSet.has('sport') || text.includes('sport') || text.includes('ספורט'))
    return 'Sport';
  if (tagSet.has('office') || text.includes('office') || text.includes('משרד'))
    return 'Office';
  if (tagSet.has('travel') || text.includes('travel') || text.includes('נסיעות'))
    return 'Travel';
  if (tagSet.has('kids') || text.includes('kids') || text.includes('ילדים'))
    return 'Kids';
  if (tagSet.has('calls') || text.includes('calls') || text.includes('שיחות'))
    return 'Calls';
  return 'Music';
}

function buildTags(raw, usage) {
  const set = new Set((raw.tags || []).map(t => t.toLowerCase()));

  set.add(usage.toLowerCase());
  if (raw.bestSeller) set.add('best-seller');
  if (raw.trending)   set.add('trending');
  if (raw.isFeatured) set.add('featured');

  const brand = (raw.brand || '').toLowerCase();
  if (brand) set.add(brand);

  const specs = raw.specs || {};

  const conn = (specs['Connection'] || '').toLowerCase();
  if (conn.includes('bluetooth'))    set.add('bluetooth');
  if (conn.includes('wireless'))     set.add('wireless');
  if (conn.includes('true wireless'))set.add('tws');
  if (conn.includes('wired'))        set.add('wired');
  if (conn.includes('2.4ghz'))       set.add('2.4ghz');

  const type = (specs['Headphone Type'] || '').toLowerCase();
  if (type.includes('over-ear'))     set.add('over-ear');
  if (type.includes('on-ear'))       set.add('on-ear');
  if (type.includes('in-ear'))       set.add('in-ear');
  if (type.includes('true wireless'))set.add('tws');
  if (type.includes('gaming'))       set.add('gaming-headset');
  if (type.includes('bone'))         set.add('bone-conduction');

  const nc = (specs['Noise Cancellation'] || '').toLowerCase();
  if (nc.includes('anc'))            set.add('anc');
  if (nc.includes('hybrid'))         set.add('hybrid-anc');

  const mic = (specs['Microphone'] || '').toLowerCase();
  if (mic !== 'no' && mic !== '')    set.add('microphone');

  const wr = (specs['Water Resistance'] || '').toLowerCase();
  if (wr !== 'none' && wr !== '')    set.add('waterproof');

  const rgb = (specs['RGB'] || '').toLowerCase();
  if (rgb === 'yes')                 set.add('rgb');

  const surround = (specs['Surround Sound'] || '').toLowerCase();
  if (surround !== 'no' && surround !== '') set.add('surround');

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
    if (raw.specs['Connection']          && !VALID_CONNECTIONS.has(raw.specs['Connection']))
      warns.push(`Unknown Connection: "${raw.specs['Connection']}"`);
    if (raw.specs['Headphone Type']      && !VALID_HEADPHONE_TYPES.has(raw.specs['Headphone Type']))
      warns.push(`Unknown Headphone Type: "${raw.specs['Headphone Type']}"`);
    if (raw.specs['Usage']               && !VALID_USAGES.has(raw.specs['Usage']))
      warns.push(`Unknown Usage: "${raw.specs['Usage']}"`);
    if (raw.specs['Microphone']          && !VALID_MICROPHONES.has(raw.specs['Microphone']))
      warns.push(`Unknown Microphone: "${raw.specs['Microphone']}"`);
    if (raw.specs['Noise Cancellation']  && !VALID_NOISE_CANCELLATIONS.has(raw.specs['Noise Cancellation']))
      warns.push(`Unknown Noise Cancellation: "${raw.specs['Noise Cancellation']}"`);
    if (raw.specs['Water Resistance']    && !VALID_WATER_RESISTANCE.has(raw.specs['Water Resistance']))
      warns.push(`Unknown Water Resistance: "${raw.specs['Water Resistance']}"`);
    if (raw.specs['Charging Type']       && !VALID_CHARGING_TYPES.has(raw.specs['Charging Type']))
      warns.push(`Unknown Charging Type: "${raw.specs['Charging Type']}"`);
  }

  return { errors, warns };
}

function normalize(raw, categoryId) {
  const { errors, warns } = validate(raw);
  if (errors.length > 0) return { valid: false, errors, warns, product: null };

  const usage      = deriveUsage(raw.description || '', raw.tags || [], raw.specs?.['Usage'] || null);
  const salesCount = raw.salesCount || 0;
  const ratings    = (typeof raw.ratingAverage === 'number' && typeof raw.ratingCount === 'number')
    ? { average: raw.ratingAverage, count: raw.ratingCount }
    : generateRatings(raw.sku, salesCount);

  const normalizedSpecs = { ...raw.specs, 'Usage': usage };
  if (raw.releaseYear) normalizedSpecs['Release Year'] = String(raw.releaseYear);

  const tags = buildTags(raw, usage);

  const {
    trending: _tr, bestSeller: _bs, releaseYear: _ry,
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
