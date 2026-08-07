import {
  Monitor, Laptop, Server, Cpu, Keyboard, MousePointer2, Headphones,
  HardDrive, Gamepad2, Package2, Smartphone, Tablet, Speaker, Wifi,
  Box, MonitorSmartphone, CircuitBoard, MemoryStick, BatteryCharging, Wind,
  Fan, Music2, Video, Network, Database, HardDriveDownload, Usb, Save,
  Mouse, Mic, Camera, Share2, Radio, Cable, Armchair, Table2, Disc,
  Joystick, Glasses, RadioTower, Gamepad, Tv, Printer, Zap, Scan, Droplet,
  Watch, Aperture, Lightbulb, Plug, Bell, Radar, Lock, Bot,
} from 'lucide-react';

// Icon per real backend category slug (server/config/categoryTaxonomy.js is
// the canonical structure; this is purely presentational). Display NAMES
// come from getCategoryLabel() (features/products/utils/categoryLabels.js).
// A real category the API returns that isn't listed here still renders,
// using DEFAULT_CATEGORY_ICON — new categories are never hidden.
export const CATEGORY_META = {
  // Main categories
  computers:     Laptop,
  monitors:      Monitor,
  'pc-components': Cpu,
  storage:       HardDrive,
  peripherals:   Keyboard,
  networking:    Wifi,
  gaming:        Gamepad2,
  consoles:      Gamepad,
  smartphones:   Smartphone,
  tablets:       Tablet,
  tvs:           Tv,
  printers:      Printer,

  // Added per Sapir's approved reference — icons match the reference's own
  // lucide identifiers exactly (watch / camera / lightbulb).
  smartwatches:          Watch,
  'cameras-photography': Camera,
  'smart-home':          Lightbulb,

  // Legacy pre-migration slugs — same icon as their canonical replacement
  // (categoryTaxonomy.js LEGACY_CATEGORY_PLAN: headphones -> headsets,
  // components -> pc-components), for a Category document not yet renamed.
  headphones: Headphones,
  components: Cpu,

  // Computers
  laptops:      Laptop,
  desktops:     Server,
  'mini-pc':    Box,
  'all-in-one': MonitorSmartphone,

  // PC Components
  cpus:             Cpu,
  gpus:             Zap,
  motherboards:     CircuitBoard,
  ram:              MemoryStick,
  psus:             BatteryCharging,
  cases:            Box,
  cooling:          Wind,
  fans:             Fan,
  'sound-cards':    Music2,
  'capture-cards':  Video,
  'network-cards':  Network,

  // Storage
  ssd:                HardDrive,
  hdd:                Database,
  'external-drives':  HardDriveDownload,
  'usb-flash-drives': Usb,
  'memory-cards':     Save,

  // Peripherals
  keyboards:    Keyboard,
  mice:         MousePointer2,
  'mouse-pads': Mouse,
  headsets:     Headphones,
  speakers:     Speaker,
  microphones:  Mic,
  webcams:      Camera,

  // Networking
  routers:            Wifi,
  mesh:               Share2,
  switches:            Network,
  'access-points':     Radio,
  'network-adapters':  Cable,

  // Gaming
  'gaming-chairs':  Armchair,
  'gaming-desks':   Table2,
  controllers:      Gamepad2,
  'racing-wheels':  Disc,
  'flight-sticks':  Joystick,
  vr:               Glasses,
  'streaming-gear': RadioTower,

  // Consoles
  playstation:          Gamepad,
  xbox:                 Gamepad2,
  nintendo:             Gamepad,
  'handheld-consoles':  Joystick,

  // Printers
  scanners:    Scan,
  'ink-toner': Droplet,

  // Cameras & Photography
  'action-cameras':          Camera,
  'dash-cameras':            Video,
  'security-cameras':        Camera,
  'digital-cameras':         Camera,
  'photography-accessories': Aperture,

  // Smart Home
  'smart-lighting':              Lightbulb,
  'smart-plugs':                 Plug,
  'smart-home-security-cameras': Video,
  'smart-doorbells':             Bell,
  sensors:                       Radar,
  'smart-locks':                 Lock,
  'robot-vacuums':               Bot,

  // Legacy/deactivated (kept only so old references never crash)
  accessories: Package2,
};

// Fallback icon for a real category slug that isn't in CATEGORY_META above
// (e.g. a brand-new category added directly in the database).
export const DEFAULT_CATEGORY_ICON = Package2;

// Presentational display order for main categories in the "All Categories"
// modal — purely cosmetic; any real main category not listed here (e.g. a
// future addition) still appears, sorted after these by name.
export const MAIN_CATEGORY_ORDER = [
  'computers', 'monitors', 'pc-components', 'storage', 'peripherals',
  'networking', 'gaming', 'consoles', 'smartphones', 'tablets', 'tvs', 'printers',
  // Required insertion order per Sapir's approved reference — must stay last.
  'smartwatches', 'cameras-photography', 'smart-home',
];

// Builds a real main→children tree from the flat category list the API
// returns (GET /products/categories → [{_id, name, slug, parentCategory}]).
// This is the ONLY place that turns the flat list into a tree — the modal
// and the admin category selector both use it, so there is one definition
// of "hierarchy" in the frontend, matching the one true hierarchy the
// backend already encodes via Category.parentCategory.
export function buildCategoryTree(flatCategories) {
  if (!Array.isArray(flatCategories) || flatCategories.length === 0) return [];

  const byId = new Map(flatCategories.map((c) => [String(c._id), { ...c, children: [] }]));
  const mains = [];

  for (const cat of flatCategories) {
    if (!cat.parentCategory) continue;
    const parent = byId.get(String(cat.parentCategory));
    if (parent) parent.children.push(byId.get(String(cat._id)));
  }
  for (const cat of flatCategories) {
    if (!cat.parentCategory) mains.push(byId.get(String(cat._id)));
  }

  const orderIndex = (slug) => {
    const i = MAIN_CATEGORY_ORDER.indexOf(slug);
    return i === -1 ? MAIN_CATEGORY_ORDER.length : i;
  };
  mains.sort((a, b) => orderIndex(a.slug) - orderIndex(b.slug) || a.name.localeCompare(b.name));
  mains.forEach((m) => m.children.sort((a, b) => a.name.localeCompare(b.name)));

  return mains;
}
