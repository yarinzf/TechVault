'use strict';

/**
 * Desktop filter configuration.
 * Mirrors the keyboard/monitor/mouse pattern — imported by product.service.js
 * and merged into the global SPEC_PARAM_MAP.
 */

const SPEC_PARAM_MAP = {
  specCpuBrand:    'CPU Brand',
  specProcessor:   'Processor',
  specRam:         'RAM',
  specStorage:     'Storage',
  specStorageType: 'Storage Type',
  specGraphics:    'Graphics',
  specOs:          'Operating System',
  specFormFactor:  'Form Factor',
  specUsage:       'Usage',
  specWifi:        'WiFi',
  specBluetooth:   'Bluetooth',
};

const VALID_CPU_BRANDS    = new Set(['Intel', 'AMD', 'Apple Silicon']);
const VALID_FORM_FACTORS  = new Set(['Tower', 'Mini Tower', 'Small Form Factor', 'Mini PC', 'All-in-One']);
const VALID_GRAPHICS      = new Set(['Integrated', 'NVIDIA RTX', 'NVIDIA GTX', 'AMD Radeon']);
const VALID_OS            = new Set(['Windows 11 Home', 'Windows 11 Pro', 'FreeDOS', 'No OS']);
const VALID_STORAGE_TYPES = new Set(['HDD', 'SATA SSD', 'NVMe SSD']);
const VALID_USAGES        = new Set(['Office', 'Business', 'Gaming', 'Workstation', 'Creator', 'Home', 'Education']);

const VALID_RAM    = new Set(['4GB', '8GB', '16GB', '32GB', '64GB', '128GB']);
const VALID_WIFI   = new Set(['No WiFi', 'WiFi 5', 'WiFi 6', 'WiFi 6E', 'WiFi 7']);

const FILTER_GROUPS = [
  {
    param: 'specCpuBrand',
    label: { en: 'CPU Brand', he: 'יצרן מעבד' },
    type: 'select',
    options: [
      { value: 'Intel', label: { en: 'Intel', he: 'Intel' } },
      { value: 'AMD',   label: { en: 'AMD',   he: 'AMD' } },
    ],
  },
  {
    param: 'specRam',
    label: { en: 'RAM', he: 'זיכרון RAM' },
    type: 'select',
    options: [
      { value: '4GB',   label: { en: '4GB',   he: '4GB' } },
      { value: '8GB',   label: { en: '8GB',   he: '8GB' } },
      { value: '16GB',  label: { en: '16GB',  he: '16GB' } },
      { value: '32GB',  label: { en: '32GB',  he: '32GB' } },
      { value: '64GB',  label: { en: '64GB',  he: '64GB' } },
      { value: '128GB', label: { en: '128GB', he: '128GB' } },
    ],
  },
  {
    param: 'specStorageType',
    label: { en: 'Storage Type', he: 'סוג אחסון' },
    type: 'select',
    options: [
      { value: 'HDD',      label: { en: 'HDD',      he: 'דיסק קשיח (HDD)' } },
      { value: 'SATA SSD', label: { en: 'SATA SSD', he: 'SSD SATA' } },
      { value: 'NVMe SSD', label: { en: 'NVMe SSD', he: 'SSD NVMe' } },
    ],
  },
  {
    param: 'specGraphics',
    label: { en: 'Graphics', he: 'כרטיס גרפי' },
    type: 'select',
    options: [
      { value: 'Integrated', label: { en: 'Integrated Graphics', he: 'גרפיקה משולבת' } },
      { value: 'NVIDIA RTX', label: { en: 'NVIDIA RTX',          he: 'NVIDIA RTX' } },
      { value: 'NVIDIA GTX', label: { en: 'NVIDIA GTX',          he: 'NVIDIA GTX' } },
      { value: 'AMD Radeon', label: { en: 'AMD Radeon',          he: 'AMD Radeon' } },
    ],
  },
  {
    param: 'specOs',
    label: { en: 'Operating System', he: 'מערכת הפעלה' },
    type: 'select',
    options: [
      { value: 'Windows 11 Home', label: { en: 'Windows 11 Home', he: 'Windows 11 Home' } },
      { value: 'Windows 11 Pro',  label: { en: 'Windows 11 Pro',  he: 'Windows 11 Pro' } },
      { value: 'FreeDOS',         label: { en: 'FreeDOS',         he: 'FreeDOS' } },
      { value: 'No OS',           label: { en: 'No OS',           he: 'ללא מערכת הפעלה' } },
    ],
  },
  {
    param: 'specFormFactor',
    label: { en: 'Form Factor', he: 'גורם צורה' },
    type: 'select',
    options: [
      { value: 'Tower',              label: { en: 'Tower',              he: 'מגדל' } },
      { value: 'Mini Tower',         label: { en: 'Mini Tower',         he: 'מגדל מיני' } },
      { value: 'Small Form Factor',  label: { en: 'Small Form Factor',  he: 'קומפקטי (SFF)' } },
      { value: 'Mini PC',            label: { en: 'Mini PC',            he: 'מיני PC' } },
      { value: 'All-in-One',         label: { en: 'All-in-One',         he: 'הכל-באחד' } },
    ],
  },
  {
    param: 'specUsage',
    label: { en: 'Usage', he: 'שימוש' },
    type: 'select',
    options: [
      { value: 'Office',      label: { en: 'Office',      he: 'משרד' } },
      { value: 'Business',    label: { en: 'Business',    he: 'עסקי' } },
      { value: 'Gaming',      label: { en: 'Gaming',      he: 'גיימינג' } },
      { value: 'Workstation', label: { en: 'Workstation', he: 'תחנת עבודה' } },
      { value: 'Creator',     label: { en: 'Creator',     he: 'קריאייטיב' } },
      { value: 'Home',        label: { en: 'Home',        he: 'ביתי' } },
      { value: 'Education',   label: { en: 'Education',   he: 'חינוך' } },
    ],
  },
  {
    param: 'specWifi',
    label: { en: 'WiFi', he: 'WiFi' },
    type: 'select',
    options: [
      { value: 'No WiFi', label: { en: 'No WiFi (Ethernet only)', he: 'ללא WiFi (Ethernet בלבד)' } },
      { value: 'WiFi 5',  label: { en: 'WiFi 5 (802.11ac)',       he: 'WiFi 5' } },
      { value: 'WiFi 6',  label: { en: 'WiFi 6 (802.11ax)',       he: 'WiFi 6' } },
      { value: 'WiFi 6E', label: { en: 'WiFi 6E',                 he: 'WiFi 6E' } },
      { value: 'WiFi 7',  label: { en: 'WiFi 7',                  he: 'WiFi 7' } },
    ],
  },
];

const PRICE_RANGES = [
  { label: 'עד ₪2,000',          min: 0,      max: 2000  },
  { label: '₪2,000 – ₪4,000',   min: 2000,   max: 4000  },
  { label: '₪4,000 – ₪7,000',   min: 4000,   max: 7000  },
  { label: '₪7,000 – ₪12,000',  min: 7000,   max: 12000 },
  { label: 'מעל ₪12,000',        min: 12000,  max: null  },
];

module.exports = {
  SPEC_PARAM_MAP,
  VALID_CPU_BRANDS,
  VALID_FORM_FACTORS,
  VALID_GRAPHICS,
  VALID_OS,
  VALID_STORAGE_TYPES,
  VALID_USAGES,
  VALID_RAM,
  VALID_WIFI,
  FILTER_GROUPS,
  PRICE_RANGES,
};
