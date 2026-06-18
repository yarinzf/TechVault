'use strict';
/**
 * updatePrices.js — Normalize all keyboard & monitor prices to realistic Israeli ILS values
 *
 * Strategy:
 *   1. Load each data file
 *   2. For each product, determine its tier using specs + brand + name
 *   3. Apply a realistic ILS price based on tier rules
 *   4. Write updated file back (touching ONLY price / compareAtPrice)
 *
 * Usage:  node server/scripts/updatePrices.js
 *         npm run update:prices
 */

const fs   = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '../data/keyboards');
const MN_DIR = path.join(__dirname, '../data/monitors');

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard ILS pricing rules
// Rule order matters — first match wins.
// Each rule: { test(product) => bool, price(product) => number, compareAtPrice?(product) => number|null }
// ─────────────────────────────────────────────────────────────────────────────
const KB_RULES = [
  // Apple — fixed prices
  { test: p => p.brand === 'Apple' && p.name.includes('Numeric Keypad') && p.name.includes('Touch ID'),
    price: () => 579, cap: () => 649 },
  { test: p => p.brand === 'Apple' && p.name.includes('Numeric Keypad'),
    price: () => 479, cap: () => null },
  { test: p => p.brand === 'Apple' && p.name.includes('Touch ID'),
    price: () => 429, cap: () => null },
  { test: p => p.brand === 'Apple',
    price: () => 389, cap: () => null },

  // Logitech MX / G-series premium
  { test: p => p.brand === 'Logitech' && p.name.includes('G Pro X TKL Lightspeed'),
    price: () => 799, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('G915'),
    price: () => 899, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('G815'),
    price: () => 649, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('G Pro X'),
    price: () => 499, cap: () => 549 },
  { test: p => p.brand === 'Logitech' && p.name.includes('G513'),
    price: () => 549, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('G213'),
    price: () => 229, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('MX Keys S'),
    price: () => 549, cap: () => 599 },
  { test: p => p.brand === 'Logitech' && p.name.includes('MX Keys Mini'),
    price: () => 499, cap: () => 549 },
  { test: p => p.brand === 'Logitech' && p.name.includes('MX Mechanical Mini'),
    price: () => 479, cap: () => 529 },
  { test: p => p.brand === 'Logitech' && p.name.includes('K780'),
    price: () => 329, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('K380'),
    price: () => 189, cap: () => null },
  { test: p => p.brand === 'Logitech' && p.name.includes('K120'),
    price: () => 79, cap: () => null },
  // Razer
  { test: p => p.brand === 'Razer' && (p.name.includes('Pro') || p.name.includes('V3') || p.name.includes('Wireless')),
    price: (p) => {
      const n = p.name;
      if (n.includes('BlackWidow V3 Pro')) return 1099;
      if (n.includes('BlackWidow V4 Pro')) return 899;
      if (n.includes('Huntsman V3 Pro')) return 949;
      if (n.includes('Huntsman V2')) return 749;
      if (n.includes('DeathStalker V2 Pro')) return 849;
      if (n.includes('Huntsman TE') || n.includes('Wireless')) return 799;
      if (n.includes('BlackWidow V3 TKL')) return 549;
      return 749;
    }, cap: () => null },
  { test: p => p.brand === 'Razer',
    price: (p) => {
      const n = p.name;
      if (n.includes('BlackWidow V3') || n.includes('BlackWidow V4')) return 449;
      if (n.includes('Huntsman Mini')) return 649;
      if (n.includes('Cynosa V2')) return 399;
      if (n.includes('Cynosa Lite')) return 299;
      if (n.includes('BlackWidow Lite')) return 349;
      if (n.includes('BlackWidow')) return 549;
      return 499;
    }, cap: () => null },
  // Corsair
  { test: p => p.brand === 'Corsair',
    price: (p) => {
      const n = p.name;
      if (n.includes('K100 RGB Optical')) return 849;
      if (n.includes('K100 Air')) return 699;
      if (n.includes('K100')) return 749;
      if (n.includes('K95')) return 649;
      if (n.includes('K70 Max')) return 899;
      if (n.includes('K70 Pro Mini Wireless')) return 799;
      if (n.includes('K70 RGB Pro')) return 599;
      if (n.includes('K70 RGB TKL')) return 549;
      if (n.includes('K70')) return 549;
      if (n.includes('K65 Mini')) return 449;
      if (n.includes('K65 RGB')) return 579;
      if (n.includes('K60 RGB Pro')) return 499;
      if (n.includes('K55')) return 399;
      return 499;
    }, cap: () => null },
  // SteelSeries
  { test: p => p.brand === 'SteelSeries',
    price: (p) => {
      const n = p.name;
      if (n.includes('Apex Pro TKL Wireless')) return 749;
      if (n.includes('Apex Pro TKL 2023') || n.includes('Apex Pro TKL')) return 799;
      if (n.includes('Apex Pro Mini Wireless')) return 849;
      if (n.includes('Apex Pro')) return 649;
      if (n.includes('Apex 7 TKL')) return 599;
      if (n.includes('Apex 9 TKL')) return 449;
      if (n.includes('Apex 7 60%')) return 549;
      if (n.includes('Apex 7')) return 499;
      if (n.includes('Apex 5')) return 399;
      if (n.includes('Apex 3')) return 349;
      return 449;
    }, cap: () => null },
  // ASUS ROG
  { test: p => p.brand === 'ASUS',
    price: (p) => {
      const n = p.name;
      if (n.includes('ROG Azoth')) return 899;
      if (n.includes('ROG Claymore')) return 799;
      if (n.includes('ROG Strix Scope RX TKL')) return 589;
      if (n.includes('ROG Strix Scope RX')) return 649;
      if (n.includes('ROG Strix Scope TKL Deluxe')) return 749;
      if (n.includes('ROG Strix Scope TKL') || n.includes('ROG Strix Scope NX TKL')) return 479;
      if (n.includes('ROG Strix Flare')) return 549;
      if (n.includes('ROG Strix Scope NX')) return 519;
      if (n.includes('ROG Strix Scope')) return 649;
      if (n.includes('TUF Gaming K5')) return 299;
      return 549;
    }, cap: () => null },
  // HyperX
  { test: p => p.brand === 'HyperX',
    price: (p) => {
      const n = p.name;
      if (n.includes('Alloy Origins 60 Wireless')) return 749;
      if (n.includes('Alloy Rise 75')) return 579;
      if (n.includes('Alloy Elite RGB')) return 649;
      if (n.includes('Alloy Origins Core')) return 479;
      if (n.includes('Alloy Origins') && n.includes('TKL')) return 499;
      if (n.includes('Alloy Origins')) return 549;
      if (n.includes('Alloy FPS RGB')) return 399;
      if (n.includes('Alloy Core RGB')) return 299;
      if (n.includes('Haste Mechanical')) return 349;
      return 449;
    }, cap: () => null },
  // Ducky
  { test: p => p.brand === 'Ducky',
    price: (p) => {
      const n = p.name;
      if (n.includes('Shine 7')) return 549;
      if (n.includes('Mecha Pro')) return 519;
      if (n.includes('Mecha Mini')) return 479;
      if (n.includes('One 3 SF') || n.includes('One 3 Full')) return 459;
      if (n.includes('One 3 Mini') && n.includes('RGB')) return 439;
      if (n.includes('One 3 TKL')) return 419;
      if (n.includes('One 3 Mini')) return 379;
      if (n.includes('One 2 TKL')) return 389;
      if (n.includes('One 2 Mini')) return 349;
      return 399;
    }, cap: () => null },
  // Keychron
  { test: p => p.brand === 'Keychron',
    price: (p) => {
      const n = p.name;
      if (n.includes('Q1 Pro') && n.includes('Knob')) return 649;
      if (n.includes('Q8 Pro')) return 549;
      if (n.includes('Q6 Pro')) return 499;
      if (n.includes('Q3 Pro')) return 449;
      if (n.includes('Q1 Pro')) return 399;
      if (n.includes('K8 Pro')) return 299;
      if (n.includes('V1')) return 349;
      return 399;
    }, cap: () => null },
  // Cherry
  { test: p => p.brand === 'Cherry',
    price: (p) => {
      const n = p.name;
      if (n.includes('MX 10.0N RGB')) return 549;
      if (n.includes('MX 8.0')) return 479;
      if (n.includes('MX Board 6.0')) return 439;
      if (n.includes('MX Board 3.0S')) return 369;
      if (n.includes('MX Board 2.0S')) return 299;
      if (n.includes('MX Board 1.0')) return 329;
      if (n.includes('KC 6000')) return 199;
      if (n.includes('KC 1000')) return 169;
      if (n.includes('KC 200')) return 89;
      return 299;
    }, cap: (p) => {
      const n = p.name;
      if (n.includes('MX 10.0N RGB')) return 649;
      if (n.includes('MX 8.0')) return 549;
      if (n.includes('MX Board 6.0')) return 499;
      if (n.includes('MX Board 3.0S')) return 429;
      if (n.includes('KC 6000')) return 239;
      return null;
    }},
  // Cooler Master
  { test: p => p.brand === 'Cooler Master',
    price: (p) => {
      const n = p.name;
      if (n.includes('MK850')) return 549;
      if (n.includes('MK770')) return 449;
      if (n.includes('MK730')) return 479;
      if (n.includes('CK530')) return 399;
      if (n.includes('CK721')) return 369;
      if (n.includes('CK550')) return 389;
      if (n.includes('SK622')) return 329;
      if (n.includes('SK630')) return 329;
      if (n.includes('SK621')) return 299;
      return 399;
    }, cap: (p) => {
      const n = p.name;
      if (n.includes('MK850')) return 649;
      if (n.includes('MK730') || n.includes('CK530')) return 549;
      if (n.includes('CK721') || n.includes('MK770')) return 449;
      if (n.includes('SK622') || n.includes('SK630')) return 399;
      if (n.includes('SK621')) return 359;
      return null;
    }},
  // Akko
  { test: p => p.brand === 'Akko',
    price: (p) => {
      const n = p.name;
      if (n.includes('5108B Plus') || n.includes('MOD 007B')) return 549;
      if (n.includes('5075B Plus')) return 369;
      if (n.includes('3098B')) return 399;
      if (n.includes('MOD 007B')) return 479;
      if (n.includes('3068B Plus')) return 329;
      if (n.includes('3068B')) return 219;
      if (n.includes('3061B')) return 259;
      return 329;
    }, cap: (p) => {
      const n = p.name;
      if (n.includes('5108') || n.includes('MOD 007B')) return 649;
      if (n.includes('5075')) return 449;
      if (n.includes('3098')) return 479;
      if (n.includes('3068B Plus')) return 399;
      if (n.includes('3068B')) return 289;
      if (n.includes('3061B')) return 319;
      return 399;
    }},
  // Glorious
  { test: p => p.brand === 'Glorious',
    price: (p) => {
      const n = p.name;
      if (n.includes('GMMK Pro')) return 399;
      if (n.includes('GMMK 2 Full')) return 299;
      if (n.includes('GMMK 2 65%')) return 269;
      if (n.includes('GMMK 2 TKL') || n.includes('GMMK TKL')) return 319;
      if (n.includes('GMMK Compact')) return 199;
      if (n.includes('GMMK Numpad')) return 479;
      return 349;
    }, cap: () => null },
  // Redragon — budget gaming
  { test: p => p.brand === 'Redragon',
    price: (p) => {
      const n = p.name;
      if (n.includes('K618') || n.includes('K599')) return 249;
      if (n.includes('K582') || n.includes('K585')) return 199;
      if (n.includes('K552')) return 179;
      if (n.includes('K530') || n.includes('K503')) return 149;
      return 179;
    }, cap: () => null },
  // A4Tech — budget
  { test: p => p.brand === 'A4Tech',
    price: (p) => {
      const n = p.name;
      if (n.includes('B820R')) return 259;
      if (n.includes('B930')) return 219;
      if (n.includes('B510')) return 199;
      if (n.includes('FG1035') || n.includes('FG1010')) return 159;
      if (n.includes('FB35') || n.includes('FB30')) return 119;
      if (n.includes('FX51')) return 99;
      if (n.includes('KR-750') || n.includes('KR-85')) return 79;
      return 129;
    }, cap: (p) => {
      const n = p.name;
      if (n.includes('B820R')) return 299;
      if (n.includes('B930')) return 269;
      return null;
    }},
  // Dell — office
  { test: p => p.brand === 'Dell',
    price: (p) => {
      const n = p.name;
      if (n.includes('KB900') && n.includes('variant')) return 499;
      if (n.includes('KB900')) return 399;
      if (n.includes('KM7120W')) return 349;
      if (n.includes('KM5221W')) return 449;
      if (n.includes('KM636')) return 349;
      if (n.includes('KB700')) return 299;
      if (n.includes('KB7120W')) return 279;
      if (n.includes('KB522')) return 189;
      if (n.includes('KB500')) return 299;
      if (n.includes('KB216')) return 249;
      return 299;
    }, cap: () => null },
  // HP — office
  { test: p => p.brand === 'HP',
    price: (p) => {
      const n = p.name;
      if (n.includes('980')) return 329;
      if (n.includes('975')) return 249;
      if (n.includes('950')) return 269;
      if (n.includes('900')) return 199;
      if (n.includes('350')) return 149;
      if (n.includes('230')) return 99;
      if (n.includes('CS700')) return 119;
      if (n.includes('K500F')) return 179;
      if (n.includes('125') || n.includes('HP 125')) return 79;
      return 179;
    }, cap: () => null },
  // Lenovo — office
  { test: p => p.brand === 'Lenovo',
    price: (p) => {
      const n = p.name;
      if (n.includes('Go Wired Split')) return 449;
      if (n.includes('ThinkPad Compact') || n.includes('ThinkPad')) return 349;
      if (n.includes('Go Wireless')) return 279;
      if (n.includes('500')) return 249;
      if (n.includes('300')) return 189;
      if (n.includes('100')) return 129;
      return 199;
    }, cap: () => null },
  // Microsoft — office
  { test: p => p.brand === 'Microsoft',
    price: (p) => {
      const n = p.name;
      if (n.includes('Surface Ergonomic') || n.includes('Ergonomic')) return 649;
      if (n.includes('Surface Pro Signature') || n.includes('Surface Pro X')) return 499;
      if (n.includes('Designer Compact')) return 339;
      if (n.includes('900 Wireless')) return 279;
      if (n.includes('Bluetooth 5000')) return 389;
      if (n.includes('Wireless 850')) return 239;
      if (n.includes('All-in-One')) return 129;
      if (n.includes('Wired 600')) return 169;
      return 249;
    }, cap: () => null },
  // Rapoo — budget office
  { test: p => p.brand === 'Rapoo',
    price: (p) => {
      const n = p.name;
      if (n.includes('V700 RGB')) return 139;
      if (n.includes('V500 Alloy')) return 109;
      if (n.includes('MT700') && n.includes('Mini')) return 89;
      if (n.includes('MT700')) return 149;
      if (n.includes('MT550') && n.includes('Multi')) return 119;
      if (n.includes('MT550')) return 99;
      if (n.includes('MT350W')) return 169;
      if (n.includes('E9700M')) return 129;
      if (n.includes('E1050') || n.includes('E6300')) return 79;
      return 109;
    }, cap: () => null },

  // Fallback — generic ILS conversion by type
  { test: () => true, // catchall
    price: (p) => {
      const kbType = (p.specs?.['Keyboard Type'] || '').toLowerCase();
      const conn   = (p.specs?.Connection || '').toLowerCase();
      const oldP   = p.price;
      // Base: multiply USD-like price × 3.8 and round to nearest 9/49/99
      const raw = Math.round(oldP * 3.8 / 10) * 10;
      if (raw < 80) return 79;
      if (raw < 150) return Math.round(raw / 10) * 10 - 1; // e.g. 149
      return raw;
    }, cap: () => null },
];

