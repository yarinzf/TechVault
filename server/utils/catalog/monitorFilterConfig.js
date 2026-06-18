'use strict';

const SPEC_PARAM_MAP = {
  specScreenSize:   'Screen Size',
  specResolution:   'Resolution',
  specPanelType:    'Panel Type',
  specRefreshRate:  'Refresh Rate',
  specResponseTime: 'Response Time',
  specAspectRatio:  'Aspect Ratio',
  specAdaptiveSync: 'Adaptive Sync',
  specUsage:        'Usage',
  // Boolean specs (values: 'true' | 'false')
  specCurved:       'Curved',
  specUltrawide:    'Ultrawide',
  specHdr:          'HDR',
  specSpeakers:     'Speakers',
  specHeightAdj:    'Height Adjustable',
  specVesa:         'VESA Mount',
};

const VALID_SCREEN_SIZES   = new Set(['21.5"', '22"', '23.8"', '24"', '25"', '27"', '28"', '29"', '31.5"', '32"', '34"', '35"', '37.5"', '38"', '40"', '43"', '45"', '49"', '55"', '57"']);
const VALID_RESOLUTIONS    = new Set(['Full HD', 'QHD', 'WQHD', 'UltraWide FHD', 'UltraWide QHD', '4K UHD', '5K', 'Dual QHD']);
const VALID_PANEL_TYPES    = new Set(['IPS', 'VA', 'TN', 'OLED', 'QD-OLED', 'Mini LED']);
const VALID_REFRESH_RATES  = new Set(['60Hz', '75Hz', '100Hz', '120Hz', '144Hz', '165Hz', '170Hz', '175Hz', '180Hz', '240Hz', '360Hz']);
const VALID_RESPONSE_TIMES = new Set(['0.03ms', '0.1ms', '0.5ms', '1ms', '4ms', '5ms', '8ms']);
const VALID_ASPECT_RATIOS  = new Set(['16:9', '16:10', '21:9', '32:9', '32:10']);
const VALID_ADAPTIVE_SYNCS = new Set([
  'AMD FreeSync', 'AMD FreeSync Premium', 'AMD FreeSync Premium Pro',
  'NVIDIA G-Sync', 'NVIDIA G-Sync Ultimate', 'NVIDIA G-Sync Compatible',
  'None',
]);
const VALID_USAGES = new Set(['Gaming', 'Office', 'Creator', 'Professional', 'Console', 'Programming', 'Universal']);

