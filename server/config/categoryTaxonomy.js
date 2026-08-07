'use strict';

/**
 * Canonical TechVault catalog taxonomy — single source of truth consumed by
 * server/scripts/migrateCatalogCategories.js (structure) and
 * server/services/product.service.js (legacy slug aliases).
 *
 * Only true navigational/catalog entities are represented here. Product
 * attributes/spec filters (e.g. "OLED", "Gaming", panel type, switch type)
 * are intentionally absent — those live in
 * client/src/constants/categoryFilters.js as query-param filters, never as
 * Category documents.
 */

// ── Main categories + their real subcategories ─────────────────────────────────
// `slug`/`name` are canonical. Categories with no `children` (or an empty
// array) are "direct" main categories — products may attach to them directly
// (e.g. Monitors), matching the existing architecture rather than inventing
// structural subcategories for spec-driven groupings like "OLED Monitors".
//
// Note on Printers: the canonical subcategory list technically repeats
// "Printers" as both the main category and a child (see task spec) — that
// collision can't become two Category documents with the same slug. Plain
// printer-device products attach directly to the main `printers` category
// (same pattern as Monitors); only Scanners and Ink & Toner are real
// sibling subcategories.
const CANONICAL_TREE = [
  {
    slug: 'computers', name: 'Computers',
    children: [
      { slug: 'laptops',    name: 'Laptops' },
      { slug: 'desktops',   name: 'Desktops' },
      { slug: 'mini-pc',    name: 'Mini PC' },
      { slug: 'all-in-one', name: 'All-in-One' },
    ],
  },
  { slug: 'monitors', name: 'Monitors', children: [] },
  {
    slug: 'pc-components', name: 'PC Components',
    children: [
      { slug: 'cpus',           name: 'CPUs' },
      { slug: 'gpus',           name: 'GPUs' },
      { slug: 'motherboards',   name: 'Motherboards' },
      { slug: 'ram',            name: 'RAM' },
      { slug: 'psus',           name: 'PSUs' },
      { slug: 'cases',          name: 'Cases' },
      { slug: 'cooling',        name: 'Cooling' },
      { slug: 'fans',           name: 'Fans' },
      { slug: 'sound-cards',    name: 'Sound Cards' },
      { slug: 'capture-cards',  name: 'Capture Cards' },
      { slug: 'network-cards',  name: 'Network Cards' },
    ],
  },
  {
    slug: 'storage', name: 'Storage',
    children: [
      { slug: 'ssd',              name: 'SSD' },
      { slug: 'hdd',              name: 'HDD' },
      { slug: 'external-drives',  name: 'External Drives' },
      { slug: 'usb-flash-drives', name: 'USB Flash Drives' },
      { slug: 'memory-cards',     name: 'Memory Cards' },
    ],
  },
  {
    slug: 'peripherals', name: 'Peripherals',
    children: [
      { slug: 'keyboards',   name: 'Keyboards' },
      { slug: 'mice',        name: 'Mice' },
      { slug: 'mouse-pads',  name: 'Mouse Pads' },
      { slug: 'headsets',    name: 'Headsets' },
      { slug: 'speakers',    name: 'Speakers' },
      { slug: 'microphones', name: 'Microphones' },
      { slug: 'webcams',     name: 'Webcams' },
    ],
  },
  {
    slug: 'networking', name: 'Networking',
    children: [
      { slug: 'routers',          name: 'Routers' },
      { slug: 'mesh',             name: 'Mesh' },
      { slug: 'switches',         name: 'Switches' },
      { slug: 'access-points',    name: 'Access Points' },
      { slug: 'network-adapters', name: 'Network Adapters' },
    ],
  },
  {
    slug: 'gaming', name: 'Gaming',
    children: [
      { slug: 'gaming-chairs', name: 'Gaming Chairs' },
      { slug: 'gaming-desks',  name: 'Gaming Desks' },
      { slug: 'controllers',   name: 'Controllers' },
      { slug: 'racing-wheels', name: 'Racing Wheels' },
      { slug: 'flight-sticks', name: 'Flight Sticks' },
      { slug: 'vr',            name: 'VR' },
      { slug: 'streaming-gear',name: 'Streaming Gear' },
    ],
  },
  {
    slug: 'consoles', name: 'Consoles',
    children: [
      { slug: 'playstation',       name: 'PlayStation' },
      { slug: 'xbox',              name: 'Xbox' },
      { slug: 'nintendo',          name: 'Nintendo' },
      { slug: 'handheld-consoles', name: 'Handheld Consoles' },
    ],
  },
  { slug: 'smartphones', name: 'Smartphones', children: [] },
  { slug: 'tablets',     name: 'Tablets',     children: [] },
  { slug: 'tvs',         name: 'TVs',         children: [] },
  {
    slug: 'printers', name: 'Printers',
    children: [
      { slug: 'scanners',  name: 'Scanners' },
      { slug: 'ink-toner', name: 'Ink & Toner' },
    ],
  },
];

// ── Legacy → canonical mapping for the old flat categories ─────────────────────
// 'reparent'  — same slug/name, just gains a parentCategory (products keep
//               referencing the same Category _id; nothing else changes).
// 'rename'    — slug/name change in place (same _id) because the canonical
//               slug differs; old slug becomes an alias (see
//               LEGACY_CATEGORY_ALIASES below). Products keep referencing
//               the same Category _id, so no Product documents are touched.
// 'unchanged' — already matches the canonical main category as-is.
// 'deactivate'— reviewed and intentionally NOT part of the canonical tree
//               (see migrateCatalogCategories.js report); document is kept
//               (isActive:false) rather than deleted, so any existing
//               product references remain valid.
const LEGACY_CATEGORY_PLAN = {
  laptops:     { action: 'reparent',  parentSlug: 'computers' },
  desktops:    { action: 'reparent',  parentSlug: 'computers' },
  keyboards:   { action: 'reparent',  parentSlug: 'peripherals' },
  mice:        { action: 'reparent',  parentSlug: 'peripherals' },
  speakers:    { action: 'reparent',  parentSlug: 'peripherals' },
  headphones:  { action: 'rename',    newSlug: 'headsets', newName: 'Headsets', parentSlug: 'peripherals' },
  components:  { action: 'rename',    newSlug: 'pc-components', newName: 'PC Components', parentSlug: null },
  monitors:    { action: 'unchanged' },
  smartphones: { action: 'unchanged' },
  tablets:     { action: 'unchanged' },
  gaming:      { action: 'unchanged' },
  networking:  { action: 'unchanged' },
  storage:     { action: 'unchanged' },
  accessories: { action: 'deactivate', reason: 'No canonical home in the requested taxonomy and zero products reference it — reviewed and intentionally left out rather than guessed into "Peripherals".' },
  'smart-home':{ action: 'deactivate', reason: 'Explicitly listed as a future/optional category in the task brief, not part of this canonical structure. Zero products reference it.' },
};

// Old slug → current canonical slug. Used by the backend to resolve requests
// against the old URL/API slug (e.g. ?category=headphones) to the renamed
// category, and by the frontend to redirect old category URLs.
const LEGACY_CATEGORY_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(LEGACY_CATEGORY_PLAN)
      .filter(([, plan]) => plan.action === 'rename')
      .map(([oldSlug, plan]) => [oldSlug, plan.newSlug])
  )
);

module.exports = { CANONICAL_TREE, LEGACY_CATEGORY_PLAN, LEGACY_CATEGORY_ALIASES };
