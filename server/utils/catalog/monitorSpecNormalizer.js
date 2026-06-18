'use strict';

const {
  VALID_SCREEN_SIZES,
  VALID_RESOLUTIONS,
  VALID_PANEL_TYPES,
  VALID_REFRESH_RATES,
  VALID_RESPONSE_TIMES,
  VALID_ASPECT_RATIOS,
  VALID_ADAPTIVE_SYNCS,
  VALID_USAGES,
} = require('./monitorFilterConfig');

const REQUIRED_TOP_LEVEL = ['sku', 'name', 'brand', 'price', 'description', 'specs', 'images'];
const REQUIRED_SPECS = [
  'Screen Size', 'Resolution', 'Panel Type', 'Refresh Rate', 'Response Time',
  'Aspect Ratio', 'Curved', 'Ultrawide', 'HDR', 'Adaptive Sync',
  'Ports', 'Speakers', 'Height Adjustable', 'VESA Mount', 'Usage', 'Color', 'Warranty',
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
  if (tagSet.has('gaming') || text.includes('gaming') || text.includes('esport') || text.includes('fps'))
    return 'Gaming';
  if (tagSet.has('creator') || text.includes('creator') || text.includes('color accuracy') || text.includes('adobe'))
    return 'Creator';
  if (tagSet.has('professional') || text.includes('professional') || text.includes('proart') || text.includes('color grading'))
    return 'Professional';
  return 'Office';
}

function buildTags(raw, usage) {
  const set = new Set((raw.tags || []).map(t => t.toLowerCase()));

  set.add(usage.toLowerCase());
  if (raw.bestSeller) set.add('best-seller');
  if (raw.trending)   set.add('trending');
  if (raw.isFeatured) set.add('featured');

  const specs = raw.specs || {};
  if (specs['Curved']    === 'true') set.add('curved');
  if (specs['Ultrawide'] === 'true') set.add('ultrawide');
  if (specs['HDR']       === 'true') set.add('hdr');

  const panel = (specs['Panel Type'] || '').toLowerCase();
  if (panel) set.add(panel.replace(/[- ]/g, ''));

  const res = specs['Resolution'] || '';
  if (res === '4K UHD')     set.add('4k');
  if (res === 'QHD')        set.add('qhd');
  if (res === 'Full HD')    set.add('full-hd');
  if (res === 'Dual QHD')   set.add('dual-qhd');

  const hz = specs['Refresh Rate'] || '';
  if (parseInt(hz) >= 144) set.add('high-refresh');
  if (parseInt(hz) >= 240) set.add('esports');

  const size = specs['Screen Size'] || '';
  if (size) set.add(size.replace('"', 'inch'));

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
    if (raw.specs['Screen Size']   && !VALID_SCREEN_SIZES.has(raw.specs['Screen Size']))
      warns.push(`Unknown Screen Size: "${raw.specs['Screen Size']}"`);
    if (raw.specs['Resolution']    && !VALID_RESOLUTIONS.has(raw.specs['Resolution']))
      warns.push(`Unknown Resolution: "${raw.specs['Resolution']}"`);
    if (raw.specs['Panel Type']    && !VALID_PANEL_TYPES.has(raw.specs['Panel Type']))
      warns.push(`Unknown Panel Type: "${raw.specs['Panel Type']}"`);
    if (raw.specs['Refresh Rate']  && !VALID_REFRESH_RATES.has(raw.specs['Refresh Rate']))
      warns.push(`Unknown Refresh Rate: "${raw.specs['Refresh Rate']}"`);
    if (raw.specs['Response Time'] && !VALID_RESPONSE_TIMES.has(raw.specs['Response Time']))
      warns.push(`Unknown Response Time: "${raw.specs['Response Time']}"`);
    if (raw.specs['Aspect Ratio']  && !VALID_ASPECT_RATIOS.has(raw.specs['Aspect Ratio']))
      warns.push(`Unknown Aspect Ratio: "${raw.specs['Aspect Ratio']}"`);
    if (raw.specs['Adaptive Sync'] && !VALID_ADAPTIVE_SYNCS.has(raw.specs['Adaptive Sync']))
      warns.push(`Unknown Adaptive Sync: "${raw.specs['Adaptive Sync']}"`);
    if (raw.specs['Usage']         && !VALID_USAGES.has(raw.specs['Usage']))
      warns.push(`Unknown Usage: "${raw.specs['Usage']}"`);
  }

  return { errors, warns };
}

function normalize(raw, categoryId) {
  const { errors, warns } = validate(raw);
  if (errors.length > 0) return { valid: false, errors, warns, product: null };

  const usage     = deriveUsage(raw.description || '', raw.tags || [], raw.specs?.['Usage'] || raw.usage || null);
  const salesCount = raw.salesCount || 0;
  const ratings   = (typeof raw.ratingAverage === 'number' && typeof raw.ratingCount === 'number')
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
