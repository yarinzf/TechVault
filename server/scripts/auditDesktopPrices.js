'use strict';
/**
 * auditDesktopPrices.js — Validate that desktop PC prices are realistic ILS values
 * Usage: node server/scripts/auditDesktopPrices.js
 *        or:  npm run audit:desktop-prices
 */
const fs   = require('fs');
const path = require('path');

const PC_DIR = path.join(__dirname, '../data/desktops');

function loadAll(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(file => {
    const fp = path.join(dir, file);
    delete require.cache[require.resolve(fp)];
    return require(fp).map(p => ({ ...p, _file: file }));
  });
}

const desktops = loadAll(PC_DIR);

// ─────────────────────────────────────────────────────────────────────────────
// Tier classification
// ─────────────────────────────────────────────────────────────────────────────
function getDesktopTier(pc) {
  const brand      = (pc.brand || '').toLowerCase();
  const name       = (pc.name  || '').toLowerCase();
  const usage      = (pc.specs?.['Usage'] || '').toLowerCase();
  const gpuModel   = (pc.specs?.['GPU Model'] || '').toLowerCase();
  const gfxCat     = (pc.specs?.['Graphics']  || '').toLowerCase();
  const formFactor = (pc.specs?.['Form Factor'] || '').toLowerCase();
  const ram        = (pc.specs?.['RAM'] || '');
  const ramNum     = parseInt(ram, 10) || 0;

  // Use specific GPU model for tier logic; fall back to Graphics category only if no model given
  const gfxForTier = gpuModel || gfxCat;

  // Professional/workstation GPUs (RTX A-series, Quadro) — skip gaming tier checks
  const isProGpu = /rtx\s*a\d+|quadro/.test(gpuModel);

  // Workstation / high-end creator desktops
  if (usage === 'workstation' || name.includes('workstation') || name.includes('precision') || name.includes('proart station'))
    return 'workstation';

  // Gaming desktops with RTX 4080/4090
  if (!isProGpu && (gfxForTier.includes('rtx 4090') || gfxForTier.includes('rtx 4080')))
    return 'gaming_flagship';

  // Gaming desktops with RTX 4070
  if (!isProGpu && gfxForTier.includes('rtx 4070'))
    return 'gaming_high';

  // Gaming desktops with RTX 4060 / RTX 3000-series / Radeon RX 6000/7000
  if (!isProGpu && (gfxForTier.includes('rtx') || gfxForTier.includes('radeon rx 7') || gfxForTier.includes('radeon rx 6')))
    return 'gaming_mid';

  // Mini PC — check before business so compact desktops use a lower floor
  if (formFactor.includes('mini pc'))
    return 'mini_pc';

  // Business Pro desktops (EliteDesk, OptiPlex, ThinkCentre, ExpertCenter)
  if (usage === 'business' ||
      name.includes('elitedesk') || name.includes('optiplex') ||
      name.includes('thinkcentre') || name.includes('expertcenter') ||
      name.includes('vostro'))
    return 'business';

  // All-in-One
  if (formFactor.includes('all-in-one'))
    return 'aio';

  // High-RAM office/home desktops (32GB+)
  if (ramNum >= 32 && gfxCat === 'integrated')
    return 'office_high';

  // Basic office / home
  return 'office';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier minimums (ILS)
// ─────────────────────────────────────────────────────────────────────────────
const TIER_MINIMUMS = {
  workstation:     14000,  // Precision, ProArt, high-end creator
  gaming_flagship: 18000,  // RTX 4090 / 4080
  gaming_high:     10000,  // RTX 4070
  gaming_mid:       5500,  // RTX 4060 / Radeon RX 7000
  business:         2500,  // EliteDesk, OptiPlex, ThinkCentre
  aio:              3000,  // All-in-Ones
  mini_pc:          1500,  // Mini PCs
  office_high:      3500,  // 32GB+ integrated
  office:           1200,  // Basic home/office
};

// Brand-specific floor prices
const BRAND_MINIMUMS = {
  dell:   1200,
  hp:     1200,
  lenovo: 1200,
  asus:   1200,
  msi:    3000,  // MSI only sells gaming/creator, no basic office
};

// ─────────────────────────────────────────────────────────────────────────────
// Audit logic
// ─────────────────────────────────────────────────────────────────────────────
const errors = [];
const warns  = [];

for (const pc of desktops) {
  const price  = pc.price;
  const brand  = (pc.brand || '').toLowerCase();
  const tier   = getDesktopTier(pc);
  const minPrice = TIER_MINIMUMS[tier] || 1200;

  if (typeof price !== 'number' || price <= 0) {
    errors.push({ sku: pc.sku, name: pc.name, file: pc._file,
      msg: `Invalid price: ${price}` });
    continue;
  }

  if (price < minPrice) {
    errors.push({ sku: pc.sku, name: pc.name, file: pc._file,
      msg: `[${tier}] PC ₪${price.toLocaleString()} is below tier minimum ₪${minPrice.toLocaleString()}` });
  }

  const brandMin = BRAND_MINIMUMS[brand];
  if (brandMin && price < brandMin) {
    errors.push({ sku: pc.sku, name: pc.name, file: pc._file,
      msg: `[${brand}] PC ₪${price.toLocaleString()} is below brand minimum ₪${brandMin.toLocaleString()}` });
  }

  if (pc.compareAtPrice !== undefined) {
    if (pc.compareAtPrice <= price) {
      errors.push({ sku: pc.sku, name: pc.name, file: pc._file,
        msg: `compareAtPrice (₪${pc.compareAtPrice}) must exceed price (₪${price})` });
    }
    const discount = ((pc.compareAtPrice - price) / pc.compareAtPrice) * 100;
    if (discount > 40) {
      warns.push({ sku: pc.sku, name: pc.name, file: pc._file,
        msg: `Large discount: ${discount.toFixed(0)}% off (₪${pc.compareAtPrice} → ₪${price})` });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('🔍 Auditing desktop PCs...');
console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('📊  DESKTOP PRICE AUDIT RESULTS');
console.log('════════════════════════════════════════════════════════════════');
console.log(`🖥️   Desktops audited    : ${desktops.length}`);
console.log(`❌  Errors              : ${errors.length}`);
console.log(`⚠️   Warnings            : ${warns.length}`);

if (errors.length > 0) {
  console.log('');
  console.log('❌  ERRORS (must fix):');
  console.log('─'.repeat(80));
  for (const e of errors) {
    console.log(`  [${e.sku}] ${e.name}`);
    console.log(`           Price: ₪${(desktops.find(p => p.sku === e.sku)?.price || 0).toLocaleString()}  |  ${e.file}`);
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
  console.log('✅  All desktop prices look realistic!');
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
