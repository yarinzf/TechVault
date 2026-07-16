import {
  Monitor, Laptop, Cpu, Keyboard, Mouse, Headphones,
  HardDrive, Gamepad2, Package2, Smartphone, Tablet,
  Speaker, Wifi, Home, CircuitBoard, MemoryStick,
  BatteryCharging, Wind, MousePointer2, Mic,
  Printer, Network, Zap, Server,
} from 'lucide-react';

export const CATEGORY_META = [
  { slug: 'monitors',    labelKey: 'cat.monitors',    heLabel: 'מסכים',           Icon: Monitor        },
  { slug: 'laptops',     labelKey: 'cat.laptops',     heLabel: 'מחשבים ניידים',  Icon: Laptop         },
  { slug: 'desktops',    labelKey: 'cat.desktops',    heLabel: 'מחשבים שולחניים', Icon: Server        },
  { slug: 'components',  labelKey: 'cat.components',  heLabel: 'רכיבים',          Icon: Cpu           },
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

// Sections shown in the categories modal (matches Sapir's grouping).
// `labelKey`/`titleKey` drive the i18n system; `heLabel`/`title` are kept as
// the authoritative Hebrew source the translation values were copied from.
export const MODAL_SECTIONS = [
  {
    title: 'מחשבים ורכיבים', titleKey: 'modal.section_computers',
    items: [
      { slug: 'monitors',   labelKey: 'cat.monitors',              heLabel: 'מסכים',             Icon: Monitor,         count: null },
      { slug: 'desktops',   labelKey: 'cat.desktops',              heLabel: 'מחשבים שולחניים',   Icon: Server,          count: null },
      { slug: 'laptops',    labelKey: 'cat.laptops',               heLabel: 'מחשבים ניידים',     Icon: Laptop,          count: null },
      { slug: 'components', labelKey: 'cat.components',            heLabel: 'רכיבים',             Icon: Cpu,             count: null },
      { slug: 'storage',    labelKey: 'modal.item_storage_ssd',    heLabel: 'אחסון ו-SSD',        Icon: HardDrive,       count: null },
      { slug: 'components', labelKey: 'modal.item_motherboards',   heLabel: 'לוחות אם',      Icon: CircuitBoard,    count: null, subSlug: 'motherboards' },
      { slug: 'components', labelKey: 'modal.item_ram',            heLabel: 'זיכרון RAM',    Icon: MemoryStick,     count: null, subSlug: 'ram' },
      { slug: 'components', labelKey: 'modal.item_psu',            heLabel: 'ספקי כוח',      Icon: BatteryCharging, count: null, subSlug: 'psu' },
      { slug: 'components', labelKey: 'modal.item_cooling',        heLabel: 'קירור ופנים',   Icon: Wind,            count: null, subSlug: 'cooling' },
    ],
  },
  {
    title: 'ציוד היקפי', titleKey: 'modal.section_peripherals',
    items: [
      { slug: 'keyboards',  labelKey: 'cat.keyboards',              heLabel: 'מקלדות',         Icon: Keyboard,        count: null },
      { slug: 'mice',       labelKey: 'cat.mice',                   heLabel: 'עכברים',         Icon: MousePointer2,   count: null },
      { slug: 'headphones', labelKey: 'cat.headphones',             heLabel: 'אוזניות',        Icon: Headphones,      count: null },
      { slug: 'accessories',labelKey: 'modal.item_microphones',     heLabel: 'מיקרופונים',     Icon: Mic,             count: null },
      { slug: 'accessories',labelKey: 'modal.item_mousepads',       heLabel: 'משטחי עכבר',     Icon: Mouse,           count: null },
      { slug: 'accessories',labelKey: 'cat.accessories',            heLabel: 'אביזרים',        Icon: Package2,        count: null },
    ],
  },
  {
    title: 'גיימינג וקונסולות', titleKey: 'modal.section_gaming',
    items: [
      { slug: 'gaming',     labelKey: 'cat.gaming',                 heLabel: 'גיימינג',        Icon: Gamepad2,        count: null },
      { slug: 'gaming',     labelKey: 'modal.item_gaming_accessories', heLabel: 'אביזרי גיימינג', Icon: Zap,          count: null },
    ],
  },
  {
    title: 'רשת ותשתיות', titleKey: 'modal.section_network',
    items: [
      { slug: 'networking', labelKey: 'modal.item_routers',        heLabel: 'ראוטרים',        Icon: Wifi,            count: null },
      { slug: 'networking', labelKey: 'modal.item_switches_lan',   heLabel: 'מתגים ו-LAN',    Icon: Network,         count: null },
      { slug: 'accessories',labelKey: 'modal.item_printing',       heLabel: 'הדפסה',          Icon: Printer,         count: null },
      { slug: 'accessories',labelKey: 'modal.item_gifts',          heLabel: 'מתנות וחבילות',  Icon: Package2,        count: null },
    ],
  },
];

// Primary categories shown in the sticky nav bar (overflow-x: auto handles extras)
export const NAV_CATEGORIES = CATEGORY_META.slice(0, 10);
