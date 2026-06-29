// Deterministic comparison helpers — no AI, pure data-driven

// Parse a numeric value from a spec string like "240Hz" → 240, "0.03ms" → 0.03
function parseNumeric(val) {
  if (val == null) return null;
  const s = String(val).trim();
  const match = s.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

// Direction: higher is better or lower is better
const HIGHER_IS_BETTER = new Set([
  'Refresh Rate', 'Resolution', 'Screen Size', 'Driver Size',
  'RAM', 'Storage', 'Battery', 'DPI', 'Brightness',
]);

const LOWER_IS_BETTER = new Set([
  'Response Time', 'Weight',
]);

// Price is always lower-is-better (handled separately)

// Compare a single spec across products
// Returns: array of { productId, value, rawValue, isBest }
export function compareSpec(key, products) {
  const entries = products.map(p => {
    const raw = p.specs instanceof Map ? p.specs.get(key) : p.specs?.[key];
    return { productId: p._id, rawValue: raw ?? null, numValue: parseNumeric(raw) };
  });

  const hasNumeric = entries.some(e => e.numValue !== null);
  if (!hasNumeric) {
    return entries.map(e => ({ ...e, isBest: false }));
  }

  const numericEntries = entries.filter(e => e.numValue !== null);
  let bestVal;

  if (LOWER_IS_BETTER.has(key)) {
    bestVal = Math.min(...numericEntries.map(e => e.numValue));
  } else {
    // Default: higher is better for numeric specs
    bestVal = Math.max(...numericEntries.map(e => e.numValue));
  }

  return entries.map(e => ({
    ...e,
    isBest: e.numValue !== null && e.numValue === bestVal && numericEntries.length > 1,
  }));
}

// Compare prices across products (lower is better)
export function comparePrices(products) {
  const prices = products.map(p => p.discountedPrice ?? p.price ?? Infinity);
  const minPrice = Math.min(...prices);
  return products.map((p, i) => ({
    productId: p._id,
    price: prices[i],
    isBest: prices[i] === minPrice && prices.filter(x => x === minPrice).length < prices.length,
  }));
}

// Gather all unique spec keys from products, grouped by priority
export function gatherSpecKeys(products) {
  const keySet = new Set();
  for (const p of products) {
    if (!p.specs) continue;
    const entries = p.specs instanceof Map ? [...p.specs.keys()] : Object.keys(p.specs);
    for (const k of entries) keySet.add(k);
  }
  return [...keySet];
}

// Determine rule-based badges
export function determineBadges(products) {
  if (products.length < 2) return {};
  const badges = {};

  // Best Value: lowest price
  const priceComparison = comparePrices(products);
  const bestValue = priceComparison.find(p => p.isBest);
  if (bestValue) badges[bestValue.productId] = 'תמורה מצוינת';

  // Best for Gaming: highest refresh rate
  const hzEntries = products.map(p => {
    const hz = parseNumeric(p.specs instanceof Map ? p.specs.get('Refresh Rate') : p.specs?.['Refresh Rate']);
    return { id: p._id, hz: hz ?? 0 };
  }).filter(e => e.hz > 0);

  if (hzEntries.length > 1) {
    const maxHz = Math.max(...hzEntries.map(e => e.hz));
    const best = hzEntries.find(e => e.hz === maxHz);
    if (best && !badges[best.id]) badges[best.id] = 'מומלץ לגיימינג';
  }

  // Best Overall: highest rating
  const ratingEntries = products.map(p => ({
    id: p._id,
    score: (p.ratings?.average ?? 0) * (p.ratings?.count ?? 0),
  })).filter(e => e.score > 0);

  if (ratingEntries.length > 1) {
    const maxScore = Math.max(...ratingEntries.map(e => e.score));
    const best = ratingEntries.find(e => e.score === maxScore);
    if (best && !badges[best.id]) badges[best.id] = 'הכי מומלץ';
  }

  return badges;
}
