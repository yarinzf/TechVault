// Centralized category-name translation, keyed by the stable `slug` (not the
// English `name`, which can't be relied on to match exactly). Slugs match
// the canonical taxonomy in server/config/categoryTaxonomy.js.
const CATEGORY_LABELS = {
  // Main categories
  computers:       { he: 'מחשבים',            en: 'Computers' },
  monitors:        { he: 'מסכים',              en: 'Monitors' },
  'pc-components': { he: 'רכיבי מחשב',         en: 'PC Components' },
  storage:         { he: 'אחסון',              en: 'Storage' },
  peripherals:     { he: 'ציוד היקפי',         en: 'Peripherals' },
  networking:      { he: 'רשת ותקשורת',        en: 'Networking' },
  gaming:          { he: 'גיימינג',            en: 'Gaming' },
  consoles:        { he: 'קונסולות',           en: 'Consoles' },
  smartphones:     { he: 'סמארטפונים',         en: 'Smartphones' },
  tablets:         { he: 'טאבלטים',            en: 'Tablets' },
  tvs:             { he: 'טלוויזיות',          en: 'TVs' },
  printers:        { he: 'מדפסות',             en: 'Printers' },

  // Legacy pre-migration slugs (server/config/categoryTaxonomy.js
  // LEGACY_CATEGORY_PLAN's two 'rename' entries: headphones -> headsets,
  // components -> pc-components). A Category document is only ever renamed
  // in place by re-running the migration script; until that has actually
  // happened against a given database, these old slugs/names can still be
  // what a real Category document carries. Mapped here to the SAME labels
  // as their canonical replacement so the modal never falls back to a raw
  // English name for a category that legitimately still exists.
  headphones: { he: 'אוזניות',    en: 'Headsets' },
  components: { he: 'רכיבי מחשב', en: 'PC Components' },

  // Computers
  laptops:      { he: 'מחשבים ניידים',   en: 'Laptops' },
  desktops:     { he: 'מחשבים נייחים',   en: 'Desktops' },
  'mini-pc':    { he: 'מחשבי Mini PC',   en: 'Mini PC' },
  'all-in-one': { he: 'מחשבי All-in-One', en: 'All-in-One' },

  // PC Components
  cpus:            { he: 'מעבדים',        en: 'CPUs' },
  gpus:            { he: 'כרטיסי מסך',    en: 'GPUs' },
  motherboards:    { he: 'לוחות אם',      en: 'Motherboards' },
  ram:             { he: 'זיכרון RAM',    en: 'RAM' },
  psus:            { he: 'ספקי כוח',      en: 'PSUs' },
  cases:           { he: 'מארזים',        en: 'Cases' },
  cooling:         { he: 'קירור',         en: 'Cooling' },
  fans:            { he: 'מאווררים',      en: 'Fans' },
  'sound-cards':   { he: 'כרטיסי קול',    en: 'Sound Cards' },
  'capture-cards': { he: 'כרטיסי לכידה',  en: 'Capture Cards' },
  'network-cards': { he: 'כרטיסי רשת',    en: 'Network Cards' },

  // Storage
  ssd:                { he: 'SSD',              en: 'SSD' },
  hdd:                { he: 'HDD',              en: 'HDD' },
  'external-drives':  { he: 'כוננים חיצוניים',  en: 'External Drives' },
  'usb-flash-drives': { he: 'דיסק און קי',      en: 'USB Flash Drives' },
  'memory-cards':     { he: 'כרטיסי זיכרון',    en: 'Memory Cards' },

  // Peripherals
  keyboards:    { he: 'מקלדות',       en: 'Keyboards' },
  mice:         { he: 'עכברים',       en: 'Mice' },
  'mouse-pads': { he: 'משטחי עכבר',   en: 'Mouse Pads' },
  headsets:     { he: 'אוזניות',      en: 'Headsets' },
  speakers:     { he: 'רמקולים',      en: 'Speakers' },
  microphones:  { he: 'מיקרופונים',   en: 'Microphones' },
  webcams:      { he: 'מצלמות רשת',   en: 'Webcams' },

  // Networking
  routers:            { he: 'ראוטרים',       en: 'Routers' },
  mesh:               { he: 'Mesh',          en: 'Mesh' },
  switches:            { he: "סוויצ'ים",     en: 'Switches' },
  'access-points':     { he: 'נקודות גישה',  en: 'Access Points' },
  'network-adapters':  { he: 'מתאמי רשת',    en: 'Network Adapters' },

  // Gaming
  'gaming-chairs':  { he: 'כיסאות גיימינג',   en: 'Gaming Chairs' },
  'gaming-desks':   { he: 'שולחנות גיימינג',  en: 'Gaming Desks' },
  controllers:      { he: 'בקרים',            en: 'Controllers' },
  'racing-wheels':  { he: 'הגאי מירוצים',     en: 'Racing Wheels' },
  'flight-sticks':  { he: 'Flight Sticks',    en: 'Flight Sticks' },
  vr:               { he: 'VR',               en: 'VR' },
  'streaming-gear': { he: 'ציוד סטרימינג',    en: 'Streaming Gear' },

  // Consoles
  playstation:          { he: 'PlayStation',       en: 'PlayStation' },
  xbox:                 { he: 'Xbox',              en: 'Xbox' },
  nintendo:             { he: 'Nintendo',          en: 'Nintendo' },
  'handheld-consoles':  { he: 'קונסולות ניידות',   en: 'Handheld Consoles' },

  // Printers
  scanners:    { he: 'סורקים',      en: 'Scanners' },
  'ink-toner': { he: 'דיו וטונר',   en: 'Ink & Toner' },

  // Legacy/deactivated — kept so any stale reference still renders something
  // sensible instead of a raw slug.
  accessories:  { he: 'אביזרים', en: 'Accessories' },
  'smart-home': { he: 'בית חכם', en: 'Smart Home' },
};

/**
 * @param {{ slug?: string, name?: string }|undefined} category
 * @param {'he'|'en'} language
 * @returns {string} Localized category name, or the raw name/slug if unmapped.
 */
export function getCategoryLabel(category, language) {
  if (!category) return '';
  const entry = CATEGORY_LABELS[category.slug];
  if (!entry) return category.name ?? category.slug ?? '';
  return entry[language] ?? entry.en ?? category.name ?? '';
}
