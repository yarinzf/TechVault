'use strict';

const {
  VALID_CPU_BRANDS,
  VALID_FORM_FACTORS,
  VALID_GRAPHICS,
  VALID_OS,
  VALID_STORAGE_TYPES,
  VALID_USAGES,
  VALID_RAM,
  VALID_WIFI,
} = require('./desktopFilterConfig');

const REQUIRED_TOP_LEVEL = ['sku', 'name', 'brand', 'price', 'description', 'specs', 'images'];
const REQUIRED_SPECS = [
  'Processor', 'CPU Brand', 'RAM', 'Storage', 'Storage Type',
  'Graphics', 'Operating System', 'Form Factor',
  'Usage', 'WiFi', 'Bluetooth', 'Color', 'Warranty',
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
  if (explicitUsage && VALID_USAGES.has(explicitUsage)) return explicitUsage;
  const tagSet = new Set((tags || []).map(t => t.toLowerCase()));
  const text   = (description || '').toLowerCase();
  if (tagSet.has('workstation') || text.includes('workstation') || text.includes('תחנת עבודה'))
    return 'Workstation';
  if (tagSet.has('gaming') || text.includes('gaming') || text.includes('גיימינג'))
    return 'Gaming';
  if (tagSet.has('creator') || text.includes('creator') || text.includes('קריאייטיב'))
    return 'Creator';
  if (tagSet.has('education') || text.includes('education') || text.includes('חינוך'))
    return 'Education';
  if (tagSet.has('business') || text.includes('business') || text.includes('עסקי') || text.includes('ביזנס'))
    return 'Business';
  if (tagSet.has('home') || text.includes('home') || text.includes('ביתי'))
    return 'Home';
  return 'Office';
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

  const cpuBrand = (specs['CPU Brand'] || '').toLowerCase();
  if (cpuBrand === 'intel') set.add('intel');
  if (cpuBrand === 'amd')   set.add('amd');

  const ff = (specs['Form Factor'] || '').toLowerCase();
  if (ff.includes('mini pc'))            set.add('mini-pc');
  if (ff.includes('all-in-one'))         set.add('all-in-one');
  if (ff.includes('small form factor'))  set.add('sff');
  if (ff.includes('tower'))              set.add('tower');

  const gfx = (specs['Graphics'] || '').toLowerCase();
  if (gfx.includes('rtx'))        set.add('rtx');
  if (gfx.includes('gtx'))        set.add('gtx');
  if (gfx.includes('radeon'))     set.add('radeon');
  if (gfx.includes('integrated')) set.add('integrated-graphics');

  const wifi = (specs['WiFi'] || '').toLowerCase();
  if (wifi !== 'no wifi' && wifi !== '') set.add('wifi');

  const os = (specs['Operating System'] || '').toLowerCase();
  if (os.includes('pro')) set.add('windows-pro');

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
    if (raw.specs['CPU Brand']       && !VALID_CPU_BRANDS.has(raw.specs['CPU Brand']))
      warns.push(`Unknown CPU Brand: "${raw.specs['CPU Brand']}"`);
    if (raw.specs['Form Factor']     && !VALID_FORM_FACTORS.has(raw.specs['Form Factor']))
      warns.push(`Unknown Form Factor: "${raw.specs['Form Factor']}"`);
    if (raw.specs['Graphics']        && !VALID_GRAPHICS.has(raw.specs['Graphics']))
      warns.push(`Unknown Graphics: "${raw.specs['Graphics']}"`);
    if (raw.specs['Operating System'] && !VALID_OS.has(raw.specs['Operating System']))
      warns.push(`Unknown OS: "${raw.specs['Operating System']}"`);
    if (raw.specs['Storage Type']    && !VALID_STORAGE_TYPES.has(raw.specs['Storage Type']))
      warns.push(`Unknown Storage Type: "${raw.specs['Storage Type']}"`);
    if (raw.specs['Usage']           && !VALID_USAGES.has(raw.specs['Usage']))
      warns.push(`Unknown Usage: "${raw.specs['Usage']}"`);
    if (raw.specs['WiFi']            && !VALID_WIFI.has(raw.specs['WiFi']))
      warns.push(`Unknown WiFi: "${raw.specs['WiFi']}"`);
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
