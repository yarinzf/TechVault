// Dynamic, category-driven grouping for the flat `product.specs` Map the API
// returns (see server/models/Product.js — specs is a free-form Map<String,String>,
// there is no per-category schema). This is a display-only compatibility layer:
// it never touches the stored data, only decides how to group/label it for
// rendering. Any key not claimed by a category's group list still renders,
// bucketed into a trailing "additional specs" group — so nothing is ever
// silently dropped, and categories with no config below still work via the
// keyword-based fallback grouper.

const CORE = { titleKey: 'specgroup.core', keys: ['Keyboard Type', 'Layout', 'Switch Type', 'Connection', 'Language'] };

const GROUPS_BY_CATEGORY = {
  monitors: [
    { titleKey: 'specgroup.display',     keys: ['Screen Size', 'Resolution', 'Panel Type', 'HDR', 'Curved', 'Ultrawide'], secondaryKeys: ['Curved', 'Ultrawide'] },
    { titleKey: 'specgroup.performance', keys: ['Refresh Rate', 'Response Time', 'Adaptive Sync'] },
    { titleKey: 'specgroup.connectivity',keys: ['Ports', 'Speakers'], secondaryKeys: ['Speakers'] },
    { titleKey: 'specgroup.ergonomics',  keys: ['Height Adjustable', 'VESA Mount', 'Color'], secondaryKeys: ['Color'] },
    { titleKey: 'specgroup.general',     keys: ['Usage', 'Warranty'] },
  ],
  keyboards: [
    CORE,
    { titleKey: 'specgroup.lighting', keys: ['Backlight', 'RGB'] },
    { titleKey: 'specgroup.features', keys: ['Hot Swap', 'Wireless', 'Bluetooth', 'Numpad', 'USB Polling Rate'], secondaryKeys: ['USB Polling Rate'] },
    { titleKey: 'specgroup.design',   keys: ['Color', 'Size %', 'Usage', 'Release Year'], secondaryKeys: ['Release Year'] },
  ],
  mice: [
    { titleKey: 'specgroup.performance',  keys: ['Sensor', 'DPI', 'Polling Rate'] },
    { titleKey: 'specgroup.connectivity', keys: ['Connection', 'Battery Life'] },
    { titleKey: 'specgroup.design',       keys: ['Buttons', 'Weight', 'RGB', 'Color'], secondaryKeys: ['RGB', 'Color'] },
    { titleKey: 'specgroup.general',      keys: ['Usage', 'Warranty'] },
  ],
  headphones: [
    { titleKey: 'specgroup.audio',        keys: ['Driver Size', 'Frequency Response', 'Noise Cancellation'] },
    { titleKey: 'specgroup.connectivity', keys: ['Connection', 'Bluetooth Version', 'Charging Type'] },
    { titleKey: 'specgroup.design',       keys: ['Headphone Type', 'Color', 'Water Resistance'], secondaryKeys: ['Water Resistance'] },
    { titleKey: 'specgroup.general',      keys: ['Usage', 'Microphone', 'Battery Life', 'Warranty'] },
  ],
  desktops: [
    { titleKey: 'specgroup.performance',  keys: ['Processor', 'CPU Brand', 'RAM', 'Graphics', 'GPU Model'] },
    { titleKey: 'specgroup.storage',      keys: ['Storage', 'Storage Type'] },
    { titleKey: 'specgroup.connectivity', keys: ['WiFi', 'Bluetooth'] },
    { titleKey: 'specgroup.general',      keys: ['Operating System', 'Form Factor', 'Usage', 'Color', 'Warranty'], secondaryKeys: ['Color'] },
  ],
  laptops: [
    { titleKey: 'specgroup.processor',      keys: ['Processor', 'CPU Brand'] },
    { titleKey: 'specgroup.memory_storage', keys: ['RAM', 'Storage', 'Storage Type'] },
    { titleKey: 'specgroup.graphics',       keys: ['Graphics', 'GPU Model'] },
    { titleKey: 'specgroup.display',        keys: ['Screen Size', 'Resolution', 'Refresh Rate', 'Panel Type'] },
    { titleKey: 'specgroup.battery',        keys: ['Battery Life', 'Charging Type'] },
    { titleKey: 'specgroup.connectivity',   keys: ['WiFi', 'Bluetooth', 'Ports'] },
    { titleKey: 'specgroup.design',         keys: ['Weight', 'Dimensions', 'Color', 'Warranty'], secondaryKeys: ['Color'] },
  ],
  tvs: [
    { titleKey: 'specgroup.display',         keys: ['Screen Size', 'Resolution', 'Panel Type', 'HDR', 'Refresh Rate'] },
    { titleKey: 'specgroup.picture_quality',  keys: ['Contrast Ratio', 'Brightness', 'Color Gamut'] },
    { titleKey: 'specgroup.smart_platform',   keys: ['Operating System', 'Voice Assistant'] },
    { titleKey: 'specgroup.audio',            keys: ['Speakers', 'Sound Output'] },
    { titleKey: 'specgroup.connectivity',     keys: ['HDMI', 'USB', 'WiFi', 'Bluetooth'] },
    { titleKey: 'specgroup.smart_features',   keys: ['Screen Mirroring', 'App Store'], secondaryKeys: ['App Store'] },
    { titleKey: 'specgroup.design',           keys: ['Dimensions', 'Weight', 'VESA Mount', 'Warranty'], secondaryKeys: ['VESA Mount'] },
  ],
};