const FILTER_GROUPS = [
  {
    param: 'specScreenSize',
    label: { en: 'Screen Size', he: 'גודל מסך' },
    type: 'select',
    options: [
      { value: '24"',  label: { en: '24"',  he: '24 אינץ\'' } },
      { value: '27"',  label: { en: '27"',  he: '27 אינץ\'' } },
      { value: '32"',  label: { en: '32"',  he: '32 אינץ\'' } },
      { value: '34"',  label: { en: '34"',  he: '34 אינץ\'' } },
      { value: '49"',  label: { en: '49"',  he: '49 אינץ\'' } },
    ],
  },
  {
    param: 'specResolution',
    label: { en: 'Resolution', he: 'רזולוציה' },
    type: 'select',
    options: [
      { value: 'Full HD',         label: { en: 'Full HD (1080p)',       he: 'Full HD (1080p)'     } },
      { value: 'QHD',             label: { en: 'QHD (1440p)',           he: 'QHD (1440p)'         } },
      { value: 'UltraWide QHD',   label: { en: 'UltraWide QHD',        he: 'UltraWide QHD'       } },
      { value: '4K UHD',          label: { en: '4K UHD (2160p)',        he: '4K UHD (2160p)'      } },
      { value: 'Dual QHD',        label: { en: 'Dual QHD (5120×1440)', he: 'Dual QHD (5120×1440)' } },
      { value: '5K',              label: { en: '5K (5120×2880)',        he: '5K (5120×2880)'      } },
    ],
  },
  {
    param: 'specPanelType',
    label: { en: 'Panel Type', he: 'סוג פאנל' },
    type: 'select',
    options: [
      { value: 'IPS',      label: { en: 'IPS',      he: 'IPS'      } },
      { value: 'VA',       label: { en: 'VA',        he: 'VA'       } },
      { value: 'TN',       label: { en: 'TN',        he: 'TN'       } },
      { value: 'OLED',     label: { en: 'OLED',      he: 'OLED'     } },
      { value: 'QD-OLED',  label: { en: 'QD-OLED',   he: 'QD-OLED'  } },
      { value: 'Mini LED', label: { en: 'Mini LED',  he: 'Mini LED' } },
    ],
  },
  {
    param: 'specRefreshRate',
    label: { en: 'Refresh Rate', he: 'קצב רענון' },
    type: 'select',
    options: [
      { value: '60Hz',  label: { en: '60Hz',  he: '60Hz'  } },
      { value: '75Hz',  label: { en: '75Hz',  he: '75Hz'  } },
      { value: '144Hz', label: { en: '144Hz', he: '144Hz' } },
      { value: '165Hz', label: { en: '165Hz', he: '165Hz' } },
      { value: '240Hz', label: { en: '240Hz', he: '240Hz' } },
      { value: '360Hz', label: { en: '360Hz', he: '360Hz' } },
    ],
  },
  {
    param: 'specAdaptiveSync',
    label: { en: 'Adaptive Sync', he: 'סנכרון אדפטיבי' },
    type: 'select',
    options: [
      { value: 'NVIDIA G-Sync',            label: { en: 'NVIDIA G-Sync',           he: 'NVIDIA G-Sync'          } },
      { value: 'NVIDIA G-Sync Ultimate',   label: { en: 'NVIDIA G-Sync Ultimate',  he: 'NVIDIA G-Sync Ultimate' } },
      { value: 'NVIDIA G-Sync Compatible', label: { en: 'G-Sync Compatible',       he: 'G-Sync Compatible'      } },
      { value: 'AMD FreeSync',             label: { en: 'AMD FreeSync',            he: 'AMD FreeSync'           } },
      { value: 'AMD FreeSync Premium',     label: { en: 'AMD FreeSync Premium',    he: 'AMD FreeSync Premium'   } },
      { value: 'AMD FreeSync Premium Pro', label: { en: 'FreeSync Premium Pro',    he: 'FreeSync Premium Pro'   } },
      { value: 'None',                     label: { en: 'None',                    he: 'ללא'                    } },
    ],
  },
  {
    param: 'specUsage',
    label: { en: 'Usage', he: 'שימוש' },
    type: 'select',
    options: [
      { value: 'Gaming',       label: { en: 'Gaming',       he: 'גיימינג'   } },
      { value: 'Office',       label: { en: 'Office',       he: 'משרד'      } },
      { value: 'Creator',      label: { en: 'Creator',      he: 'קריאטיב'   } },
      { value: 'Professional', label: { en: 'Professional', he: 'מקצועי'    } },
      { value: 'Universal',    label: { en: 'Universal',    he: 'אוניברסלי' } },
    ],
  },
  // Boolean toggles
  { param: 'specCurved',    label: { en: 'Curved',            he: 'מעוקל'          }, type: 'toggle', trueValue: 'true' },
  { param: 'specUltrawide', label: { en: 'Ultrawide',         he: 'אולטרה-רחב'     }, type: 'toggle', trueValue: 'true' },
  { param: 'specHdr',       label: { en: 'HDR',               he: 'HDR'            }, type: 'toggle', trueValue: 'true' },
  { param: 'specSpeakers',  label: { en: 'Built-in Speakers', he: 'רמקולים מובנים' }, type: 'toggle', trueValue: 'true' },
  { param: 'specHeightAdj', label: { en: 'Height Adjustable', he: 'גובה מתכוונן'   }, type: 'toggle', trueValue: 'true' },
  { param: 'specVesa',      label: { en: 'VESA Mount',        he: 'הרכבת VESA'     }, type: 'toggle', trueValue: 'true' },
];

const PRICE_RANGES = [
  { label: { en: 'Under $150',      he: 'עד $150'       }, min: 0,    max: 150   },
  { label: { en: '$150 – $300',     he: '$150 – $300'   }, min: 150,  max: 300   },
  { label: { en: '$300 – $500',     he: '$300 – $500'   }, min: 300,  max: 500   },
  { label: { en: '$500 – $1,000',   he: '$500 – $1,000' }, min: 500,  max: 1000  },
  { label: { en: '$1,000 and above', he: '$1,000 ומעלה' }, min: 1000, max: Infinity },
];

module.exports = {
  SPEC_PARAM_MAP,
  FILTER_GROUPS,
  PRICE_RANGES,
  VALID_SCREEN_SIZES,
  VALID_RESOLUTIONS,
  VALID_PANEL_TYPES,
  VALID_REFRESH_RATES,
  VALID_RESPONSE_TIMES,
  VALID_ASPECT_RATIOS,
  VALID_ADAPTIVE_SYNCS,
  VALID_USAGES,
};
