'use strict';
/**
 * auditCatalogPrices.js — Validate that keyboard & monitor prices are realistic ILS values
 * Usage: node server/scripts/auditCatalogPrices.js
 *        or:  npm run audit:catalog-prices
 */
const fs   = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '../data/keyboards');
const MN_DIR = path.join(__dirname, '../data/monitors');

// ─────────────────────────────────────────────────────────────────────────────
// Load all products
// ─────────────────────────────────────────────────────────────────────────────
function loadAll(dir) {
  return fs.readdirSync(dir).flatMap(file => {
    // Clear require cache so we get fresh data
    const fp = path.join(dir, file);
    delete require.cache[require.resolve(fp)];
    return require(fp).map(p => ({ ...p, _file: file }));
  });
}

const keyboards = loadAll(KB_DIR);
const monitors  = loadAll(MN_DIR);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: is this a "premium" keyboard (should cost > ₪300)?
// ─────────────────────────────────────────────────────────────────────────────
function isPremiumKeyboard(kb) {
  const name  = (kb.name  || '').toLowerCase();
  const brand = (kb.brand || '').toLowerCase();
  const kbType = (kb.specs?.['Keyboard Type'] || '').toLowerCase();
  const conn   = (kb.specs?.Connection || '').toLowerCase();
  const isMech     = kbType === 'mechanical';
  const isWireless = conn.includes('wireless') || conn.includes('multi-mode');

  // Apple is always premium
  if (brand === 'apple') return true;
  // Wireless mechanical is always premium regardless of brand
  if (isMech && isWireless) return true;
  // Logitech: only MX/G9xx flagships, not G213 membrane or budget G-series
  if (brand === 'logitech' && (name.includes('mx') || name.includes('g915') || name.includes('g815') || name.includes('g pro x tkl'))) return true;
  // Ducky and Keychron: only their mid/upper range (not C1 budget, not K2/K6 entry)
  if (brand === 'ducky' && isMech) return true;
  if (brand === 'keychron' && isMech && !name.match(/\bc1\b|\bk2\b|\bk6\b/)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: monitor tier
// ─────────────────────────────────────────────────────────────────────────────
function getMonitorTier(mn) {
  const panel  = (mn.specs?.['Panel Type'] || '').toUpperCase();
  const res    = (mn.specs?.Resolution || '').toLowerCase();
  const hz     = parseInt(mn.specs?.['Refresh Rate'] || '0');
  const size   = mn.specs?.['Screen Size'] || '';
  const uw     = mn.specs?.Ultrawide === 'true';
  const sizeIn = parseInt(size);
  const sync   = (mn.specs?.['Adaptive Sync'] || '').toLowerCase();
  const gSyncUlt = sync.includes('ultimate');

  if (panel === 'OLED' || panel === 'QD-OLED') return 'oled';
  if (panel === 'MINI LED') return 'miniled';
  if ((res.includes('5k') || res.includes('6k') || res.includes('dual qhd'))) return 'super_premium';
  if (res.includes('4k') && hz >= 144) return 'premium_gaming_4k';
  if (res.includes('4k') && sizeIn >= 32) return 'premium_4k_large';
  if (res.includes('4k')) return 'mid_4k';
  if (uw && sizeIn >= 38) return 'large_uw';
  if (uw) return 'uw';
  if (res.includes('qhd') && hz >= 144) return 'gaming_qhd';
  if (res.includes('qhd')) return 'office_qhd';
  if (sizeIn <= 24) return 'budget_fhd';
  return 'mid_fhd';
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

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD CHECKS
// ─────────────────────────────────────────────────────────────────────────────
console.log('🔍 Auditing keyboards...');
for (const kb of keyboards) {
  const p = kb.price;

  // Rule: no keyboard under ₪40
  if (p < 40) {
    err(`Keyboard price ₪${p} is below minimum ₪40`, kb);
  }

  // Rule: no premium keyboard under ₪300
  if (isPremiumKeyboard(kb) && p < 300) {
    err(`Premium keyboard priced at ₪${p} — must be ≥ ₪300`, kb);
  }

  // Rule: compareAtPrice must be > price
  if (kb.compareAtPrice != null && kb.compareAtPrice <= p) {
    err(`compareAtPrice (₪${kb.compareAtPrice}) ≤ price (₪${p})`, kb);
  }

  // Rule: discount % must be realistic (≤ 30%)
  if (kb.compareAtPrice != null) {
    const discPct = ((kb.compareAtPrice - p) / kb.compareAtPrice) * 100;
    if (discPct > 30) {
      warn(`Discount ${discPct.toFixed(1)}% exceeds 30% — may look fake`, kb);
    }
    if (discPct < 3) {
      warn(`Discount ${discPct.toFixed(1)}% is tiny (< 3%) — compareAtPrice may be redundant`, kb);
    }
  }

  // Rule: Apple keyboards must be ≥ ₪380
  if ((kb.brand || '').toLowerCase() === 'apple' && p < 380) {
    err(`Apple keyboard ₪${p} is below expected minimum ₪380`, kb);
  }

  // Rule: Logitech MX / G9x should be ≥ ₪450
  if ((kb.brand || '').toLowerCase() === 'logitech') {
    const n = (kb.name || '').toLowerCase();
    if ((n.includes('mx') || n.includes('g915') || n.includes('g815') || n.includes('g pro x tkl')) && p < 450) {
      warn(`Logitech premium model ₪${p} looks low — expected ≥ ₪450`, kb);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOR CHECKS
// ─────────────────────────────────────────────────────────────────────────────
console.log('🔍 Auditing monitors...');
for (const mn of monitors) {
  const p    = mn.price;
  const tier = getMonitorTier(mn);

  // Rule: no monitor under ₪300 unless truly budget
  if (p < 300) {
    if (tier !== 'budget_fhd') {
      err(`Monitor priced at ₪${p} — non-budget monitors must be ≥ ₪300`, mn);
    } else {
      warn(`Monitor priced at ₪${p} — below ₪300, verify this is a budget model`, mn);
    }
  }

  // Rule: tier minimum prices
  const tierMin = {
    'oled':              3000,
    'miniled':           2000,
    'super_premium':     4000,
    'premium_gaming_4k': 1500,
    'premium_4k_large':  1500,
    'mid_4k':            1200,
    'large_uw':          3000,
    'uw':                1500,
    'gaming_qhd':         900,
    'office_qhd':         800,
    'mid_fhd':            500,
    'budget_fhd':         300,
  };

  const min = tierMin[tier] || 300;
  if (p < min) {
    err(`[${tier}] Monitor ₪${p} is below tier minimum ₪${min}`, mn);
  }

  // Rule: OLED must be ≥ ₪3000
  const panel = (mn.specs?.['Panel Type'] || '').toUpperCase();
  if ((panel === 'OLED' || panel === 'QD-OLED') && p < 3000) {
    err(`OLED monitor priced at ₪${p} — must be ≥ ₪3000`, mn);
  }

  // Rule: Apple displays must be ≥ ₪6000
  if ((mn.brand || '').toLowerCase() === 'apple' && p < 6000) {
    err(`Apple display ₪${p} is below expected minimum ₪6000`, mn);
  }

  // Rule: compareAtPrice must be > price
  if (mn.compareAtPrice != null && mn.compareAtPrice <= p) {
    err(`compareAtPrice (₪${mn.compareAtPrice}) ≤ price (₪${p})`, mn);
  }

  // Rule: discount % must be realistic
  if (mn.compareAtPrice != null) {
    const discPct = ((mn.compareAtPrice - p) / mn.compareAtPrice) * 100;
    if (discPct > 25) {
      warn(`Discount ${discPct.toFixed(1)}% exceeds 25% — may look fake`, mn);
    }
  }

  // Samsung Neo G9 / Odyssey premium — sanity check
  const name = (mn.name || '').toLowerCase();
  if (name.includes('neo g9') && p < 6000) {
    err(`Samsung Neo G9 ₪${p} — super-ultrawide must be ≥ ₪6000`, mn);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Print results
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════');
console.log('📊  CATALOG PRICE AUDIT RESULTS');
console.log('════════════════════════════════════════════════════════════════');
console.log(`📦  Keyboards audited : ${keyboards.length}`);
console.log(`🖥️   Monitors audited  : ${monitors.length}`);
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
  console.log('\n✅  All prices look realistic!');
}

console.log('\n════════════════════════════════════════════════════════════════');

// Exit with error code if there are errors (useful in CI)
if (errors.length > 0) {
  process.exit(1);
}
