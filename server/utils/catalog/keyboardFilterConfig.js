'use strict';

/**
 * Centralized keyboard filter configuration.
 *
 * SPEC_PARAM_MAP  — maps URL query params to MongoDB spec Map keys.
 *                   Used by product.service.js for server-side filtering.
 *
 * FILTER_GROUPS   — declarative filter panel config consumed by the
 *                   CatalogPage sidebar. Each entry describes one filter
 *                   dimension: its URL param name, i18n labels, UI type,
 *                   and the ordered list of values.
 *
 * PRICE_RANGES    — predefined price-bracket options for the price filter.
 */

// ─── Spec param → MongoDB Map key ────────────────────────────────────────────
const SPEC_PARAM_MAP = {
  specKeyboardType: 'Keyboard Type',
  specConnection:   'Connection',
  specLayout:       'Layout',
  specLanguage:     'Language',
  specSwitchType:   'Switch Type',
  specBacklight:    'Backlight',
  specUsage:        'Usage',
  specColor:        'Color',
  // Boolean specs (values: 'true' | 'false')
  specRgb:          'RGB',
  specNumpad:       'Numpad',
  specWireless:     'Wireless',
  specBluetooth:    'Bluetooth',
  specHotSwap:      'Hot Swap',
};

// ─── Filter group definitions ─────────────────────────────────────────────────
// type: 'select'      — single-value dropdown
// type: 'multicheck'  — multi-value checkbox group (comma-joined in URL)
// type: 'toggle'      — boolean on/off pill
const FILTER_GROUPS = [
  {
    param:  'specKeyboardType',
    i18nKey: 'catalog.kb_type',
    label:  { en: 'Keyboard Type', he: 'סוג מקלדת' },
    type:   'select',
    options: [
      { value: 'Mechanical',  label: { en: 'Mechanical',  he: 'מכני'        } },
      { value: 'Membrane',    label: { en: 'Membrane',    he: 'ממברנה'      } },
      { value: 'Optical',     label: { en: 'Optical',     he: 'אופטי'       } },
      { value: 'Low Profile', label: { en: 'Low Profile', he: 'פרופיל נמוך' } },
    ],
  },
  {
    param:  'specLayout',
    i18nKey: 'catalog.kb_layout',
    label:  { en: 'Layout', he: 'פריסה' },
    type:   'select',
    options: [
      { value: 'Full Size', label: { en: 'Full Size (100%)', he: 'גודל מלא (100%)' } },
      { value: 'TKL',       label: { en: 'TKL (87%)',        he: 'TKL (87%)'       } },
      { value: '96%',       label: { en: '96%',              he: '96%'             } },
      { value: '75%',       label: { en: '75%',              he: '75%'             } },
      { value: '65%',       label: { en: '65%',              he: '65%'             } },
      { value: '60%',       label: { en: '60%',              he: '60%'             } },
    ],
  },
  {
    param:  'specConnection',
    i18nKey: 'catalog.kb_connection',
    label:  { en: 'Connection', he: 'חיבור' },
    type:   'select',
    options: [
      { value: 'Wired',      label: { en: 'Wired',           he: 'חוטי'          } },
      { value: 'Wireless',   label: { en: 'Wireless',        he: 'אלחוטי'        } },
      { value: 'Multi-mode', label: { en: 'Multi-mode',      he: 'ריבוי-חיבורים' } },
    ],
  },
  {
    param:  'specSwitchType',
    i18nKey: 'catalog.kb_switch',
    label:  { en: 'Switch Type', he: 'סוג מתג' },
    type:   'select',
    options: [
      { value: 'Red',          label: { en: 'Red (Linear)',      he: 'אדום (ליניארי)'  } },
      { value: 'Brown',        label: { en: 'Brown (Tactile)',   he: 'חום (טקטילי)'    } },
      { value: 'Blue',         label: { en: 'Blue (Clicky)',     he: 'כחול (קליקי)'    } },
      { value: 'Silent',       label: { en: 'Silent',            he: 'שקט'             } },
      { value: 'Optical',      label: { en: 'Optical',           he: 'אופטי'           } },
      { value: 'Optical Red',  label: { en: 'Optical Red',       he: 'אופטי אדום'      } },
      { value: 'Membrane',     label: { en: 'Membrane',          he: 'ממברנה'           } },
    ],
  },
  {
    param:  'specLanguage',
    i18nKey: 'catalog.kb_language',
    label:  { en: 'Key Language', he: 'שפת מקשים' },
    type:   'select',
    options: [
      { value: 'Hebrew + English', label: { en: 'Hebrew + English', he: 'עברית + אנגלית' } },
      { value: 'English Only',     label: { en: 'English Only',     he: 'אנגלית בלבד'    } },
    ],
  },
  {
    param:  'specBacklight',
    i18nKey: 'catalog.kb_backlight',
    label:  { en: 'Backlight', he: 'תאורת רקע' },
    type:   'select',
    options: [
      { value: 'RGB',   label: { en: 'RGB',   he: 'RGB'    } },
      { value: 'White', label: { en: 'White', he: 'לבן'    } },
      { value: 'Blue',  label: { en: 'Blue',  he: 'כחול'   } },
      { value: 'None',  label: { en: 'None',  he: 'ללא'    } },
    ],
  },
  {
    param:  'specUsage',
    i18nKey: 'catalog.kb_usage',
    label:  { en: 'Usage', he: 'שימוש' },
    type:   'select',
    options: [
      { value: 'Gaming',          label: { en: 'Gaming',          he: 'גיימינג'      } },
      { value: 'Office',          label: { en: 'Office',          he: 'משרד'         } },
      { value: 'Gaming & Office', label: { en: 'Gaming & Office', he: 'גיימינג ומשרד' } },
    ],
  },
  // ── Boolean toggles ──────────────────────────────────────────────────────────
  {
    param:  'specRgb',
    i18nKey: 'catalog.kb_rgb',
    label:  { en: 'RGB', he: 'RGB' },
    type:   'toggle',
    trueValue: 'true',
  },
  {
    param:  'specWireless',
    i18nKey: 'catalog.kb_wireless',
    label:  { en: 'Wireless', he: 'אלחוטי' },
    type:   'toggle',
    trueValue: 'true',
  },
  {
    param:  'specBluetooth',
    i18nKey: 'catalog.kb_bluetooth',
    label:  { en: 'Bluetooth', he: 'בלוטות\'' },
    type:   'toggle',
    trueValue: 'true',
  },
  {
    param:  'specHotSwap',
    i18nKey: 'catalog.kb_hotswap',
    label:  { en: 'Hot Swap', he: 'החלפת מתגים' },
    type:   'toggle',
    trueValue: 'true',
  },
  {
    param:  'specNumpad',
    i18nKey: 'catalog.kb_numpad',
    label:  { en: 'Numpad', he: 'לוח מספרים' },
    type:   'toggle',
    trueValue: 'true',
  },
];

