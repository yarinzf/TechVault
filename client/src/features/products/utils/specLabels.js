// Centralized label translation for the free-form `product.specs` keys the
// backend stores in English (see server/models/Product.js — specs is a flat
// Map<String,String>, so keys arrive exactly as seeded). This translates the
// LABEL only — technical values (OLED, 240Hz, HDMI 2.1, RTX 5070, ...) are
// left untouched, since those are product facts, not UI copy.
//
// Keys below were pulled from a full scan of server/data/**/*.js (every
// category currently seeded: monitors, keyboards, mice, headphones,
// desktops) plus a few forward-looking keys for categories the task
// requires supporting before real data exists (laptops, storage,
// components, networking, smartphones, tablets, printers, consoles, TVs).
const SPEC_LABELS = {
  // ── Display ──────────────────────────────────────────────────────────
  'Screen Size':       { he: 'גודל מסך',        en: 'Screen Size' },
  'Resolution':         { he: 'רזולוציה',         en: 'Resolution' },
  'Panel Type':         { he: 'סוג פאנל',         en: 'Panel Type' },
  'Refresh Rate':       { he: 'קצב רענון',        en: 'Refresh Rate' },
  'Response Time':      { he: 'זמן תגובה',        en: 'Response Time' },
  'Aspect Ratio':       { he: 'יחס רוחב-גובה',    en: 'Aspect Ratio' },
  'Curved':             { he: 'מסך מעוקל',        en: 'Curved' },
  'Ultrawide':          { he: 'רחב במיוחד',       en: 'Ultrawide' },
  'HDR':                { he: 'HDR',              en: 'HDR' },
  'Adaptive Sync':      { he: 'סנכרון אדפטיבי',   en: 'Adaptive Sync' },
  'Height Adjustable':  { he: 'התאמת גובה',       en: 'Height Adjustable' },
  'VESA Mount':         { he: 'תושבת VESA',       en: 'VESA Mount' },
  'Display':            { he: 'תצוגה',            en: 'Display' },
  'Contrast Ratio':     { he: 'יחס ניגודיות',     en: 'Contrast Ratio' },
  'Brightness':         { he: 'בהירות',           en: 'Brightness' },
  'Color Gamut':        { he: 'טווח צבעים',       en: 'Color Gamut' },
  'Screen Type':        { he: 'סוג מסך',          en: 'Screen Type' },

  // ── Connectivity ─────────────────────────────────────────────────────
  'Ports':              { he: 'חיבורים',          en: 'Ports' },
  'Connection':         { he: 'חיבור',            en: 'Connection' },
  'Wireless':           { he: 'אלחוטי',           en: 'Wireless' },
  'Bluetooth':          { he: 'בלוטות׳',          en: 'Bluetooth' },
  'Bluetooth Version':  { he: 'גרסת בלוטות׳',     en: 'Bluetooth Version' },
  'WiFi':                { he: 'Wi-Fi',            en: 'WiFi' },
  'USB Polling Rate':   { he: 'קצב דגימת USB',    en: 'USB Polling Rate' },
  'Polling Rate':       { he: 'קצב דגימה',        en: 'Polling Rate' },
  'Cable Length':       { he: 'אורך כבל',         en: 'Cable Length' },
  'HDMI':                { he: 'HDMI',             en: 'HDMI' },
  'USB':                 { he: 'USB',              en: 'USB' },
  'Voice Assistant':    { he: 'עוזר קולי',        en: 'Voice Assistant' },
  'Screen Mirroring':   { he: 'שיקוף מסך',        en: 'Screen Mirroring' },
  'App Store':          { he: 'חנות אפליקציות',   en: 'App Store' },
  'Standard':            { he: 'תקן',              en: 'Standard' },
  'Coverage Area':      { he: 'שטח כיסוי',        en: 'Coverage Area' },
  'Ethernet Ports':     { he: 'יציאות Ethernet',  en: 'Ethernet Ports' },
  'Max Speed':          { he: 'מהירות מרבית',     en: 'Max Speed' },
  'Band':                { he: 'תדר',              en: 'Band' },
  'Security':            { he: 'אבטחה',            en: 'Security' },

  // ── Audio ────────────────────────────────────────────────────────────
  'Driver Size':        { he: 'גודל דרייבר',      en: 'Driver Size' },
  'Driver Type':        { he: 'סוג דרייבר',       en: 'Driver Type' },
  'Frequency Response': { he: 'תגובת תדרים',      en: 'Frequency Response' },
  'Noise Cancellation': { he: 'ביטול רעשים',      en: 'Noise Cancellation' },
  'Headphone Type':     { he: 'סוג אוזניות',      en: 'Headphone Type' },
  'Microphone':         { he: 'מיקרופון',         en: 'Microphone' },
  'Impedance':          { he: 'עכבה',             en: 'Impedance' },
  'Hi-Res Audio':       { he: 'שמע ברזולוציה גבוהה', en: 'Hi-Res Audio' },
  'Surround Sound':     { he: 'סראונד',           en: 'Surround Sound' },
  'Speakers':            { he: 'רמקולים',          en: 'Speakers' },
  'Sound Output':       { he: 'פלט שמע',          en: 'Sound Output' },

  // ── Performance / hardware ───────────────────────────────────────────
  'Processor':          { he: 'מעבד',             en: 'Processor' },
  'CPU Brand':          { he: 'יצרן מעבד',        en: 'CPU Brand' },
  'RAM':                 { he: 'זיכרון RAM',       en: 'RAM' },
  'RAM Type':           { he: 'סוג זיכרון',       en: 'RAM Type' },
  'Graphics':            { he: 'כרטיס מסך',        en: 'Graphics' },
  'GPU Model':          { he: 'דגם כרטיס מסך',    en: 'GPU Model' },
  'Storage':             { he: 'אחסון',            en: 'Storage' },
  'Storage Type':       { he: 'סוג אחסון',        en: 'Storage Type' },
  'Storage Capacity':   { he: 'נפח אחסון',        en: 'Storage Capacity' },
  'Operating System':   { he: 'מערכת הפעלה',      en: 'Operating System' },
  'Form Factor':        { he: 'צורת מארז',        en: 'Form Factor' },
  'Platform':            { he: 'פלטפורמה',         en: 'Platform' },
  'Chipset':             { he: 'ערכת שבבים',       en: 'Chipset' },

  // ── Input devices ────────────────────────────────────────────────────
  'Keyboard Type':      { he: 'סוג מקלדת',        en: 'Keyboard Type' },
  'Layout':              { he: 'פריסה',            en: 'Layout' },
  'Switch Type':        { he: 'סוג מתגים',        en: 'Switch Type' },
  'Backlight':           { he: 'תאורה אחורית',     en: 'Backlight' },
  'RGB':                 { he: 'תאורת RGB',        en: 'RGB' },
  'Hot Swap':            { he: 'החלפת מתגים',      en: 'Hot Swap' },
  'Numpad':              { he: 'מקלדת מספרית',     en: 'Numpad' },
  'Size %':              { he: 'גודל',             en: 'Size' },
  'Mouse Type':          { he: 'סוג עכבר',         en: 'Mouse Type' },
  'Sensor':              { he: 'חיישן',            en: 'Sensor' },
  'DPI':                 { he: 'DPI',              en: 'DPI' },
  'Sensitivity':         { he: 'רגישות',           en: 'Sensitivity' },
  'Buttons':             { he: 'כפתורים',          en: 'Buttons' },
  'Grip Style':          { he: 'סגנון אחיזה',      en: 'Grip Style' },
  'Hand Orientation':    { he: 'התאמה ליד',        en: 'Hand Orientation' },
  'Language':            { he: 'שפה',              en: 'Language' },
  'Compatibility':       { he: 'תאימות',           en: 'Compatibility' },

  // ── Power / physical ─────────────────────────────────────────────────
  'Battery Life':       { he: 'חיי סוללה',        en: 'Battery Life' },
  'Battery Capacity':   { he: 'קיבולת סוללה',     en: 'Battery Capacity' },
  'Charging Type':      { he: 'סוג טעינה',        en: 'Charging Type' },
  'Wireless Charging':  { he: 'טעינה אלחוטית',    en: 'Wireless Charging' },
  'Water Resistance':   { he: 'עמידות למים',      en: 'Water Resistance' },
  'Color':               { he: 'צבע',              en: 'Color' },
  'Weight':              { he: 'משקל',             en: 'Weight' },
  'Dimensions':          { he: 'מידות',            en: 'Dimensions' },
  'Warranty':            { he: 'אחריות',           en: 'Warranty' },
  'Usage':               { he: 'ייעוד',            en: 'Usage' },
  'Release Year':       { he: 'שנת השקה',         en: 'Release Year' },

  // ── Category-specific (future categories, not yet seeded) ───────────
  'Camera':              { he: 'מצלמה',            en: 'Camera' },
  'SIM':                 { he: 'כרטיס SIM',        en: 'SIM' },
  'Print Type':          { he: 'סוג הדפסה',        en: 'Print Type' },
  'Print Speed':         { he: 'מהירות הדפסה',     en: 'Print Speed' },
  'Ink Type':            { he: 'סוג דיו',          en: 'Ink Type' },
  'Paper Size':          { he: 'גודל נייר',        en: 'Paper Size' },
  'Duplex Printing':     { he: 'הדפסה דו-צדדית',   en: 'Duplex Printing' },
  'Controller Included': { he: 'כולל בקר',         en: 'Controller Included' },
  'Backward Compatibility': { he: 'תאימות לאחור',  en: 'Backward Compatibility' },
};

/**
 * @param {string} specKey  Raw spec key as stored in the backend (e.g. "Screen Size")
 * @param {'he'|'en'} language
 * @returns {string} Localized label, or the original key if no translation exists.
 */
export function getSpecLabel(specKey, language) {
  const entry = SPEC_LABELS[specKey];
  if (!entry) return specKey;
  return entry[language] ?? entry.en ?? specKey;
}
