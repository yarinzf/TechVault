// Per-category brand list shown in the brand strip above the product grid.
// Only brands in this list get pills; clicking one applies the brand filter.
export const CATEGORY_BRANDS = {
  monitors:         ['LG', 'Samsung', 'ASUS', 'Dell', 'AOC', 'Gigabyte', 'MSI', 'BenQ', 'ViewSonic'],
  keyboards:        ['Logitech', 'Razer', 'Corsair', 'SteelSeries', 'HyperX', 'Keychron', 'ASUS', 'MSI'],
  mice:             ['Logitech', 'Razer', 'SteelSeries', 'Corsair', 'Zowie', 'HyperX', 'Endgame Gear', 'Glorious'],
  headphones:       ['HyperX', 'SteelSeries', 'Razer', 'Logitech', 'Corsair', 'Astro', 'Sony', 'Sennheiser'],
  laptops:          ['ASUS', 'Lenovo', 'HP', 'Dell', 'MSI', 'Acer', 'Apple', 'Microsoft'],
  components:       ['NVIDIA', 'AMD', 'Intel', 'Corsair', 'ASUS', 'MSI', 'Gigabyte', 'G.Skill', 'be quiet!'],
  storage:          ['Samsung', 'WD', 'Seagate', 'Crucial', 'Kingston', 'Sabrent', 'Lexar', 'SK Hynix'],
  'gaming-chairs':  ['DXRacer', 'Secretlab', 'NOBLECHAIRS', 'AndaSeat', 'Corsair', 'Herman Miller'],
  accessories:      ['Logitech', 'Razer', 'Corsair', 'SteelSeries', 'HyperX', 'Elgato', 'Anker'],
  desktops:         ['HP', 'Dell', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Apple', 'Intel'],
};

// All URL query param names owned by each category.
// Used to: (a) clean stale params on category switch, (b) compute active-filter count,
// (c) render generic chips in the sort bar, (d) pass spec params to the API.
export const CATEGORY_SPEC_PARAMS = {
  keyboards: [
    'specKeyboardType', 'specLayout', 'specConnection', 'specSwitchType',
    'specLanguage', 'specBacklight', 'specUsage',
    'specRgb', 'specNumpad', 'specWireless', 'specBluetooth', 'specHotSwap',
    'trending', 'bestSeller',
  ],
  monitors: [
    'specScreenSize', 'specResolution', 'specPanelType', 'specRefreshRate',
    'specAdaptiveSync', 'specUsage',
    'specCurved', 'specUltrawide', 'specHdr', 'specSpeakers', 'specHeightAdj',
  ],
  mice: [
    'specMouseType', 'specSensor', 'specHandOrientation', 'specPollingRate', 'specGripStyle',
    'specConnection', 'specRgb', 'specUsage',
  ],
  headphones: [
    'specHeadphoneType', 'specConnection', 'specUsage',
    'specMicrophone', 'specNoiseCancellation', 'specSurroundSound',
  ],
  desktops: [
    'specCpuBrand', 'specRam', 'specStorageType', 'specGraphics',
    'specOs', 'specFormFactor', 'specUsage', 'specWifi',
  ],
  laptops: [
    'specProcessor', 'specRam', 'specStorageSize', 'specGpu', 'specOs',
    'specScreenSize', 'specRefreshRate', 'specUsage',
  ],
  components: [
    'specComponentType', 'specSocket', 'specFormFactor', 'specWattage',
  ],
  storage: [
    'specStorageType', 'specCapacity', 'specInterface', 'specRpm',
  ],
  'gaming-chairs': [
    'specMaterial', 'specMaxWeight', 'specRecline', 'specLumbar',
  ],
  accessories: [
    'specAccessoryType', 'specConnection', 'specUsage',
  ],
};

// Collapsible filter group definitions per category.
// The Sidebar renders these generically — no per-category JSX needed in CatalogPage.
//
// Each group: { key, label, items[] }
// Select item:  { type: 'select', param, allLabel, options: [{value, label}] }
// Toggle item:  { type: 'toggle', param, label }
export const CATEGORY_FILTER_GROUPS = {
  keyboards: [
    {
      key: 'kbType', label: 'סוג מקלדת',
      items: [{ type: 'select', param: 'specKeyboardType', allLabel: 'הכל',
        options: [
          { value: 'Mechanical',  label: 'Mechanical'  },
          { value: 'Membrane',    label: 'Membrane'    },
          { value: 'Optical',     label: 'Optical'     },
          { value: 'Low Profile', label: 'Low Profile' },
          { value: 'Ergonomic',   label: 'Ergonomic'   },
          { value: 'Scissor',     label: 'Scissor'     },
        ],
      }],
    },
    {
      key: 'kbLayout', label: 'פריסה',
      items: [{ type: 'select', param: 'specLayout', allLabel: 'הכל',
        options: [
          { value: 'Full Size', label: 'Full Size (104 keys)' },
          { value: 'TKL',       label: 'TKL (Tenkeyless)'    },
          { value: '75%',       label: '75%'                 },
          { value: '65%',       label: '65%'                 },
          { value: '60%',       label: '60%'                 },
          { value: 'Ergonomic', label: 'Ergonomic / Split'   },
        ],
      }],
    },
    {
      key: 'kbConn', label: 'חיבור',
      items: [{ type: 'select', param: 'specConnection', allLabel: 'הכל',
        options: [
          { value: 'Wired',      label: 'Wired'      },
          { value: 'Wireless',   label: 'Wireless'   },
          { value: 'Multi-mode', label: 'Multi-mode' },
        ],
      }],
    },
    {
      key: 'kbSwitch', label: 'מתגים',
      items: [{ type: 'select', param: 'specSwitchType', allLabel: 'הכל',
        options: [
          { value: 'Red',         label: 'Red (Linear)'   },
          { value: 'Brown',       label: 'Brown (Tactile)' },
          { value: 'Blue',        label: 'Blue (Clicky)'  },
          { value: 'Optical Red', label: 'Optical Red'    },
          { value: 'Silent',      label: 'Silent'         },
          { value: 'Membrane',    label: 'Membrane'       },
        ],
      }],
    },
    {
      key: 'kbUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Gaming',      label: 'Gaming'      },
          { value: 'Office',      label: 'Office'      },
          { value: 'Programming', label: 'Programming' },
          { value: 'Universal',   label: 'Universal'   },
        ],
      }],
    },
    {
      key: 'kbLang', label: 'שפה',
      items: [{ type: 'select', param: 'specLanguage', allLabel: 'הכל',
        options: [
          { value: 'Hebrew + English', label: 'עברית + אנגלית' },
          { value: 'English Only',     label: 'אנגלית בלבד'    },
        ],
      }],
    },
    {
      key: 'kbLight', label: 'תאורת גב',
      items: [{ type: 'select', param: 'specBacklight', allLabel: 'הכל',
        options: [
          { value: 'RGB',   label: 'RGB'   },
          { value: 'White', label: 'לבן'   },
          { value: 'None',  label: 'ללא'   },
        ],
      }],
    },
    {
      key: 'kbFeatures', label: 'מאפיינים',
      items: [
        { type: 'toggle', param: 'specRgb',       label: 'RGB'       },
        { type: 'toggle', param: 'specNumpad',    label: 'נומפד'     },
        { type: 'toggle', param: 'specWireless',  label: 'אלחוטי'    },
        { type: 'toggle', param: 'specBluetooth', label: 'Bluetooth' },
        { type: 'toggle', param: 'specHotSwap',   label: 'Hot Swap'  },
      ],
    },
    {
      key: 'kbPopular', label: 'פופולריות',
      items: [
        { type: 'toggle', param: 'bestSeller', label: 'רב-מכר'  },
        { type: 'toggle', param: 'trending',   label: 'טרנדינג' },
      ],
    },
  ],

  monitors: [
    {
      key: 'mnSize', label: 'גודל מסך',
      items: [{ type: 'select', param: 'specScreenSize', allLabel: 'הכל',
        options: [
          { value: '24"', label: '24"' },
          { value: '27"', label: '27"' },
          { value: '32"', label: '32"' },
          { value: '34"', label: '34"' },
          { value: '38"', label: '38"' },
          { value: '43"', label: '43"' },
          { value: '49"', label: '49"' },
        ],
      }],
    },
    {
      key: 'mnRes', label: 'רזולוציה',
      items: [{ type: 'select', param: 'specResolution', allLabel: 'הכל',
        options: [
          { value: 'Full HD',       label: 'Full HD (1080p)'  },
          { value: 'QHD',           label: 'QHD (1440p)'      },
          { value: 'UltraWide QHD', label: 'UltraWide QHD'   },
          { value: '4K UHD',        label: '4K UHD (2160p)'  },
          { value: 'Dual QHD',      label: 'Dual QHD'        },
          { value: '5K',            label: '5K'              },
        ],
      }],
    },
    {
      key: 'mnPanel', label: 'סוג פאנל',
      items: [{ type: 'select', param: 'specPanelType', allLabel: 'הכל',
        options: [
          { value: 'IPS',      label: 'IPS'     },
          { value: 'VA',       label: 'VA'      },
          { value: 'TN',       label: 'TN'      },
          { value: 'OLED',     label: 'OLED'    },
          { value: 'QD-OLED',  label: 'QD-OLED' },
          { value: 'Mini LED', label: 'Mini LED' },
        ],
      }],
    },
    {
      key: 'mnHz', label: 'קצב רענון',
      items: [{ type: 'select', param: 'specRefreshRate', allLabel: 'הכל',
        options: [
          { value: '60Hz',  label: '60Hz'  },
          { value: '75Hz',  label: '75Hz'  },
          { value: '144Hz', label: '144Hz' },
          { value: '165Hz', label: '165Hz' },
          { value: '240Hz', label: '240Hz' },
          { value: '360Hz', label: '360Hz' },
        ],
      }],
    },
    {
      key: 'mnSync', label: 'סנכרון אדפטיבי',
      items: [{ type: 'select', param: 'specAdaptiveSync', allLabel: 'הכל',
        options: [
          { value: 'NVIDIA G-Sync',            label: 'NVIDIA G-Sync'        },
          { value: 'NVIDIA G-Sync Ultimate',   label: 'G-Sync Ultimate'      },
          { value: 'NVIDIA G-Sync Compatible', label: 'G-Sync Compatible'    },
          { value: 'AMD FreeSync Premium',     label: 'FreeSync Premium'     },
          { value: 'AMD FreeSync Premium Pro', label: 'FreeSync Premium Pro' },
          { value: 'None',                     label: 'ללא'                  },
        ],
      }],
    },
    {
      key: 'mnUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Gaming',       label: 'גיימינג'   },
          { value: 'Office',       label: 'משרד'      },
          { value: 'Creator',      label: 'קריאטיב'   },
          { value: 'Professional', label: 'מקצועי'    },
          { value: 'Universal',    label: 'אוניברסלי' },
        ],
      }],
    },
    {
      key: 'mnFeatures', label: 'מאפיינים',
      items: [
        { type: 'toggle', param: 'specCurved',    label: 'מסך מעוקל'      },
        { type: 'toggle', param: 'specUltrawide', label: 'UltraWide'       },
        { type: 'toggle', param: 'specHdr',       label: 'HDR'             },
        { type: 'toggle', param: 'specSpeakers',  label: 'רמקולים מובנים' },
        { type: 'toggle', param: 'specHeightAdj', label: 'גובה מתכוונן'   },
      ],
    },
  ],

  mice: [
    {
      key: 'msType', label: 'סוג עכבר',
      items: [{ type: 'select', param: 'specMouseType', allLabel: 'הכל',
        options: [
          { value: 'Gaming',       label: 'גיימינג'      },
          { value: 'Office',       label: 'משרד'         },
          { value: 'Ergonomic',    label: 'ארגונומי'     },
          { value: 'Vertical',     label: 'אנכי'         },
          { value: 'MMO',          label: 'MMO'          },
          { value: 'Travel',       label: 'נסיעות'       },
          { value: 'Productivity', label: 'פרודוקטיביטי' },
        ],
      }],
    },
    {
      key: 'msSensor', label: 'חיישן',
      items: [{ type: 'select', param: 'specSensor', allLabel: 'הכל',
        options: [
          { value: 'Optical',    label: 'Optical'    },
          { value: 'Laser',      label: 'Laser'      },
          { value: 'HERO',       label: 'HERO'       },
          { value: 'Focus Pro',  label: 'Focus Pro'  },
          { value: 'TrueMove',   label: 'TrueMove'   },
          { value: 'PixArt',     label: 'PixArt'     },
          { value: 'BlueTrack',  label: 'BlueTrack'  },
        ],
      }],
    },
    {
      key: 'msHand', label: 'כף יד',
      items: [{ type: 'select', param: 'specHandOrientation', allLabel: 'הכל',
        options: [
          { value: 'Right-handed', label: 'ימנית'      },
          { value: 'Left-handed',  label: 'שמאלית'     },
          { value: 'Ambidextrous', label: 'דו-כיוונית' },
        ],
      }],
    },
    {
      key: 'msPoll', label: 'קצב סקירה',
      items: [{ type: 'select', param: 'specPollingRate', allLabel: 'הכל',
        options: [
          { value: '125Hz',  label: '125Hz'  },
          { value: '500Hz',  label: '500Hz'  },
          { value: '1000Hz', label: '1000Hz' },
          { value: '2000Hz', label: '2000Hz' },
          { value: '4000Hz', label: '4000Hz' },
          { value: '8000Hz', label: '8000Hz' },
        ],
      }],
    },
    {
      key: 'msGrip', label: 'סגנון אחיזה',
      items: [{ type: 'select', param: 'specGripStyle', allLabel: 'הכל',
        options: [
          { value: 'Palm',      label: 'Palm'      },
          { value: 'Claw',      label: 'Claw'      },
          { value: 'Fingertip', label: 'Fingertip' },
          { value: 'Universal', label: 'Universal' },
        ],
      }],
    },
    {
      key: 'msConn', label: 'חיבור',
      items: [{ type: 'select', param: 'specConnection', allLabel: 'הכל',
        options: [
          { value: 'Wired',      label: 'כבל'       },
          { value: 'Wireless',   label: 'אלחוטי'    },
          { value: 'Bluetooth',  label: 'Bluetooth' },
          { value: 'Multi-mode', label: 'Multi-mode' },
        ],
      }],
    },
    {
      key: 'msUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Gaming',       label: 'גיימינג'      },
          { value: 'Esports',      label: 'אי-ספורט'     },
          { value: 'Office',       label: 'משרד'         },
          { value: 'Productivity', label: 'פרודוקטיביטי' },
          { value: 'Travel',       label: 'נסיעות'       },
          { value: 'MMO',          label: 'MMO'          },
          { value: 'Creator',      label: 'קריאטיב'      },
        ],
      }],
    },
    {
      key: 'msRgb', label: 'תאורה',
      items: [
        { type: 'toggle', param: 'specRgb', label: 'RGB' },
      ],
    },
  ],

  headphones: [
    {
      key: 'hpType', label: 'סוג',
      items: [{ type: 'select', param: 'specHeadphoneType', allLabel: 'הכל',
        options: [
          { value: 'Over-Ear',        label: 'Over-Ear (על-אוזן)'  },
          { value: 'On-Ear',          label: 'On-Ear'               },
          { value: 'In-Ear',          label: 'In-Ear (תוך-אוזן)'  },
          { value: 'True Wireless',   label: 'True Wireless (TWS)'  },
          { value: 'Gaming Headset',  label: 'Gaming Headset'       },
          { value: 'Bone Conduction', label: 'Bone Conduction'      },
          { value: 'Earbuds',         label: 'Earbuds'              },
        ],
      }],
    },
    {
      key: 'hpConn', label: 'חיבור',
      items: [{ type: 'select', param: 'specConnection', allLabel: 'הכל',
        options: [
          { value: 'Wired',           label: 'Wired (כבל)'      },
          { value: 'Bluetooth',       label: 'Bluetooth'         },
          { value: '2.4GHz Wireless', label: 'אלחוטי 2.4GHz'   },
          { value: 'USB',             label: 'USB'               },
          { value: 'USB-C Wired',     label: 'USB-C'             },
          { value: 'True Wireless',   label: 'True Wireless'     },
        ],
      }],
    },
    {
      key: 'hpUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Gaming',  label: 'גיימינג'  },
          { value: 'Music',   label: 'מוזיקה'   },
          { value: 'Sport',   label: 'ספורט'    },
          { value: 'Office',  label: 'משרד'     },
          { value: 'Studio',  label: 'סטודיו'   },
          { value: 'Travel',  label: 'נסיעות'   },
          { value: 'Calls',   label: 'שיחות'    },
        ],
      }],
    },
    {
      key: 'hpMic', label: 'מיקרופון',
      items: [{ type: 'select', param: 'specMicrophone', allLabel: 'הכל',
        options: [
          { value: 'Built-in',    label: 'מובנה'          },
          { value: 'Detachable',  label: 'נשלף'           },
          { value: 'Boom Mic',    label: 'Boom Mic'        },
          { value: 'Retractable', label: 'מתקפל'          },
        ],
      }],
    },
    {
      key: 'hpAnc', label: 'ביטול רעשים',
      items: [{ type: 'select', param: 'specNoiseCancellation', allLabel: 'הכל',
        options: [
          { value: 'Passive',    label: 'פסיבי'              },
          { value: 'ANC',        label: 'ANC (אקטיבי)'       },
          { value: 'Hybrid ANC', label: 'Hybrid ANC'          },
          { value: 'ENC',        label: 'ENC (מיקרופון)'     },
        ],
      }],
    },
    {
      key: 'hpSurround', label: 'סראונד',
      items: [{ type: 'select', param: 'specSurroundSound', allLabel: 'הכל',
        options: [
          { value: 'Yes',           label: 'כן'               },
          { value: '7.1',           label: 'סראונד 7.1'       },
          { value: 'Simulated 7.1', label: 'וירטואלי 7.1'    },
        ],
      }],
    },
  ],

  laptops: [
    {
      key: 'ltCpu', label: 'מעבד',
      items: [{ type: 'select', param: 'specProcessor', allLabel: 'הכל',
        options: [
          { value: 'Intel Core i5', label: 'Intel Core i5' },
          { value: 'Intel Core i7', label: 'Intel Core i7' },
          { value: 'Intel Core i9', label: 'Intel Core i9' },
          { value: 'AMD Ryzen 5',   label: 'AMD Ryzen 5'   },
          { value: 'AMD Ryzen 7',   label: 'AMD Ryzen 7'   },
          { value: 'AMD Ryzen 9',   label: 'AMD Ryzen 9'   },
          { value: 'Apple M2',      label: 'Apple M2'      },
          { value: 'Apple M3',      label: 'Apple M3'      },
        ],
      }],
    },
    {
      key: 'ltRam', label: 'זיכרון RAM',
      items: [{ type: 'select', param: 'specRam', allLabel: 'הכל',
        options: [
          { value: '8GB',  label: '8GB'  },
          { value: '16GB', label: '16GB' },
          { value: '32GB', label: '32GB' },
          { value: '64GB', label: '64GB' },
        ],
      }],
    },
    {
      key: 'ltStorage', label: 'אחסון',
      items: [{ type: 'select', param: 'specStorageSize', allLabel: 'הכל',
        options: [
          { value: '256GB', label: '256GB' },
          { value: '512GB', label: '512GB' },
          { value: '1TB',   label: '1TB'   },
          { value: '2TB',   label: '2TB'   },
        ],
      }],
    },
    {
      key: 'ltOs', label: 'מערכת הפעלה',
      items: [{ type: 'select', param: 'specOs', allLabel: 'הכל',
        options: [
          { value: 'Windows', label: 'Windows' },
          { value: 'macOS',   label: 'macOS'   },
          { value: 'Linux',   label: 'Linux'   },
        ],
      }],
    },
    {
      key: 'ltScreen', label: 'גודל מסך',
      items: [{ type: 'select', param: 'specScreenSize', allLabel: 'הכל',
        options: [
          { value: '13"', label: '13"' },
          { value: '14"', label: '14"' },
          { value: '15"', label: '15"' },
          { value: '16"', label: '16"' },
          { value: '17"', label: '17"' },
        ],
      }],
    },
    {
      key: 'ltUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Gaming',       label: 'גיימינג'  },
          { value: 'Business',     label: 'עסקים'    },
          { value: 'Creator',      label: 'קריאטיב'  },
          { value: 'Student',      label: 'סטודנט'   },
          { value: 'Professional', label: 'מקצועי'   },
        ],
      }],
    },
  ],

  components: [
    {
      key: 'cpType', label: 'סוג רכיב',
      items: [{ type: 'select', param: 'specComponentType', allLabel: 'הכל',
        options: [
          { value: 'GPU',         label: 'כרטיס מסך (GPU)' },
          { value: 'CPU',         label: 'מעבד (CPU)'       },
          { value: 'RAM',         label: 'זיכרון (RAM)'     },
          { value: 'Motherboard', label: 'לוח אם'           },
          { value: 'PSU',         label: 'ספק כוח (PSU)'    },
          { value: 'Case',        label: 'מארז'             },
          { value: 'Cooler',      label: 'מצנן'             },
        ],
      }],
    },
    {
      key: 'cpSocket', label: 'שקע מעבד',
      items: [{ type: 'select', param: 'specSocket', allLabel: 'הכל',
        options: [
          { value: 'AM5',     label: 'AM5 (AMD)'       },
          { value: 'AM4',     label: 'AM4 (AMD)'       },
          { value: 'LGA1700', label: 'LGA1700 (Intel)' },
          { value: 'LGA1200', label: 'LGA1200 (Intel)' },
        ],
      }],
    },
    {
      key: 'cpForm', label: 'פורם פקטור',
      items: [{ type: 'select', param: 'specFormFactor', allLabel: 'הכל',
        options: [
          { value: 'ATX',  label: 'ATX'  },
          { value: 'mATX', label: 'mATX' },
          { value: 'ITX',  label: 'ITX'  },
        ],
      }],
    },
    {
      key: 'cpWatt', label: 'הספק (PSU)',
      items: [{ type: 'select', param: 'specWattage', allLabel: 'הכל',
        options: [
          { value: '550W',  label: '550W'  },
          { value: '650W',  label: '650W'  },
          { value: '750W',  label: '750W'  },
          { value: '850W',  label: '850W'  },
          { value: '1000W', label: '1000W' },
          { value: '1200W', label: '1200W' },
        ],
      }],
    },
  ],

  storage: [
    {
      key: 'stType', label: 'סוג אחסון',
      items: [{ type: 'select', param: 'specStorageType', allLabel: 'הכל',
        options: [
          { value: 'NVMe M.2', label: 'NVMe M.2 SSD'   },
          { value: 'SATA SSD', label: 'SATA SSD'        },
          { value: 'HDD',      label: 'HDD (דיסק קשיח)' },
          { value: 'Portable', label: 'נייד'            },
        ],
      }],
    },
    {
      key: 'stCap', label: 'נפח',
      items: [{ type: 'select', param: 'specCapacity', allLabel: 'הכל',
        options: [
          { value: '250GB', label: '250GB' },
          { value: '500GB', label: '500GB' },
          { value: '1TB',   label: '1TB'   },
          { value: '2TB',   label: '2TB'   },
          { value: '4TB',   label: '4TB'   },
          { value: '8TB',   label: '8TB'   },
        ],
      }],
    },
    {
      key: 'stInterface', label: 'ממשק',
      items: [{ type: 'select', param: 'specInterface', allLabel: 'הכל',
        options: [
          { value: 'PCIe 4.0', label: 'NVMe PCIe 4.0' },
          { value: 'PCIe 5.0', label: 'NVMe PCIe 5.0' },
          { value: 'SATA',     label: 'SATA'           },
          { value: 'USB',      label: 'USB (נייד)'     },
        ],
      }],
    },
  ],

  'gaming-chairs': [
    {
      key: 'gcMat', label: 'חומר',
      items: [{ type: 'select', param: 'specMaterial', allLabel: 'הכל',
        options: [
          { value: 'PU Leather', label: 'PU עור מלאכותי' },
          { value: 'Fabric',     label: 'בד'              },
          { value: 'Leather',    label: 'עור אמיתי'       },
          { value: 'Mesh',       label: 'רשת'             },
        ],
      }],
    },
    {
      key: 'gcRecline', label: 'הטיית גב',
      items: [{ type: 'select', param: 'specRecline', allLabel: 'הכל',
        options: [
          { value: '90-135', label: '90°–135°'  },
          { value: '90-165', label: '90°–165°'  },
          { value: '180',    label: 'שטוח 180°' },
        ],
      }],
    },
    {
      key: 'gcFeatures', label: 'מאפיינים',
      items: [
        { type: 'toggle', param: 'specLumbar', label: 'תמיכה מותנית' },
      ],
    },
  ],

  accessories: [
    {
      key: 'acType', label: 'סוג אביזר',
      items: [{ type: 'select', param: 'specAccessoryType', allLabel: 'הכל',
        options: [
          { value: 'Mousepad',      label: 'פד עכבר'      },
          { value: 'USB Hub',       label: 'USB Hub'      },
          { value: 'Webcam',        label: 'מצלמת רשת'   },
          { value: 'Headset Stand', label: 'מעמד אוזניות' },
          { value: 'Cable',         label: 'כבל'          },
          { value: 'Desk Mat',      label: 'פד שולחן'     },
        ],
      }],
    },
    {
      key: 'acConn', label: 'חיבור',
      items: [{ type: 'select', param: 'specConnection', allLabel: 'הכל',
        options: [
          { value: 'USB-A',    label: 'USB-A'   },
          { value: 'USB-C',    label: 'USB-C'   },
          { value: 'Wireless', label: 'אלחוטי'  },
        ],
      }],
    },
    {
      key: 'acUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Gaming',       label: 'גיימינג'   },
          { value: 'Office',       label: 'משרד'      },
          { value: 'Streaming',    label: 'סטרימינג'  },
          { value: 'Universal',    label: 'אוניברסלי' },
        ],
      }],
    },
  ],

  desktops: [
    {
      key: 'dtCpu', label: 'יצרן מעבד',
      items: [{ type: 'select', param: 'specCpuBrand', allLabel: 'הכל',
        options: [
          { value: 'Intel', label: 'Intel' },
          { value: 'AMD',   label: 'AMD'   },
        ],
      }],
    },
    {
      key: 'dtRam', label: 'זיכרון RAM',
      items: [{ type: 'select', param: 'specRam', allLabel: 'הכל',
        options: [
          { value: '4GB',   label: '4GB'   },
          { value: '8GB',   label: '8GB'   },
          { value: '16GB',  label: '16GB'  },
          { value: '32GB',  label: '32GB'  },
          { value: '64GB',  label: '64GB'  },
          { value: '128GB', label: '128GB' },
        ],
      }],
    },
    {
      key: 'dtStorage', label: 'סוג אחסון',
      items: [{ type: 'select', param: 'specStorageType', allLabel: 'הכל',
        options: [
          { value: 'HDD',      label: 'דיסק קשיח (HDD)' },
          { value: 'SATA SSD', label: 'SSD SATA'         },
          { value: 'NVMe SSD', label: 'SSD NVMe'         },
        ],
      }],
    },
    {
      key: 'dtGpu', label: 'כרטיס גרפי',
      items: [{ type: 'select', param: 'specGraphics', allLabel: 'הכל',
        options: [
          { value: 'Integrated', label: 'גרפיקה משולבת' },
          { value: 'NVIDIA RTX', label: 'NVIDIA RTX'     },
          { value: 'NVIDIA GTX', label: 'NVIDIA GTX'     },
          { value: 'AMD Radeon', label: 'AMD Radeon'     },
        ],
      }],
    },
    {
      key: 'dtOs', label: 'מערכת הפעלה',
      items: [{ type: 'select', param: 'specOs', allLabel: 'הכל',
        options: [
          { value: 'Windows 11 Home', label: 'Windows 11 Home'    },
          { value: 'Windows 11 Pro',  label: 'Windows 11 Pro'     },
          { value: 'FreeDOS',         label: 'FreeDOS'            },
          { value: 'No OS',           label: 'ללא מערכת הפעלה'   },
        ],
      }],
    },
    {
      key: 'dtForm', label: 'גורם צורה',
      items: [{ type: 'select', param: 'specFormFactor', allLabel: 'הכל',
        options: [
          { value: 'Tower',             label: 'מגדל'          },
          { value: 'Mini Tower',        label: 'מגדל מיני'    },
          { value: 'Small Form Factor', label: 'קומפקטי (SFF)' },
          { value: 'Mini PC',           label: 'מיני PC'       },
          { value: 'All-in-One',        label: 'הכל-באחד'      },
        ],
      }],
    },
    {
      key: 'dtUsage', label: 'שימוש',
      items: [{ type: 'select', param: 'specUsage', allLabel: 'הכל',
        options: [
          { value: 'Office',      label: 'משרד'         },
          { value: 'Business',    label: 'עסקי'         },
          { value: 'Gaming',      label: 'גיימינג'      },
          { value: 'Workstation', label: 'תחנת עבודה'   },
          { value: 'Creator',     label: 'קריאייטיב'    },
          { value: 'Home',        label: 'ביתי'         },
          { value: 'Education',   label: 'חינוך'        },
        ],
      }],
    },
    {
      key: 'dtWifi', label: 'WiFi',
      items: [{ type: 'select', param: 'specWifi', allLabel: 'הכל',
        options: [
          { value: 'No WiFi', label: 'ללא WiFi'       },
          { value: 'WiFi 5',  label: 'WiFi 5'         },
          { value: 'WiFi 6',  label: 'WiFi 6'         },
          { value: 'WiFi 6E', label: 'WiFi 6E'        },
          { value: 'WiFi 7',  label: 'WiFi 7'         },
        ],
      }],
    },
  ],
};