// ─── Price range brackets (in store currency) ─────────────────────────────────
const PRICE_RANGES = [
  { label: { en: 'Under $50',       he: 'עד $50'        }, min: 0,   max: 50   },
  { label: { en: '$50 – $100',      he: '$50 – $100'    }, min: 50,  max: 100  },
  { label: { en: '$100 – $150',     he: '$100 – $150'   }, min: 100, max: 150  },
  { label: { en: '$150 – $200',     he: '$150 – $200'   }, min: 150, max: 200  },
  { label: { en: '$200 and above',  he: '$200 ומעלה'   }, min: 200, max: Infinity },
];

// ─── Valid option sets for validation ─────────────────────────────────────────
const VALID_KEYBOARD_TYPES = new Set(['Mechanical', 'Membrane', 'Optical', 'Low Profile']);
const VALID_LAYOUTS         = new Set(['Full Size', 'TKL', '96%', '75%', '65%', '60%']);
const VALID_CONNECTIONS     = new Set(['Wired', 'Wireless', 'Multi-mode']);
const VALID_LANGUAGES       = new Set(['Hebrew + English', 'English Only']);
const VALID_BACKLIGHTS      = new Set(['RGB', 'White', 'Blue', 'None']);
const VALID_USAGES          = new Set(['Gaming', 'Office', 'Gaming & Office']);
const VALID_SWITCH_TYPES    = new Set(['Red', 'Brown', 'Blue', 'Silent', 'Optical', 'Optical Red', 'Membrane', 'Speed Silver']);

module.exports = {
  SPEC_PARAM_MAP,
  FILTER_GROUPS,
  PRICE_RANGES,
  VALID_KEYBOARD_TYPES,
  VALID_LAYOUTS,
  VALID_CONNECTIONS,
  VALID_LANGUAGES,
  VALID_BACKLIGHTS,
  VALID_USAGES,
  VALID_SWITCH_TYPES,
};
