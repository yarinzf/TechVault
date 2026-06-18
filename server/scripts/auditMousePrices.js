'use strict';
/**
 * auditMousePrices.js — Validate that mouse prices are realistic ILS values
 * Usage: node server/scripts/auditMousePrices.js
 *        or:  npm run audit:mice-prices
 */
const fs   = require('fs');
const path = require('path');

const MS_DIR = path.join(__dirname, '../data/mice');

function loadAll(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(file => {
    const fp = path.join(dir, file);
    delete require.cache[require.resolve(fp)];
    return require(fp).map(p => ({ ...p, _file: file }));
  });
}

const mice = loadAll(MS_DIR);

// ─────────────────────────────────────────────────────────────────────────────
// Tier classification
// ─────────────────────────────────────────────────────────────────────────────
function getMouseTier(ms) {
  const brand     = (ms.brand || '').toLowerCase();
  const conn      = (ms.specs?.Connection || '').toLowerCase();
  const name      = (ms.name  || '').toLowerCase();
  const mouseType = (ms.specs?.['Mouse Type'] || '').toLowerCase();

  const isWireless  = conn.includes('wireless') || conn.includes('bluetooth') || conn.includes('multi-mode');
  const isOfficeType = mouseType === 'office' || mouseType === 'productivity' || mouseType === 'travel';

  if (brand === 'apple') return 'apple';

  // Office/productivity/travel wireless gets a lower minimum than gaming wireless.
  // Covers budget office mice (Logitech M-series, MS Arc, etc.) priced ₪75-200.
  if (isWireless && isOfficeType) return 'office_wireless';

  // Flagship gaming wireless — very specific model keywords to avoid false positives
  const flagshipKeywords = [
    'superlight 2',       // G Pro X Superlight 2 (not Gen 1)
    'viper v3 pro', 'viper v2 pro', 'viper ultimate',
    'deathadder v3 pro',
    'aerox 9 wireless',   // SteelSeries
    'prime wireless',     // SteelSeries Prime Wireless
    'kone pro air',       // Roccat
    'dark core pro',      // Corsair
    'ironclaw rgb wireless',
    'endgame gear xlite v2 wireless', 'endgame gear xlite v3 wireless',  // Endgame Gear
    'model o 2 wireless',                       // Glorious
    'basilisk v3 pro',
    'naga v2 pro',
    'cobra pro',
  ];
  if (isWireless && flagshipKeywords.some(kw => name.includes(kw))) return 'flagship_wireless';

  // Standard gaming wireless (any recognized gaming brand)
  const gamingBrands = [
    'logitech', 'razer', 'steelseries', 'corsair', 'asus', 'hyperx', 'msi',
    'roccat', 'glorious', 'zowie', 'endgame-gear', 'xtrfy', 'coolermaster',
    'fnatic', 'redragon', 'alienware',
  ];
  if (isWireless && gamingBrands.includes(brand)) return 'wireless';

  // Any other wireless (office brands going wireless)
  if (isWireless) return 'wireless';

  // Wired gaming brands
  if (gamingBrands.includes(brand)) return 'wired_gaming';

  // Pure office/productivity brands
  if (['microsoft', 'lenovo', 'hp', 'dell', 'kensington', 'cherry'].includes(brand)) return 'office';

  // Budget brands
  if (['a4tech', 'rapoo', 'trust', 'genius', 'anker', 'xiaomi'].includes(brand)) return 'budget';

  return 'budget';
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit rules
// ─────────────────────────────────────────────────────────────────────────────
const errors   = [];
const warnings = [];

function err(msg, product) {
  errors.push({ msg, sku: product.sku, name: product.name, price: product.price, file: product._file });
}
function warn(msg, product) {
  warnings.push({ msg, sku: product.sku, name: product.name, price: product.price, file: product._file });
}

console.log('🔍 Auditing mice...');
for (const ms of mice) {
  const p    = ms.price;
  const tier = getMouseTier(ms);

  // Rule: no mouse under ₪25
  if (p < 25) {
    err(`Mouse price ₪${p} is below minimum ₪25`, ms);
  }

  // Tier minimum prices
  const tierMin = {
    apple:             400,   // Apple Magic Mouse etc.
    flagship_wireless: 700,   // G Pro X Superlight 2, Viper V3 Pro, etc.
    wireless:          150,   // Standard gaming wireless
    office_wireless:    75,   // Budget office wireless (M185, Pebble, etc.)
    wired_gaming:       80,   // Any wired gaming mouse
    office:             45,   // Budget office mice (Dell, HP, Kensington)
    budget:             30,   // A4Tech, Redragon, Rapoo
  };

  const min = tierMin[tier] || 30;
  if (p < min) {
    err(`[${tier}] Mouse ₪${p} is below tier minimum ₪${min}`, ms);
  }

  // Rule: Apple mice must be ≥ ₪400
  if ((ms.brand || '').toLowerCase() === 'apple' && p < 400) {
    err(`Apple mouse ₪${p} is below expected minimum ₪400`, ms);
  }

  // Rule: known flagship wireless mice must be ≥ ₪700
  if (tier === 'flagship_wireless' && p < 700) {
    err(`Flagship wireless mouse ₪${p} — expected ≥ ₪700`, ms);
  }

  // Rule: compareAtPrice must be > price
  if (ms.compareAtPrice != null && ms.compareAtPrice <= p) {
    err(`compareAtPrice (₪${ms.compareAtPrice}) ≤ price (₪${p})`, ms);
  }

  // Rule: discount % must be realistic (≤ 30%)
  if (ms.compareAtPrice != null) {
    const discPct = ((ms.compareAtPrice - p) / ms.compareAtPrice) * 100;
    if (discPct > 30) {
      warn(`Discount ${discPct.toFixed(1)}% exceeds 30% — may look fake`, ms);
    }
    if (discPct < 3) {
      warn(`Discount ${discPct.toFixed(1)}% is tiny (< 3%) — compareAtPrice may be redundant`, ms);
    }
  }

  // Brand-specific sanity checks
  const name  = (ms.name || '').toLowerCase();
  const brand = (ms.brand || '').toLowerCase();

  if (brand === 'logitech') {
    if ((name.includes('mx master') || name.includes('mx ergo')) && p < 600) {
      warn(`Logitech MX flagship ₪${p} looks low — expected ≥ ₪600`, ms);
    }
    if ((name.includes('superlight 2') || name.includes('g pro x superlight 2')) && p < 750) {
      warn(`Logitech G Pro X Superlight 2 ₪${p} looks low — expected ≥ ₪750`, ms);
    }
  }
  if (brand === 'razer') {
    if ((name.includes('viper v3 pro') || name.includes('deathadder v3 pro')) && p < 800) {
      warn(`Razer flagship ₪${p} looks low — expected ≥ ₪800`, ms);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Print results
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════');
console.log('📊  MOUSE PRICE AUDIT RESULTS');
console.log('════════════════════════════════════════════════════════════════');
console.log(`🖱️   Mice audited      : ${mice.length}`);
console.log(`❌  Errors            : ${errors.length}`);
console.log(`⚠️   Warnings          : ${warnings.length}`);

if (errors.length > 0) {
  console.log('\n❌  ERRORS (must fix):');
  console.log('─'.repeat(80));
  errors.forEach(e => {
    console.log(`  [${e.sku}] ${e.name}`);
    console.log(`           Price: ₪${e.price}  |  ${e.file}`);
    console.log(`           ↳ ${e.msg}`);
  });
}

if (warnings.length > 0) {
  console.log('\n⚠️   WARNINGS (review):');
  console.log('─'.repeat(80));
  warnings.forEach(w => {
    console.log(`  [${w.sku}] ${w.name}`);
    console.log(`           Price: ₪${w.price}  |  ${w.file}`);
    console.log(`           ↳ ${w.msg}`);
  });
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅  All mouse prices look realistic!');
}

console.log('\n════════════════════════════════════════════════════════════════');

if (errors.length > 0) {
  process.exit(1);
}