// ─────────────────────────────────────────────────────────────────────────────
// Monitor ILS pricing rules
// ─────────────────────────────────────────────────────────────────────────────
function getMonitorILS(p) {
  const name   = p.name || '';
  const brand  = p.brand || '';
  const panel  = (p.specs?.['Panel Type'] || '').toUpperCase();
  const res    = (p.specs?.Resolution || '').toLowerCase();
  const hz     = parseInt(p.specs?.['Refresh Rate'] || '60');
  const size   = parseInt(p.specs?.['Screen Size'] || '27');
  const uw     = p.specs?.Ultrawide === 'true';
  const sync   = (p.specs?.['Adaptive Sync'] || '').toLowerCase();
  const isOled = panel === 'OLED' || panel === 'QD-OLED';
  const isMini = panel === 'MINI LED';

  // ── Special brand/model overrides ──────────────────────────────────────────
  if (brand === 'Apple') {
    if (name.includes('Pro Display XDR')) return { price: 19999 };
    if (name.includes('Studio Display')) return { price: 6499 };
    return { price: 6499 };
  }
  if (brand === 'Alienware') {
    if (name.includes('55"') || name.includes('5520')) return { price: 14999 };
    if (name.includes('3823') || name.includes('3821')) return { price: 3799 };
    if (name.includes('3423DW') && !name.includes('F')) return { price: 2499 };
    if (name.includes('3423DWF') && name.includes('Pro')) return { price: 4199 };
    if (name.includes('3423DWF')) return { price: 2299 };
    if (name.includes('AW3225QF')) return { price: 3399 };
    if (name.includes('AW3225')) return { price: 3699 };
    if (name.includes('AW32') && isOled) return { price: 5199 };
    if (name.includes('AW2725DF') || name.includes('2725DF')) return { price: 1899 };
    if (name.includes('AW2724HF') || name.includes('360Hz')) return { price: 1499 };
    if (name.includes('AW2724') || name.includes('AW27') && hz >= 240) return { price: 2399 };
    if (name.includes('AW2724DWF') || (name.includes('AW27') && hz >= 165)) return { price: 1499 };
    if (name.includes('AW22')) return { price: 899 };
    if (isOled) return { price: 4399 };
    return { price: 2199 };
  }

  // Samsung premium lines
  if (brand === 'Samsung') {
    if (name.includes('Neo G9') && size >= 57) return { price: 7499 };
    if (name.includes('Odyssey OLED G9') && size >= 49) return { price: 5999 };
    if (name.includes('Odyssey OLED G9') && name.includes('2024')) return { price: 4999 };
    if (name.includes('Odyssey OLED G8') && res.includes('4k')) return { price: 3699 };
    if (name.includes('Odyssey OLED G8') && (res.includes('qd') || res.includes('uw'))) return { price: 3299 };
    if (name.includes('Odyssey OLED G7')) return { price: 3699 };
    if (name.includes('Neo G8') && res.includes('4k')) return { price: 2999 };
    if (name.includes('Neo G6')) return { price: 2999 };
    if (name.includes('Odyssey G7') && size >= 32) return { price: 1899 };
    if (name.includes('Odyssey G7') && size < 32) return { price: 1399 };
    if (name.includes('Odyssey G5') && uw) return { price: 1999 };
    if (name.includes('M7') && res.includes('4k')) return { price: 1499 };
    if (name.includes('ViewFinity S9') && res.includes('5k')) return { price: 2299 };
    if (name.includes('ViewFinity S8') && res.includes('4k')) return { price: 2499 };
    if (name.includes('ViewFinity S6') && res.includes('qhd')) return { price: 1199 };
  }

  // LG specific models
  if (brand === 'LG') {
    if (name.includes('UltraFine 5K')) return { price: 5299 };
    if (name.includes('38GL950G') || (size >= 38 && uw && hz >= 144)) return { price: 5499 };
    if (name.includes('45GR95QE') || (size >= 45 && isOled && uw)) return { price: 5499 };
    if (name.includes('49GR85')) return { price: 5999 };
  }

  // ── Tier-based pricing ─────────────────────────────────────────────────────
  // OLED / QD-OLED
  if (isOled) {
    if (size >= 49) return { price: 5999 };
    if (size >= 45) return { price: 4999 };
    if (size >= 42) return { price: 3199 };
    if (uw || size >= 34) return { price: hz >= 240 ? 4499 : 3499 };
    if (res.includes('4k') && hz >= 240) return { price: 5499 };
    if (res.includes('4k')) return { price: 3699 };
    if (hz >= 360) return { price: 3299 };
    if (hz >= 240) return { price: 3299 };
    return { price: 2999 };
  }

  // Mini LED
  if (isMini) {
    if (size >= 40) return { price: 3199 };
    if (res.includes('4k') && hz >= 144) return { price: 2999 };
    if (res.includes('4k')) return { price: 2299 };
    return { price: 1899 };
  }

  // 5K / 6K
  if (res.includes('5k') || res.includes('6k')) return { price: 4999 };

  // Dual QHD / 49"
  if (size >= 49 || res.includes('dual qhd')) return { price: 3499 };

  // 4K monitors
  if (res.includes('4k')) {
    if (size >= 43) return { price: hz >= 120 ? 3199 : 2799 };
    if (size >= 38 && uw) return { price: 2599 };
    if (size >= 32) {
      if (hz >= 144) return { price: sync.includes('ultimate') ? 3299 : 2299 };
      return { price: 1699 };
    }
    if (size >= 27) {
      if (hz >= 144) return { price: sync.includes('ultimate') ? 2199 : 1799 };
      if (hz >= 60) return { price: 1399 };
    }
    return { price: 1399 };
  }

  // UltraWide (non-4K)
  if (uw) {
    if (size >= 49) return { price: 3499 };
    if (size >= 45) return { price: hz >= 240 ? 4999 : 3999 };
    if (size >= 38) return { price: hz >= 144 ? 2599 : 1999 };
    if (size >= 34) {
      if (hz >= 160) return { price: 3199 }; // 34" gaming UW
      if (hz >= 100) return { price: 1899 };
      return { price: 1699 };
    }
    return { price: 1599 };
  }

  // QHD monitors
  if (res.includes('qhd')) {
    if (size >= 32 && hz >= 240) return { price: 2299 };
    if (size >= 32 && hz >= 165) return { price: 1699 };
    if (size >= 32) return { price: 1099 };
    if (hz >= 240) return { price: 2299 };
    if (hz >= 165) return { price: 1399 };
    if (hz >= 144) return { price: 1149 };
    if (hz >= 75) return { price: 999 };
    return { price: 849 };
  }

  // FHD monitors
  if (size >= 32) {
    if (hz >= 240) return { price: 1799 };
    if (hz >= 165) return { price: 1199 };
    return { price: 899 };
  }
  if (size >= 27) {
    if (hz >= 240) return { price: 1199 };
    if (hz >= 165) return { price: 799 };
    if (hz >= 144) return { price: 749 };
    return { price: 649 };
  }
  // 24" and smaller
  if (hz >= 240) return { price: 1099 };
  if (hz >= 165) return { price: 699 };
  if (hz >= 144) return { price: 649 };
  return { price: 499 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: apply rule to keyboard product
// ─────────────────────────────────────────────────────────────────────────────
function getKbILS(p) {
  for (const rule of KB_RULES) {
    if (rule.test(p)) {
      const price = rule.price(p);
      const cap   = rule.cap ? rule.cap(p) : null;
      return { price, compareAtPrice: cap };
    }
  }
  return { price: Math.round(p.price * 3.8 / 10) * 10, compareAtPrice: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// File-level update engine
// ─────────────────────────────────────────────────────────────────────────────
function updateFile(filePath, getILS) {
  let src = fs.readFileSync(filePath, 'utf8');

  // Clear require cache
  delete require.cache[require.resolve(filePath)];
  const products = require(filePath);

  const report = [];
  let modified = false;

  for (const p of products) {
    const { price: newPrice, compareAtPrice: newCap } = getILS(p);

    // Find the price line for this product. We look for the SKU first,
    // then grab the price line within the next 600 chars.
    const skuToken = `'${p.sku}'`;
    const skuIdx = src.indexOf(skuToken);
    if (skuIdx === -1) continue;

    const slice = src.slice(skuIdx, skuIdx + 700);
    // Match:  price: NUMBER  optionally followed by , compareAtPrice: NUMBER
    const priceMatch = slice.match(/price:\s*([\d.]+)(?:,\s*compareAtPrice:\s*([\d.]+))?/);
    if (!priceMatch) continue;

    const oldPrice   = parseFloat(priceMatch[1]);
    const oldCap     = priceMatch[2] ? parseFloat(priceMatch[2]) : null;

    let oldStr, newStr;
    if (priceMatch[2] !== undefined) {
      oldStr = `price: ${priceMatch[1]}, compareAtPrice: ${priceMatch[2]}`;
    } else {
      oldStr = `price: ${priceMatch[1]}`;
    }

    if (newCap !== null) {
      newStr = `price: ${newPrice}, compareAtPrice: ${newCap}`;
    } else {
      newStr = `price: ${newPrice}`;
    }

    if (oldStr === newStr) continue;

    // Replace only the occurrence within this product's block
    const before   = src.slice(0, skuIdx);
    const afterSku = src.slice(skuIdx);
    const newAfter = afterSku.replace(oldStr, newStr);

    if (newAfter !== afterSku) {
      src      = before + newAfter;
      modified = true;
      report.push({ sku: p.sku, name: p.name, oldPrice, oldCap, newPrice, newCap, file: path.basename(filePath) });
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, src, 'utf8');
  }

  return { modified, report };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
const allReport = [];
let kbUpdated = 0, mnUpdated = 0;

console.log('🔄 Updating keyboard prices...');
for (const file of fs.readdirSync(KB_DIR)) {
  const fp = path.join(KB_DIR, file);
  const { modified, report } = updateFile(fp, getKbILS);
  if (modified) {
    console.log(`  ✅ ${file}`);
    kbUpdated += report.length;
    allReport.push(...report.map(r => ({ ...r, category: 'keyboard' })));
  }
}

console.log('\n🔄 Updating monitor prices...');
for (const file of fs.readdirSync(MN_DIR)) {
  const fp = path.join(MN_DIR, file);
  const { modified, report } = updateFile(fp, getMonitorILS);
  if (modified) {
    console.log(`  ✅ ${file}`);
    mnUpdated += report.length;
    allReport.push(...report.map(r => ({ ...r, category: 'monitor' })));
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════');
console.log('📊  PRICE UPDATE REPORT');
console.log('════════════════════════════════════════════════════════════════');
console.log(`⌨️   Keyboards updated : ${kbUpdated}`);
console.log(`🖥️   Monitors updated  : ${mnUpdated}`);
console.log(`📦  Total updated     : ${kbUpdated + mnUpdated}`);

console.log('\n📋  SAMPLE BEFORE → AFTER (first 40):');
console.log('─'.repeat(90));
allReport.slice(0, 40).forEach(r => {
  const oldCap = r.oldCap != null ? ` (was ${r.oldCap})` : '';
  const newCap = r.newCap != null ? ` (sale: ₪${r.newCap})` : '';
  console.log(`  [${r.sku}] ${r.name.substring(0, 40).padEnd(40)}`);
  console.log(`         ₪${r.oldPrice}${oldCap}  →  ₪${r.newPrice}${newCap}`);
});

console.log('\n✅  Done. Now run:');
console.log('    npm run audit:catalog-prices');
console.log('    npm run seed:keyboards:force');
console.log('    npm run seed:monitors:force');
