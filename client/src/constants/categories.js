import {
  Monitor, Laptop, Cpu, Keyboard, Mouse, Headphones,
  HardDrive, Gamepad2, Package2, Smartphone, Tablet,
  Speaker, Wifi, Home, CircuitBoard, MemoryStick,
  BatteryCharging, Wind, MousePointer2, Mic,
  Printer, Network, Zap,
} from 'lucide-react';

export const CATEGORY_META = [
  { slug: 'monitors',    labelKey: 'cat.monitors',    heLabel: 'מסכים',         Icon: Monitor        },
  { slug: 'laptops',     labelKey: 'cat.laptops',     heLabel: 'מחשבים',        Icon: Laptop         },
  { slug: 'components',  labelKey: 'cat.components',  heLabel: 'רכיבים',        Icon: Cpu            },
  { slug: 'keyboards',   labelKey: 'cat.keyboards',   heLabel: 'מקלדות',        Icon: Keyboard       },
  { slug: 'mice',        labelKey: 'cat.mice',        heLabel: 'עכברים',        Icon: Mouse          },
  { slug: 'headphones',  labelKey: 'cat.headphones',  heLabel: 'אוזניות',       Icon: Headphones     },
  { slug: 'storage',     labelKey: 'cat.storage',     heLabel: 'אחסון',         Icon: HardDrive      },
  { slug: 'gaming',      labelKey: 'cat.gaming',      heLabel: 'גיימינג',       Icon: Gamepad2       },
  { slug: 'accessories', labelKey: 'cat.accessories', heLabel: 'אביזרים',       Icon: Package2       },
  { slug: 'smartphones', labelKey: 'cat.smartphones', heLabel: 'סמארטפונים',    Icon: Smartphone     },
  { slug: 'tablets',     labelKey: 'cat.tablets',     heLabel: 'טאבלטים',       Icon: Tablet         },
  { slug: 'speakers',    labelKey: 'cat.speakers',    heLabel: 'רמקולים',       Icon: Speaker        },
  { slug: 'networking',  labelKey: 'cat.networking',  heLabel: 'נטוורקינג',     Icon: Wifi           },
  { slug: 'smart-home',  labelKey: 'cat.smart_home',  heLabel: 'בית חכם',       Icon: Home           },
];

// Sections shown in the categories modal (matches Sapir's grouping)
export const MODAL_SECTIONS = [
  {
    title: 'מחשבים ורכיבים',
    items: [
      { slug: 'monitors',   heLabel: 'מסכים',         Icon: Monitor,         count: null },
      { slug: 'components', heLabel: 'רכיבים',        Icon: Cpu,             count: null },
      { slug: 'laptops',    heLabel: 'מחשבים ניידים', Icon: Laptop,          count: null },
      { slug: 'storage',    heLabel: 'אחסון ו-SSD',   Icon: HardDrive,       count: null },
      { slug: 'components', heLabel: 'לוחות אם',      Icon: CircuitBoard,    count: null, subSlug: 'motherboards' },
      { slug: 'components', heLabel: 'זיכרון RAM',    Icon: MemoryStick,     count: null, subSlug: 'ram' },
      { slug: 'components', heLabel: 'ספקי כוח',      Icon: BatteryCharging, count: null, subSlug: 'psu' },
      { slug: 'components', heLabel: 'קירור ופנים',   Icon: Wind,            count: null, subSlug: 'cooling' },
    ],
  },
  {
    title: 'ציוד היקפי',
    items: [
      { slug: 'keyboards',  heLabel: 'מקלדות',         Icon: Keyboard,        count: null },
      { slug: 'mice',       heLabel: 'עכברים',         Icon: MousePointer2,   count: null },
      { slug: 'headphones', heLabel: 'אוזניות',        Icon: Headphones,      count: null },
      { slug: 'accessories',heLabel: 'מיקרופונים',     Icon: Mic,             count: null },
      { slug: 'accessories',heLabel: 'משטחי עכבר',     Icon: Mouse,           count: null },
      { slug: 'accessories',heLabel: 'אביזרים',        Icon: Package2,        count: null },
    ],
  },
  {
    title: 'גיימינג וקונסולות',
    items: [
      { slug: 'gaming',     heLabel: 'גיימינג',        Icon: Gamepad2,        count: null },
      { slug: 'gaming',     heLabel: 'אביזרי גיימינג', Icon: Zap,             count: null },
    ],
  },
  {
    title: 'רשת ותשתיות',
    items: [
      { slug: 'networking', heLabel: 'ראוטרים',        Icon: Wifi,            count: null },
      { slug: 'networking', heLabel: 'מתגים ו-LAN',    Icon: Network,         count: null },
      { slug: 'accessories',heLabel: 'הדפסה',          Icon: Printer,         count: null },
      { slug: 'accessories',heLabel: 'מתנות וחבילות',  Icon: Package2,        count: null },
    ],
  },
];

// Primary 9 shown in the sticky category nav bar
export const NAV_CATEGORIES = CATEGORY_META.slice(0, 9);
