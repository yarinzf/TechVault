'use strict';

/**
 * Mouse filter configuration.
 * Mirrors the keyboard/monitor pattern — imported by product.service.js
 * and merged into the global SPEC_PARAM_MAP.
 */

const SPEC_PARAM_MAP = {
  // Mouse-specific params
  specMouseType:       'Mouse Type',
  specSensor:          'Sensor',
  specHandOrientation: 'Hand Orientation',
  specPollingRate:     'Polling Rate',
  specGripStyle:       'Grip Style',
  // Shared with other categories (safe to re-declare — merge deduplicates)
  specConnection:      'Connection',
  specRgb:             'RGB',
  specUsage:           'Usage',
};

const VALID_CONNECTIONS       = new Set(['Wired', 'Wireless', 'Bluetooth', 'Multi-mode']);
const VALID_MOUSE_TYPES       = new Set(['Gaming', 'Office', 'Ergonomic', 'Vertical', 'MMO', 'Travel', 'Productivity']);
const VALID_HAND_ORIENTATIONS = new Set(['Right-handed', 'Left-handed', 'Ambidextrous']);
const VALID_SENSORS           = new Set(['Optical', 'Laser', 'HERO', 'Focus Pro', 'TrueMove', 'PixArt', 'BlueTrack', 'TrackPoint']);
const VALID_POLLING_RATES     = new Set(['125Hz', '500Hz', '1000Hz', '2000Hz', '4000Hz', '8000Hz']);
const VALID_USAGES            = new Set(['Gaming', 'Esports', 'Office', 'Productivity', 'Travel', 'MMO', 'Creator']);
const VALID_GRIP_STYLES       = new Set(['Palm', 'Claw', 'Fingertip', 'Universal']);

const FILTER_GROUPS = [
  {
    param: 'specConnection',
    label: { en: 'Connection', he: 'חיבור' },
    type: 'select',
    options: [
      { value: 'Wired',      label: { en: 'Wired',      he: 'קווי' } },
      { value: 'Wireless',   label: { en: 'Wireless',   he: 'אלחוטי' } },
      { value: 'Bluetooth',  label: { en: 'Bluetooth',  he: 'בלוטות\'' } },
      { value: 'Multi-mode', label: { en: 'Multi-mode', he: 'רב-מצבי' } },
    ],
  },
  {
    param: 'specMouseType',
    label: { en: 'Mouse Type', he: 'סוג עכבר' },
    type: 'select',
    options: [
      { value: 'Gaming',      label: { en: 'Gaming',      he: 'גיימינג' } },
      { value: 'Office',      label: { en: 'Office',      he: 'משרד' } },
      { value: 'Ergonomic',   label: { en: 'Ergonomic',   he: 'ארגונומי' } },
      { value: 'Vertical',    label: { en: 'Vertical',    he: 'אנכי' } },
      { value: 'MMO',         label: { en: 'MMO',         he: 'MMO' } },
      { value: 'Travel',      label: { en: 'Travel',      he: 'נסיעות' } },
      { value: 'Productivity',label: { en: 'Productivity',he: 'פרודוקטיביות' } },
    ],
  },
  {
    param: 'specHandOrientation',
    label: { en: 'Hand Orientation', he: 'ידנות' },
    type: 'select',
    options: [
      { value: 'Right-handed',   label: { en: 'Right-handed',   he: 'ימני' } },
      { value: 'Left-handed',    label: { en: 'Left-handed',    he: 'שמאלי' } },
      { value: 'Ambidextrous',   label: { en: 'Ambidextrous',   he: 'לשני הידיים' } },
    ],
  },
  {
    param: 'specSensor',
    label: { en: 'Sensor', he: 'חיישן' },
    type: 'select',
    options: [
      { value: 'Optical',    label: { en: 'Optical',    he: 'אופטי' } },
      { value: 'Laser',      label: { en: 'Laser',      he: 'לייזר' } },
      { value: 'HERO',       label: { en: 'HERO',       he: 'HERO' } },
      { value: 'Focus Pro',  label: { en: 'Focus Pro',  he: 'Focus Pro' } },
      { value: 'TrueMove',   label: { en: 'TrueMove',   he: 'TrueMove' } },
      { value: 'PixArt',     label: { en: 'PixArt',     he: 'PixArt' } },
      { value: 'BlueTrack',  label: { en: 'BlueTrack',  he: 'BlueTrack' } },
    ],
  },
  {
    param: 'specPollingRate',
    label: { en: 'Polling Rate', he: 'קצב סקירה' },
    type: 'select',
    options: [
      { value: '125Hz',  label: { en: '125Hz',  he: '125Hz' } },
      { value: '500Hz',  label: { en: '500Hz',  he: '500Hz' } },
      { value: '1000Hz', label: { en: '1000Hz', he: '1000Hz' } },
      { value: '2000Hz', label: { en: '2000Hz', he: '2000Hz' } },
      { value: '4000Hz', label: { en: '4000Hz', he: '4000Hz' } },
      { value: '8000Hz', label: { en: '8000Hz', he: '8000Hz' } },
    ],
  },
  {
    param: 'specGripStyle',
    label: { en: 'Grip Style', he: 'סגנון אחיזה' },
    type: 'select',
    options: [
      { value: 'Palm',       label: { en: 'Palm',       he: 'כף יד' } },
      { value: 'Claw',       label: { en: 'Claw',       he: 'טופר' } },
      { value: 'Fingertip',  label: { en: 'Fingertip',  he: 'קצות אצבעות' } },
      { value: 'Universal',  label: { en: 'Universal',  he: 'אוניברסלי' } },
    ],
  },
  {
    param: 'specRgb',
    label: { en: 'RGB Lighting', he: 'תאורת RGB' },
    type: 'toggle',
    toggleValue: 'true',
  },
  {
    param: 'specUsage',
    label: { en: 'Usage', he: 'שימוש' },
    type: 'select',
    options: [
      { value: 'Gaming',      label: { en: 'Gaming',      he: 'גיימינג' } },
      { value: 'Esports',     label: { en: 'Esports',     he: 'אי-ספורט' } },
      { value: 'Office',      label: { en: 'Office',      he: 'משרד' } },
      { value: 'Productivity',label: { en: 'Productivity',he: 'פרודוקטיביות' } },
      { value: 'Travel',      label: { en: 'Travel',      he: 'נסיעות' } },
      { value: 'MMO',         label: { en: 'MMO',         he: 'MMO' } },
      { value: 'Creator',     label: { en: 'Creator',     he: 'קריאייטיב' } },
    ],
  },
];

const PRICE_RANGES = [
  { label: 'עד ₪100',        min: 0,    max: 100  },
  { label: '₪100 – ₪250',   min: 100,  max: 250  },
  { label: '₪250 – ₪500',   min: 250,  max: 500  },
  { label: '₪500 – ₪900',   min: 500,  max: 900  },
  { label: 'מעל ₪900',       min: 900,  max: null },
];

module.exports = {
  SPEC_PARAM_MAP,
  VALID_CONNECTIONS,
  VALID_MOUSE_TYPES,
  VALID_HAND_ORIENTATIONS,
  VALID_SENSORS,
  VALID_POLLING_RATES,
  VALID_USAGES,
  VALID_GRIP_STYLES,
  FILTER_GROUPS,
  PRICE_RANGES,
};
