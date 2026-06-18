'use strict';
/**
 * auditHeadphonePrices.js — Validate that headphone prices are realistic ILS values
 * Usage: node server/scripts/auditHeadphonePrices.js
 *        or:  npm run audit:headphone-prices
 */
const fs   = require('fs');
const path = require('path');

const HPH_DIR = path.join(__dirname, '../data/headphones');

function loadAll(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(file => {
    const fp = path.join(dir, file);
    delete require.cache[require.resolve(fp)];
    return require(fp).map(p => ({ ...p, _file: file }));
  });
}

const headphones = loadAll(HPH_DIR);

// ─────────────────────────────────────────────────────────────────────────────
// Tier classification
// ─────────────────────────────────────────────────────────────────────────────
function getHeadphoneTier(hp) {
  const name       = (hp.name  || '').toLowerCase();
  const brand      = (hp.brand || '').toLowerCase();
  const usage      = (hp.specs?.['Usage']               || '').toLowerCase();
  const hpType     = (hp.specs?.['Headphone Type']      || '').toLowerCase();
  const connection = (hp.specs?.['Connection']          || '').toLowerCase();
  const nc         = (hp.specs?.['Noise Cancellation']  || '').toLowerCase();
  const mic        = (hp.specs?.['Microphone']          || '').toLowerCase();

  const isWireless   = connection.includes('bluetooth') || connection.includes('wireless') || connection.includes('true wireless');
  const isTWS        = hpType.includes('true wireless') || connection.includes('true wireless');
  const isGaming     = usage === 'gaming' || hpType.includes('gaming');
  const isStudio     = usage === 'studio';
  const isKids       = usage === 'kids';
  const isSport      = usage === 'sport';
  const hasANC       = nc.includes('anc') || nc.includes('hybrid');
  const isOffice     = usage === 'office' || usage === 'calls';
  const isBoomMic    = mic.includes('boom') || mic.includes('detachable') || mic.includes('retractable');

  // Flagship brands — always premium
  const isPremiumBrand = ['bang & olufsen', 'b&o', 'bose', 'sennheiser'].includes(brand) ||
    name.includes('bang & olufsen') || name.includes('beoplay');

  // Gaming tiers
  if (isGaming) {
    // Flagship gaming: wireless + ANC or specific high-end models
    if (isWireless && (hasANC || name.includes('arctis nova pro') || name.includes('g pro x 2') ||
        name.includes('kraken v3 pro') || name.includes('cloud alpha wireless') ||
        name.includes('void elite') || name.includes('hs80')))
      return 'gaming_flagship';
    // High gaming: wireless gaming headsets
    if (isWireless)
      return 'gaming_high';
    // Mid gaming: wired with boom mic
    if (isBoomMic)
      return 'gaming_mid';
    // Budget gaming: basic wired
    return 'gaming_budget';
  }

  // True Wireless / TWS tiers
  if (isTWS) {
    // Flagship: premium brand with ANC, or known flagship model names
    if ((hasANC && isPremiumBrand) ||
        name.includes('airpods pro') || name.includes('galaxy buds pro') ||
        name.includes('galaxy buds2 pro') || name.includes('wf-1000xm') ||
        name.includes('tour pro 2') || name.includes('tour pro 3') || name.includes('club pro+'))
      return 'tws_flagship';
    // Premium brand without ANC also flagship
    if (isPremiumBrand)
      return 'tws_flagship';
    // Non-premium brand with ANC → high tier (e.g. JBL Tune Buds, Tune 230NC)
    if (hasANC)
      return 'tws_high';
    if (name.includes('airpods') || name.includes('galaxy buds') ||
        name.includes('soundcore liberty') || name.includes('jabra elite'))
      return 'tws_high';
    return 'tws_mid';
  }

  // Studio/professional headphones
  if (isStudio)
    return 'studio';

  // Kids headphones
  if (isKids)
    return 'kids';

  // Sport earphones (in-ear, IPX rating)
  if (isSport)
    return 'sport';

  // Office / call-center headsets
  if (isOffice && !isPremiumBrand)
    return 'office_headset';

  // Flagship music headphones (premium wireless over-ear with ANC)
  if (isWireless && hasANC && (isPremiumBrand ||
      name.includes('wh-1000xm') || name.includes('momentum') ||
      name.includes('qc45') || name.includes('nc700') || name.includes('qc35')))
    return 'music_flagship';

  // High music: wireless over-ear/on-ear WITH ANC (non-flagship brands, e.g. JBL Tune 770NC)
  if (isWireless && hasANC && (hpType.includes('over-ear') || hpType.includes('on-ear')))
    return 'music_high';

  // Mid music: wireless over-ear/on-ear WITHOUT ANC (e.g. JBL Tune 510BT, 720BT)
  if (isWireless && (hpType.includes('over-ear') || hpType.includes('on-ear')))
    return 'music_mid';

  // Basic wired or in-ear
  if (!isWireless && (hpType.includes('in-ear') || hpType.includes('earbuds')))
    return 'wired_basic';

  // Mid music: wireless in-ear or budget bluetooth
  if (isWireless)
    return 'music_mid';

  // Default wired
  return 'music_budget';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier minimums (ILS)
// ─────────────────────────────────────────────────────────────────────────────
const TIER_MINIMUMS = {
  gaming_flagship: 700,   // Wireless ANC gaming: Quantum 800/910, Arctis Nova Pro, G Pro X 2
  gaming_high:     350,   // Wireless gaming headsets: HyperX Cloud II, Arctis 7
  gaming_mid:      120,   // Wired gaming headsets with boom mic
  gaming_budget:   60,    // Basic wired gaming headsets
  tws_flagship:    550,   // AirPods Pro, Galaxy Buds Pro, WF-1000XM5
  tws_high:        200,   // AirPods 3, Galaxy Buds2, Liberty 4
  tws_mid:         80,    // Budget TWS: JBL Tune Flex, Anker A3
  music_flagship:  700,   // WH-1000XM3+, QC35+, Momentum 4, NC700, B&O flagship
  music_high:      280,   // Wireless over-ear/on-ear with ANC (non-flagship): Tune 770NC, Tune 660NC
  music_mid:       100,   // JBL Tune 510BT, Sony WH-CH520
  music_budget:    40,    // JBL Tune 500, basic wired over-ear
  wired_basic:     20,    // Basic wired earphones
  studio:          200,   // ATH-M30x, DT 240 Pro
  office_headset:  130,   // Jabra Evolve2 30, Poly Blackwire
  sport:           60,    // Sport in-ears with IP rating
  kids:            30,    // Kids volume-limited headphones
};

// Brand-specific floor prices (ILS)
const BRAND_MINIMUMS = {
  'bang & olufsen': 1500,
  'bose':           400,
  'apple':          350,
  'beats':          150,
  'jabra':          150,
  'sennheiser':     80,
  'shure':          150,
  'beyerdynamic':   120,
  'audio-technica': 80,
};

// ─────────────────────────────────────────────────────────────────────────────
// Audit logic
// ─────────────────────────────────────────────────────────────────────────────
const errors = [];
const warns  = [];

for (const hp of headphones) {
  const price  = hp.price;
  const brand  = (hp.brand || '').toLowerCase();
  const tier   = getHeadphoneTier(hp);
  const minPrice = TIER_MINIMUMS[tier] || 20;

  if (typeof price !== 'number' || price <= 0) {
    errors.push({ sku: hp.sku, name: hp.name, file: hp._file,
      msg: `Invalid price: ${price}` });
    continue;
  }

  if (price < minPrice) {
    errors.push({ sku: hp.sku, name: hp.name, file: hp._file,
      msg: `[${tier}] ₪${price.toLocaleString()} is below tier minimum ₪${minPrice.toLocaleString()}` });
  }

  const brandMin = BRAND_MINIMUMS[brand];
  if (brandMin && price < brandMin) {
    errors.push({ sku: hp.sku, name: hp.name, file: hp._file,
      msg: `[${brand}] ₪${price.toLocaleString()} is below brand minimum ₪${brandMin.toLocaleString()}` });
  }

  if (hp.compareAtPrice !== undefined) {
    if (hp.compareAtPrice <= price) {
      errors.push({ sku: hp.sku, name: hp.name, file: hp._file,
        msg: `compareAtPrice (₪${hp.compareAtPrice}) must exceed price (₪${price})` });
    }
    const discount = ((hp.compareAtPrice - price) / hp.compareAtPrice) * 100;
    if (discount > 45) {
      warns.push({ sku: hp.sku, name: hp.name, file: hp._file,
        msg: `Large discount: ${discount.toFixed(0)}% off (₪${hp.compareAtPrice} → ₪${price})` });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('🔍 Auditing headphones...');
console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('📊  HEADPHONE PRICE AUDIT RESULTS');
console.log('════════════════════════════════════════════════════════════════');
console.log(`🎧  Headphones audited  : ${headphones.length}`);
console.log(`❌  Errors              : ${errors.length}`);
console.log(`⚠️   Warnings            : ${warns.length}`);

if (errors.length > 0) {
  console.log('');
  console.log('❌  ERRORS (must fix):');
  console.log('─'.repeat(80));
  for (const e of errors) {
    console.log(`  [${e.sku}] ${e.name}`);
    console.log(`           Price: ₪${(headphones.find(p => p.sku === e.sku)?.price || 0).toLocaleString()}  |  ${e.file}`);
    console.log(`           ↳ ${e.msg}`);
  }
}

if (warns.length > 0) {
  console.log('');
  console.log('⚠️   WARNINGS:');
  console.log('─'.repeat(80));
  for (const w of warns) {
    console.log(`  [${w.sku}] ${w.name}`);
    console.log(`           ↳ ${w.msg}`);
  }
}

if (errors.length === 0 && warns.length === 0) {
  console.log('');
  console.log('✅  All headphone prices look realistic!');
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
