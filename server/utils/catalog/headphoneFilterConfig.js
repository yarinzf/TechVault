'use strict';

/**
 * Headphone filter configuration.
 * Mirrors the keyboard/monitor/mouse/desktop pattern.
 * Imported by product.service.js and merged into the global SPEC_PARAM_MAP.
 */

const SPEC_PARAM_MAP = {
  specConnection:       'Connection',
  specHeadphoneType:    'Headphone Type',
  specUsage:            'Usage',
  specMicrophone:       'Microphone',
  specNoiseCancellation:'Noise Cancellation',
  specWaterResistance:  'Water Resistance',
  specBluetooth:        'Bluetooth',
  specSurroundSound:    'Surround Sound',
  specRgb:              'RGB',
  specColor:            'Color',
  specCompatibility:    'Compatibility',
  specChargingType:     'Charging Type',
};

// ─── Valid value sets ──────────────────────────────────────────────────────────

const VALID_CONNECTIONS = new Set([
  'Wired',
  'Bluetooth',
  '2.4GHz Wireless',
  'USB',
  'USB-C Wired',
  'True Wireless',
  'Multi-device',
]);

const VALID_HEADPHONE_TYPES = new Set([
  'Over-Ear',
  'On-Ear',
  'In-Ear',
  'True Wireless',
  'Gaming Headset',
  'Bone Conduction',
  'Earbuds',
]);

const VALID_USAGES = new Set([
  'Gaming',
  'Music',
  'Sport',
  'Office',
  'Studio',
  'Kids',
  'Travel',
  'Calls',
  'Home',
]);

const VALID_MICROPHONES = new Set([
  'No',
  'Yes',
  'Built-in',
  'Detachable',
  'Boom Mic',
  'Retractable',
]);

const VALID_NOISE_CANCELLATIONS = new Set([
  'None',
  'Passive',
  'ANC',
  'Hybrid ANC',
  'ENC',
  'CVC',
]);

const VALID_WATER_RESISTANCE = new Set([
  'None',
  'IPX4',
  'IPX5',
  'IPX6',
  'IPX7',
  'IP55',
  'IP67',
  'IP68',
]);

const VALID_CHARGING_TYPES = new Set([
  'None',
  'USB-C',
  'Micro USB',
  'Lightning',
  'Proprietary',
]);

const VALID_COMPATIBILITIES = new Set([
  'PC',
  'Mac',
  'PlayStation',
  'Xbox',
  'Nintendo Switch',
  'Mobile',
  'Bluetooth devices',
  'Universal',
]);

// ─── Filter groups (storefront UI) ────────────────────────────────────────────

