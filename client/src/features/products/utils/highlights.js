// Picks the handful of most sales-relevant spec entries to feature as the
// product page's top "highlights" strip. Curated per category where we know
// the typical spec vocabulary (mirrors the groups in specGroups.js); any
// category without a curated list still works by featuring its first
// available spec entries, so new/future categories are never unsupported.

const HIGHLIGHT_KEYS_BY_CATEGORY = {
  monitors:   ['Screen Size', 'Resolution', 'Panel Type', 'Refresh Rate', 'Response Time', 'Adaptive Sync'],
  keyboards:  ['Switch Type', 'Layout', 'Connection', 'Backlight', 'Hot Swap', 'Wireless'],
  mice:       ['Sensor', 'DPI', 'Connection', 'Battery Life', 'Weight', 'Polling Rate'],
  headphones: ['Driver Size', 'Noise Cancellation', 'Connection', 'Battery Life', 'Bluetooth Version', 'Water Resistance'],
  desktops:   ['Processor', 'RAM', 'Storage', 'Graphics', 'Operating System', 'Form Factor'],
  laptops:    ['Processor', 'RAM', 'Storage', 'Graphics', 'Screen Size', 'Battery Life'],
  tvs:        ['Screen Size', 'Resolution', 'Panel Type', 'HDR', 'Operating System', 'Speakers'],
};

// Keyword → icon name (resolved to an actual lucide-react component by the
// consuming UI component, kept out of this pure util on purpose).
const ICON_RULES = [
  { test: /screen|resolution|panel|display/i, icon: 'Monitor' },
  { test: /refresh/i,                          icon: 'Zap' },
  { test: /response time/i,                    icon: 'Timer' },
  { test: /adaptive sync|g-sync|freesync|sync/i, icon: 'RefreshCw' },
  { test: /processor|cpu/i,                    icon: 'Cpu' },
  { test: /ram|memory/i,                       icon: 'MemoryStick' },
  { test: /storage/i,                          icon: 'HardDrive' },
  { test: /graphics|gpu/i,                     icon: 'Layers' },
  { test: /battery|charging/i,                 icon: 'BatteryFull' },
  { test: /wifi/i,                             icon: 'Wifi' },
  { test: /bluetooth/i,                        icon: 'Bluetooth' },
  { test: /connect|port|hdmi|usb|cable/i,      icon: 'Cable' },
  { test: /sensor|dpi|polling/i,                icon: 'MousePointer2' },
  { test: /weight|dimension/i,                 icon: 'Ruler' },
  { test: /speaker|sound|audio/i,               icon: 'Volume2' },
  { test: /water|resistance/i,                 icon: 'ShieldCheck' },
  { test: /microphone/i,                       icon: 'Mic' },
  { test: /color/i,                            icon: 'Palette' },
];

const iconFor = (key) => (ICON_RULES.find((r) => r.test.test(key))?.icon) ?? 'Info';

const isSkippable = (value) => value == null || String(value).trim() === '' || String(value).trim() === 'false';

/**
 * @param {{ specs?: Record<string,string>|Map<string,string>, category?: { slug?: string } }} product
 * @param {number} max
 * @returns {Array<{ key: string, value: string, iconName: string }>}
 */
export function getProductHighlights(product, max = 6) {
  const raw = product.specs;
  if (!raw) return [];
  const specs = raw instanceof Map ? Object.fromEntries(raw) : raw;

  const curated = HIGHLIGHT_KEYS_BY_CATEGORY[product.category?.slug];
  const orderedKeys = curated ?? Object.keys(specs);

  const picked = [];
  for (const key of orderedKeys) {
    if (picked.length >= max) break;
    const value = specs[key];
    if (isSkippable(value)) continue;
    picked.push({ key, value: value === 'true' ? '✓' : value, iconName: iconFor(key) });
  }
  return picked;
}