// Keyword → group title-key, used for any category without an explicit
// config above (current or future). Matched against a lowercased spec key.
const KEYWORD_GROUPS = [
  { titleKey: 'specgroup.display',      test: /screen|resolution|panel|display|hdr|refresh|curved|ultrawide/i },
  { titleKey: 'specgroup.performance',  test: /processor|cpu|ram|memory|graphics|gpu|sensor|dpi|response time|polling/i },
  { titleKey: 'specgroup.storage',      test: /storage/i },
  { titleKey: 'specgroup.connectivity', test: /connect|wifi|wireless|bluetooth|port|hdmi|usb|cable/i },
  { titleKey: 'specgroup.battery',      test: /battery|charging/i },
  { titleKey: 'specgroup.design',       keys: [], test: /color|weight|dimension|material|size|form factor/i },
];

const isSkippable = (value) => value == null || String(value).trim() === '' || String(value).trim() === 'false';
const displayValue = (value) => (String(value).trim() === 'true' ? '✓' : value);

function toEntries(specs) {
  if (!specs) return [];
  const raw = specs instanceof Map ? Object.fromEntries(specs) : specs;
  return Object.entries(raw).filter(([, v]) => !isSkippable(v));
}

/**
 * @param {Record<string,string>|Map<string,string>} specs
 * @param {string|undefined} categorySlug
 * @returns {Array<{ titleKey: string, items: Array<{ key: string, value: string, secondary: boolean }> }>}
 */
export function groupProductSpecs(specs, categorySlug) {
  const entries = toEntries(specs);
  if (!entries.length) return [];

  const config = GROUPS_BY_CATEGORY[categorySlug];

  if (config) {
    const claimed = new Set();
    const groups = config
      .map(({ titleKey, keys, secondaryKeys = [] }) => {
        const items = keys
          .map((key) => entries.find(([k]) => k === key))
          .filter(Boolean)
          .map(([key, value]) => {
            claimed.add(key);
            return { key, value: displayValue(value), secondary: secondaryKeys.includes(key) };
          });
        return { titleKey, items };
      })
      .filter((g) => g.items.length > 0);

    const leftover = entries.filter(([key]) => !claimed.has(key));
    if (leftover.length) {
      groups.push({
        titleKey: 'specgroup.additional',
        items: leftover.map(([key, value]) => ({ key, value: displayValue(value), secondary: false })),
      });
    }
    return groups;
  }

  // No config for this category — bucket by keyword, fall back to a single
  // "General" group for anything unmatched so no category is ever unsupported.
  const buckets = new Map();
  for (const [key, value] of entries) {
    const match = KEYWORD_GROUPS.find((g) => g.test.test(key));
    const titleKey = match?.titleKey ?? 'specgroup.general';
    if (!buckets.has(titleKey)) buckets.set(titleKey, []);
    buckets.get(titleKey).push({ key, value: displayValue(value), secondary: false });
  }
  // Keep display-oriented groups first for a stable, sensible reading order.
  const order = ['specgroup.display', 'specgroup.performance', 'specgroup.storage', 'specgroup.connectivity', 'specgroup.battery', 'specgroup.design', 'specgroup.general'];
  return order
    .filter((titleKey) => buckets.has(titleKey))
    .map((titleKey) => ({ titleKey, items: buckets.get(titleKey) }));
}
