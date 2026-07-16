// Centralized category-name translation, keyed by the stable `slug` (not the
// English `name`, which can't be relied on to match exactly). Slugs come
// from the real seeded categories (server/scripts/seed.js) plus a couple of
// forward-looking ones (TVs, Printers) requested for future compatibility.
const CATEGORY_LABELS = {
  laptops:      { he: 'מחשבים ניידים',   en: 'Laptops' },
  smartphones:  { he: 'סמארטפונים',      en: 'Smartphones' },
  tablets:      { he: 'טאבלטים',         en: 'Tablets' },
  gaming:       { he: 'גיימינג',         en: 'Gaming' },
  monitors:     { he: 'מסכים',           en: 'Monitors' },
  keyboards:    { he: 'מקלדות',          en: 'Keyboards' },
  mice:         { he: 'עכברים',          en: 'Mice' },
  headphones:   { he: 'אוזניות',         en: 'Headphones' },
  speakers:     { he: 'רמקולים',         en: 'Speakers' },
  storage:      { he: 'אחסון',           en: 'Storage' },
  components:   { he: 'רכיבי מחשב',      en: 'Components' },
  networking:   { he: 'רשת ותקשורת',     en: 'Networking' },
  'smart-home': { he: 'בית חכם',         en: 'Smart Home' },
  desktops:     { he: 'מחשבים נייחים',   en: 'Desktops' },
  accessories:  { he: 'אביזרים',         en: 'Accessories' },
  tvs:          { he: 'טלוויזיות',       en: 'TVs' },
  printers:     { he: 'מדפסות',          en: 'Printers' },
  consoles:     { he: 'קונסולות',        en: 'Consoles' },
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