const FILTER_GROUPS = [
  {
    param: 'specConnection',
    label: { en: 'Connection', he: 'חיבור' },
    type: 'select',
    options: [
      { value: 'Wired',           label: { en: 'Wired',           he: 'מחובר בכבל' } },
      { value: 'Bluetooth',       label: { en: 'Bluetooth',       he: 'בלוטות׳' } },
      { value: '2.4GHz Wireless', label: { en: '2.4GHz Wireless', he: 'אלחוטי 2.4GHz' } },
      { value: 'True Wireless',   label: { en: 'True Wireless',   he: 'True Wireless (TWS)' } },
      { value: 'USB',             label: { en: 'USB',             he: 'USB' } },
      { value: 'USB-C Wired',     label: { en: 'USB-C Wired',     he: 'כבל USB-C' } },
    ],
  },
  {
    param: 'specHeadphoneType',
    label: { en: 'Type', he: 'סוג' },
    type: 'select',
    options: [
      { value: 'Over-Ear',       label: { en: 'Over-Ear',        he: 'על-האוזן' } },
      { value: 'On-Ear',         label: { en: 'On-Ear',          he: 'על-האוזן (On-Ear)' } },
      { value: 'In-Ear',         label: { en: 'In-Ear',          he: 'תוך-אוזן' } },
      { value: 'True Wireless',  label: { en: 'True Wireless',   he: 'TWS (אוזניות נפרדות)' } },
      { value: 'Gaming Headset', label: { en: 'Gaming Headset',  he: 'אוזניות גיימינג' } },
      { value: 'Bone Conduction',label: { en: 'Bone Conduction',  he: 'הולכת עצם' } },
      { value: 'Earbuds',        label: { en: 'Earbuds',         he: 'אוזניות ידניות' } },
    ],
  },
  {
    param: 'specUsage',
    label: { en: 'Usage', he: 'שימוש' },
    type: 'select',
    options: [
      { value: 'Gaming',  label: { en: 'Gaming',  he: 'גיימינג' } },
      { value: 'Music',   label: { en: 'Music',   he: 'מוזיקה' } },
      { value: 'Sport',   label: { en: 'Sport',   he: 'ספורט' } },
      { value: 'Office',  label: { en: 'Office',  he: 'משרד' } },
      { value: 'Studio',  label: { en: 'Studio',  he: 'סטודיו' } },
      { value: 'Kids',    label: { en: 'Kids',    he: 'ילדים' } },
      { value: 'Travel',  label: { en: 'Travel',  he: 'נסיעות' } },
      { value: 'Calls',   label: { en: 'Calls',   he: 'שיחות' } },
    ],
  },
  {
    param: 'specMicrophone',
    label: { en: 'Microphone', he: 'מיקרופון' },
    type: 'select',
    options: [
      { value: 'No',          label: { en: 'No',          he: 'ללא מיקרופון' } },
      { value: 'Yes',         label: { en: 'Yes',         he: 'כן' } },
      { value: 'Built-in',    label: { en: 'Built-in',    he: 'מובנה' } },
      { value: 'Detachable',  label: { en: 'Detachable',  he: 'נשלף' } },
      { value: 'Boom Mic',    label: { en: 'Boom Mic',    he: 'בום מיק' } },
      { value: 'Retractable', label: { en: 'Retractable', he: 'נשלף ומתקפל' } },
    ],
  },
  {
    param: 'specNoiseCancellation',
    label: { en: 'Noise Cancellation', he: 'ביטול רעש' },
    type: 'select',
    options: [
      { value: 'None',       label: { en: 'None',       he: 'ללא' } },
      { value: 'Passive',    label: { en: 'Passive',    he: 'פסיבי' } },
      { value: 'ANC',        label: { en: 'ANC',        he: 'ANC (אקטיבי)' } },
      { value: 'Hybrid ANC', label: { en: 'Hybrid ANC', he: 'Hybrid ANC' } },
      { value: 'ENC',        label: { en: 'ENC (Mic)',  he: 'ENC (מיקרופון)' } },
    ],
  },
  {
    param: 'specWaterResistance',
    label: { en: 'Water Resistance', he: 'עמידות מים' },
    type: 'select',
    options: [
      { value: 'None', label: { en: 'None',  he: 'ללא' } },
      { value: 'IPX4', label: { en: 'IPX4',  he: 'IPX4' } },
      { value: 'IPX5', label: { en: 'IPX5',  he: 'IPX5' } },
      { value: 'IPX6', label: { en: 'IPX6',  he: 'IPX6' } },
      { value: 'IPX7', label: { en: 'IPX7',  he: 'IPX7' } },
      { value: 'IP67', label: { en: 'IP67',  he: 'IP67' } },
      { value: 'IP68', label: { en: 'IP68',  he: 'IP68' } },
    ],
  },
  {
    param: 'specSurroundSound',
    label: { en: 'Surround Sound', he: 'סראונד' },
    type: 'select',
    options: [
      { value: 'No',           label: { en: 'No',           he: 'ללא' } },
      { value: 'Yes',          label: { en: 'Yes',          he: 'כן' } },
      { value: '7.1',          label: { en: '7.1 Surround', he: 'סראונד 7.1' } },
      { value: 'Simulated 7.1',label: { en: 'Simulated 7.1',he: 'סראונד וירטואלי 7.1' } },
    ],
  },
  {
    param: 'specRgb',
    label: { en: 'RGB Lighting', he: 'תאורת RGB' },
    type: 'select',
    options: [
      { value: 'No',  label: { en: 'No',  he: 'ללא' } },
      { value: 'Yes', label: { en: 'Yes', he: 'כן' } },
    ],
  },
];

const PRICE_RANGES = [
  { label: 'עד ₪100',          min: 0,    max: 100  },
  { label: '₪100 – ₪250',     min: 100,  max: 250  },
  { label: '₪250 – ₪500',     min: 250,  max: 500  },
  { label: '₪500 – ₪1,000',   min: 500,  max: 1000 },
  { label: '₪1,000 – ₪2,000', min: 1000, max: 2000 },
  { label: 'מעל ₪2,000',       min: 2000, max: null },
];

module.exports = {
  SPEC_PARAM_MAP,
  VALID_CONNECTIONS,
  VALID_HEADPHONE_TYPES,
  VALID_USAGES,
  VALID_MICROPHONES,
  VALID_NOISE_CANCELLATIONS,
  VALID_WATER_RESISTANCE,
  VALID_CHARGING_TYPES,
  VALID_COMPATIBILITIES,
  FILTER_GROUPS,
  PRICE_RANGES,
};
