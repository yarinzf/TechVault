#!/usr/bin/env node
'use strict';

/**
 * Seed script — populates the development database with demo data.
 *
 * Usage:
 *   node server/scripts/seed.js              # seed (safe: skips if data exists)
 *   node server/scripts/seed.js --force      # drop existing collections first
 *
 * Requires MONGO_URI_DEV to be set (loaded from .env automatically).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

process.env.NODE_ENV = 'development';

const mongoose  = require('mongoose');
const crypto    = require('crypto');
const { connectDB } = require('../config/db');

const User     = require('../models/User');
const Category = require('../models/Category');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const Coupon   = require('../models/Coupon');
const Review   = require('../models/Review');
const Notification = require('../models/Notification');

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

const log  = (msg) => console.log(c.green('✓') + ' ' + msg);
const warn = (msg) => console.log(c.yellow('⚠') + ' ' + msg);
const info = (msg) => console.log(c.dim('  ' + msg));

const randHex = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const orderNum = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${date}-${randHex()}`;
};
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Laptops',     slug: 'laptops',     description: 'Portable computers for work and play' },
  { name: 'Smartphones', slug: 'smartphones', description: 'Latest mobile devices' },
  { name: 'Tablets',     slug: 'tablets',     description: 'Touchscreen tablets for work and entertainment' },
  { name: 'Gaming',      slug: 'gaming',      description: 'Consoles, handhelds, and gaming peripherals' },
  { name: 'Monitors',    slug: 'monitors',    description: 'Desktop and gaming displays' },
  { name: 'Keyboards',   slug: 'keyboards',   description: 'Mechanical and wireless keyboards' },
  { name: 'Mice',        slug: 'mice',        description: 'Precision wired and wireless mice' },
  { name: 'Headphones',  slug: 'headphones',  description: 'Over-ear, on-ear, and in-ear headphones' },
  { name: 'Speakers',    slug: 'speakers',    description: 'Portable and smart speakers' },
  { name: 'Storage',     slug: 'storage',     description: 'SSDs, HDDs, and portable drives' },
  { name: 'Components',  slug: 'components',  description: 'GPUs, CPUs, RAM, and motherboards' },
  { name: 'Networking',  slug: 'networking',  description: 'Routers, switches, and NAS devices' },
  { name: 'Smart Home',  slug: 'smart-home',  description: 'Smart speakers, displays, and automation' },
  { name: 'Desktops',    slug: 'desktops',    description: 'Branded desktop PCs — Lenovo, HP, Dell, ASUS, MSI' },
  { name: 'Accessories', slug: 'accessories', description: 'Cables, hubs, cases, and peripherals' },
];

// ─── Users ────────────────────────────────────────────────────────────────────
const USERS = [
  { name: 'Super Admin',       email: 'superadmin@techvault.dev', password: 'Admin123!', role: 'superadmin', isActive: true },
  { name: 'Admin User',        email: 'admin@techvault.dev',      password: 'Admin123!', role: 'admin',      isActive: true },
  { name: 'Warehouse Manager', email: 'warehouse@techvault.dev',  password: 'Admin123!', role: 'warehouse',  isActive: true },
  {
    name: 'Alice Johnson', email: 'alice@example.com', password: 'User123!', role: 'user', isActive: true,
    addresses: [{ label: 'Home', street: '10 Dizengoff St', city: 'Tel Aviv', zip: '64332', country: 'IL', isDefault: true }],
  },
  {
    name: 'Bob Smith', email: 'bob@example.com', password: 'User123!', role: 'user', isActive: true,
    addresses: [{ label: 'Home', street: '5 Allenby Rd', city: 'Haifa', zip: '31022', country: 'IL', isDefault: true }],
  },
  { name: 'Carol Williams', email: 'carol@example.com', password: 'User123!', role: 'user', isActive: true },
];

// ─── Products ─────────────────────────────────────────────────────────────────
// Image colour scheme per category (placehold.co, dark TechVault palette):
//   Laptops      1e293b / 60a5fa   Smartphones  1e293b / 818cf8
//   Tablets      1e293b / 7dd3fc   Gaming       1e1b4b / c084fc
//   Monitors     0f2217 / 34d399   Keyboards    1f2937 / a78bfa
//   Mice         1f2937 / a78bfa   Headphones   1a1530 / fb923c
//   Speakers     1a1530 / fb923c   Storage      0d2417 / 4ade80
//   Components   1c1508 / fbbf24   Networking   0c1a2e / 38bdf8
//   Smart Home   082b1a / 86efac   Accessories  1e293b / 94a3b8
const buildProducts = (catMap) => {
  const cid = (name) => catMap.get(name)._id;
  return [

    // ── Laptops (8) ──────────────────────────────────────────────────────────
    {
      sku: 'TV-LAP-0001',
      name: 'MacBook Pro 14" M3 Pro',
      description: 'Apple MacBook Pro 14" with M3 Pro chip, 18GB unified memory, 512GB SSD. Exceptional performance for creative professionals.',
      shortDescription: 'M3 Pro · 18GB · 512GB SSD · 18h battery',
      category: cid('Laptops'), brand: 'Apple',
      price: 1999.99,
      stock: 25, minStock: 10, salesCount: 42,
      specs: { Processor: 'Apple M3 Pro', Memory: '18GB Unified', Storage: '512GB SSD', Display: '14.2" Liquid Retina XDR', Battery: '18 hours' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=MacBook+Pro+14+M3'],
      tags: ['apple', 'laptop', 'pro', 'm3'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-LAP-0002',
      name: 'MacBook Air 15" M2',
      description: 'The incredibly thin MacBook Air 15" with M2 chip, 8GB RAM, 256GB SSD. Up to 18 hours of battery life.',
      shortDescription: 'M2 · 8GB · 256GB SSD · 18h battery',
      category: cid('Laptops'), brand: 'Apple',
      price: 1299.99,
      stock: 30, minStock: 10, salesCount: 67,
      specs: { Processor: 'Apple M2', Memory: '8GB Unified', Storage: '256GB SSD', Display: '15.3" Liquid Retina', Battery: '18 hours' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=MacBook+Air+15+M2'],
      tags: ['apple', 'laptop', 'air', 'm2'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-LAP-0003',
      name: 'Dell XPS 15 9530',
      description: 'Dell XPS 15 with Intel Core i7-13700H, 32GB RAM, 1TB NVMe SSD, 4K OLED display.',
      shortDescription: 'Intel i7 · 32GB · 1TB · 4K OLED',
      category: cid('Laptops'), brand: 'Dell',
      price: 1699.99,
      stock: 18, minStock: 8, salesCount: 31,
      specs: { Processor: 'Intel Core i7-13700H', Memory: '32GB DDR5', Storage: '1TB NVMe SSD', Display: '15.6" 4K OLED', GPU: 'NVIDIA RTX 4060' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=Dell+XPS+15'],
      tags: ['dell', 'laptop', 'xps', 'oled'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-LAP-0004',
      name: 'Lenovo ThinkPad X1 Carbon Gen 11',
      description: 'Business ultrabook with Intel Core i7-1365U, 16GB RAM, 512GB SSD. 14" IPS anti-glare display.',
      shortDescription: 'Intel i7 · 16GB · 512GB · MIL-SPEC',
      category: cid('Laptops'), brand: 'Lenovo',
      price: 1299.99,
      stock: 3, minStock: 10, salesCount: 19,
      specs: { Processor: 'Intel Core i7-1365U', Memory: '16GB LPDDR5', Storage: '512GB SSD', Display: '14" IPS Anti-glare', Weight: '1.12 kg' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=ThinkPad+X1+Carbon'],
      tags: ['lenovo', 'thinkpad', 'business', 'ultrabook'], isPublished: true,
    },
    {
      sku: 'TV-LAP-0005',
      name: 'HP Spectre x360 14',
      description: 'HP Spectre x360 14" 2-in-1 laptop with Intel Core i7-1355U, 16GB RAM, 1TB SSD, OLED touch display.',
      shortDescription: 'Intel i7 · 16GB · 1TB · OLED Touch 2-in-1',
      category: cid('Laptops'), brand: 'HP',
      price: 1349.99,
      stock: 14, minStock: 6, salesCount: 23,
      specs: { Processor: 'Intel Core i7-1355U', Memory: '16GB LPDDR4x', Storage: '1TB NVMe SSD', Display: '13.5" 3K2K OLED Touch', Form: '2-in-1 Convertible' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=HP+Spectre+x360'],
      tags: ['hp', 'spectre', 'laptop', '2-in-1', 'oled'], isPublished: true,
    },
    {
      sku: 'TV-LAP-0006',
      name: 'ASUS ROG Zephyrus G14',
      description: 'AMD Ryzen 9 7940HS, NVIDIA RTX 4070, 16GB DDR5, 1TB SSD. Compact 14" gaming powerhouse.',
      shortDescription: 'Ryzen 9 · RTX 4070 · 16GB · 1TB',
      category: cid('Laptops'), brand: 'ASUS',
      price: 1449.99,
      stock: 11, minStock: 5, salesCount: 38,
      specs: { Processor: 'AMD Ryzen 9 7940HS', GPU: 'NVIDIA RTX 4070', Memory: '16GB DDR5', Storage: '1TB NVMe SSD', Display: '14" QHD+ 165Hz' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=ROG+Zephyrus+G14'],
      tags: ['asus', 'rog', 'gaming', 'laptop', 'amd'], isPublished: true,
    },
    {
      sku: 'TV-LAP-0007',
      name: 'Microsoft Surface Laptop 5',
      description: 'Microsoft Surface Laptop 5 with Intel Core i5-1235U, 8GB RAM, 256GB SSD, 13.5" PixelSense touch display.',
      shortDescription: 'Intel i5 · 8GB · 256GB · PixelSense Touch',
      category: cid('Laptops'), brand: 'Microsoft',
      price: 1199.99,
      stock: 0, minStock: 8, salesCount: 12,
      specs: { Processor: 'Intel Core i5-1235U', Memory: '8GB LPDDR5x', Storage: '256GB SSD', Display: '13.5" PixelSense Touch', Battery: '17 hours' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=Surface+Laptop+5'],
      tags: ['microsoft', 'surface', 'laptop', 'windows'], isPublished: true,
    },
    {
      sku: 'TV-LAP-0008',
      name: 'Acer Swift 3',
      description: 'Acer Swift 3 with AMD Ryzen 5 7530U, 8GB RAM, 512GB SSD. Lightweight everyday laptop at a great price.',
      shortDescription: 'Ryzen 5 · 8GB · 512GB · 14" FHD',
      category: cid('Laptops'), brand: 'Acer',
      price: 699.99,
      stock: 45, minStock: 15, salesCount: 54,
      specs: { Processor: 'AMD Ryzen 5 7530U', Memory: '8GB LPDDR4x', Storage: '512GB SSD', Display: '14" FHD IPS', Battery: '12 hours' },
      images: ['https://placehold.co/800x600/1e293b/60a5fa?text=Acer+Swift+3'],
      tags: ['acer', 'swift', 'laptop', 'budget', 'amd'], isPublished: true,
    },

    // ── Smartphones (7) ──────────────────────────────────────────────────────
    {
      sku: 'TV-PHN-0001',
      name: 'iPhone 15 Pro',
      description: 'Apple iPhone 15 Pro with A17 Pro chip, 256GB, titanium design, 48MP triple camera system, USB-C with USB 3.',
      shortDescription: 'A17 Pro · 256GB · Titanium · 48MP',
      category: cid('Smartphones'), brand: 'Apple',
      price: 1099.99,
      stock: 50, minStock: 15, salesCount: 88,
      specs: { Processor: 'Apple A17 Pro', Storage: '256GB', Display: '6.1" Super Retina XDR ProMotion', Camera: '48MP + 12MP + 12MP', Connectivity: 'USB-C USB 3' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=iPhone+15+Pro'],
      tags: ['apple', 'iphone', 'smartphone', 'pro'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-PHN-0002',
      name: 'iPhone 15',
      description: 'Apple iPhone 15 with A16 Bionic chip, 128GB, Dynamic Island, 48MP main camera.',
      shortDescription: 'A16 Bionic · 128GB · Dynamic Island',
      category: cid('Smartphones'), brand: 'Apple',
      price: 799.99,
      stock: 60, minStock: 20, salesCount: 112,
      specs: { Processor: 'Apple A16 Bionic', Storage: '128GB', Display: '6.1" Super Retina XDR', Camera: '48MP + 12MP', Connectivity: 'USB-C' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=iPhone+15'],
      tags: ['apple', 'iphone', 'smartphone'], isPublished: true,
    },
    {
      sku: 'TV-PHN-0003',
      name: 'Samsung Galaxy S24 Ultra',
      description: 'Samsung Galaxy S24 Ultra with Snapdragon 8 Gen 3, 256GB, built-in S Pen, 200MP camera, titanium frame.',
      shortDescription: 'Snapdragon 8 Gen 3 · 256GB · S Pen · 200MP',
      category: cid('Smartphones'), brand: 'Samsung',
      price: 1249.99,
      stock: 35, minStock: 10, salesCount: 61,
      specs: { Processor: 'Snapdragon 8 Gen 3', Storage: '256GB', Display: '6.8" Dynamic AMOLED 2X 120Hz', Camera: '200MP + 12MP + 50MP + 10MP', Stylus: 'S Pen included' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=Galaxy+S24+Ultra'],
      tags: ['samsung', 'galaxy', 'android', 'spen', 'smartphone'], isPublished: true,
    },
    {
      sku: 'TV-PHN-0004',
      name: 'Samsung Galaxy S24',
      description: 'Samsung Galaxy S24 with Snapdragon 8 Gen 3, 128GB, 50MP triple camera, 7 years of OS and security updates.',
      shortDescription: 'Snapdragon 8 Gen 3 · 128GB · 50MP',
      category: cid('Smartphones'), brand: 'Samsung',
      price: 799.99,
      stock: 40, minStock: 12, salesCount: 73,
      specs: { Processor: 'Snapdragon 8 Gen 3', Storage: '128GB', Display: '6.2" Dynamic AMOLED 2X 120Hz', Camera: '50MP + 12MP + 10MP', Battery: '4000 mAh' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=Galaxy+S24'],
      tags: ['samsung', 'galaxy', 'android', 'smartphone'], isPublished: true,
    },
    {
      sku: 'TV-PHN-0005',
      name: 'Google Pixel 8 Pro',
      description: 'Google Pixel 8 Pro with Google Tensor G3, 128GB, 50MP triple camera, AI-powered features, 7 years of updates.',
      shortDescription: 'Tensor G3 · 128GB · 50MP · Temperature sensor',
      category: cid('Smartphones'), brand: 'Google',
      price: 999.99,
      stock: 0, minStock: 8, salesCount: 34,
      specs: { Processor: 'Google Tensor G3', Storage: '128GB', Display: '6.7" LTPO OLED 120Hz', Camera: '50MP + 48MP + 48MP', Special: 'Temperature sensor' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=Pixel+8+Pro'],
      tags: ['google', 'pixel', 'android', 'smartphone', 'pro'], isPublished: true,
    },
    {
      sku: 'TV-PHN-0006',
      name: 'Google Pixel 8',
      description: 'Google Pixel 8 with Google Tensor G3, 128GB. Best-in-class computational photography and pure Android experience.',
      shortDescription: 'Tensor G3 · 128GB · Android 14',
      category: cid('Smartphones'), brand: 'Google',
      price: 699.99,
      stock: 22, minStock: 8, salesCount: 27,
      specs: { Processor: 'Google Tensor G3', Storage: '128GB', Display: '6.2" OLED 120Hz', Camera: '50MP + 12MP', Battery: '4575 mAh' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=Pixel+8'],
      tags: ['google', 'pixel', 'android', 'smartphone'], isPublished: true,
    },
    {
      sku: 'TV-PHN-0007',
      name: 'OnePlus 12',
      description: 'OnePlus 12 with Snapdragon 8 Gen 3, 256GB, 50MP Hasselblad triple camera, 100W SUPERVOOC charging.',
      shortDescription: 'Snapdragon 8 Gen 3 · 256GB · 100W charging',
      category: cid('Smartphones'), brand: 'OnePlus',
      price: 799.99,
      stock: 28, minStock: 10, salesCount: 19,
      specs: { Processor: 'Snapdragon 8 Gen 3', Storage: '256GB', Display: '6.82" LTPO AMOLED 120Hz', Camera: '50MP Hasselblad + 48MP + 64MP', Charging: '100W SUPERVOOC' },
      images: ['https://placehold.co/800x600/1e293b/818cf8?text=OnePlus+12'],
      tags: ['oneplus', 'android', 'smartphone', 'fast-charging'], isPublished: true,
    },

    // ── Tablets (6) ──────────────────────────────────────────────────────────
    {
      sku: 'TV-TAB-0001',
      name: 'iPad Pro 13" M4',
      description: 'Apple iPad Pro 13" with M4 chip, Ultra Retina XDR OLED display, Apple Pencil Pro support, 256GB.',
      shortDescription: 'M4 · 256GB · Ultra Retina XDR OLED',
      category: cid('Tablets'), brand: 'Apple',
      price: 1299.99,
      stock: 20, minStock: 8, salesCount: 29,
      specs: { Processor: 'Apple M4', Storage: '256GB', Display: '13" Ultra Retina XDR OLED', Connectivity: 'Wi-Fi 6E + Bluetooth 5.3', Stylus: 'Apple Pencil Pro' },
      images: ['https://placehold.co/800x600/1e293b/7dd3fc?text=iPad+Pro+13+M4'],
      tags: ['apple', 'ipad', 'tablet', 'pro', 'm4'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-TAB-0002',
      name: 'iPad Air M2',
      description: 'Apple iPad Air with M2 chip, 11" Liquid Retina display, 128GB, USB-C. All-day battery life.',
      shortDescription: 'M2 · 128GB · 11" Liquid Retina',
      category: cid('Tablets'), brand: 'Apple',
      price: 599.99,
      stock: 35, minStock: 12, salesCount: 51,
      specs: { Processor: 'Apple M2', Storage: '128GB', Display: '11" Liquid Retina', Connectivity: 'Wi-Fi 6 + Bluetooth 5.2', Battery: '10 hours' },
      images: ['https://placehold.co/800x600/1e293b/7dd3fc?text=iPad+Air+M2'],
      tags: ['apple', 'ipad', 'tablet', 'air', 'm2'], isPublished: true,
    },
    {
      sku: 'TV-TAB-0003',
      name: 'Samsung Galaxy Tab S9 Ultra',
      description: 'Samsung Galaxy Tab S9 Ultra with Snapdragon 8 Gen 2, 14.6" Dynamic AMOLED 2X, 256GB, S Pen included.',
      shortDescription: 'Snapdragon 8 Gen 2 · 256GB · 14.6" AMOLED',
      category: cid('Tablets'), brand: 'Samsung',
      price: 1099.99,
      stock: 15, minStock: 6, salesCount: 18,
      specs: { Processor: 'Snapdragon 8 Gen 2', Storage: '256GB', Display: '14.6" Dynamic AMOLED 2X 120Hz', RAM: '12GB', Stylus: 'S Pen included' },
      images: ['https://placehold.co/800x600/1e293b/7dd3fc?text=Tab+S9+Ultra'],
      tags: ['samsung', 'galaxy', 'tablet', 'android', 'amoled'], isPublished: true,
    },
    {
      sku: 'TV-TAB-0004',
      name: 'Samsung Galaxy Tab S9',
      description: 'Samsung Galaxy Tab S9 with Snapdragon 8 Gen 2, 11" Dynamic AMOLED 2X, 128GB, S Pen included.',
      shortDescription: 'Snapdragon 8 Gen 2 · 128GB · 11" AMOLED',
      category: cid('Tablets'), brand: 'Samsung',
      price: 799.99,
      stock: 25, minStock: 8, salesCount: 32,
      specs: { Processor: 'Snapdragon 8 Gen 2', Storage: '128GB', Display: '11" Dynamic AMOLED 2X 120Hz', RAM: '8GB', Stylus: 'S Pen included' },
      images: ['https://placehold.co/800x600/1e293b/7dd3fc?text=Tab+S9'],
      tags: ['samsung', 'galaxy', 'tablet', 'android'], isPublished: true,
    },
    {
      sku: 'TV-TAB-0005',
      name: 'Microsoft Surface Pro 10',
      description: 'Microsoft Surface Pro 10 with Intel Core Ultra 5, 16GB RAM, 256GB SSD. 13" touchscreen 2-in-1 with Copilot+ AI features.',
      shortDescription: 'Core Ultra 5 · 16GB · 256GB · 13" Touch 2-in-1',
      category: cid('Tablets'), brand: 'Microsoft',
      price: 1499.99,
      stock: 12, minStock: 5, salesCount: 9,
      specs: { Processor: 'Intel Core Ultra 5 134U', Memory: '16GB LPDDR5x', Storage: '256GB SSD', Display: '13" Pixel Sense Flow 120Hz', Connectivity: 'USB-C + USB-A + Surface Connect' },
      images: ['https://placehold.co/800x600/1e293b/7dd3fc?text=Surface+Pro+10'],
      tags: ['microsoft', 'surface', 'tablet', 'windows', '2-in-1'], isPublished: true,
    },
    {
      sku: 'TV-TAB-0006',
      name: 'Lenovo Tab P12 Pro',
      description: 'Lenovo Tab P12 Pro with Snapdragon 870, 12.6" AMOLED display, 256GB. Perfect for productivity and entertainment.',
      shortDescription: 'Snapdragon 870 · 256GB · 12.6" AMOLED',
      category: cid('Tablets'), brand: 'Lenovo',
      price: 499.99,
      stock: 4, minStock: 5, salesCount: 14,
      specs: { Processor: 'Snapdragon 870', Storage: '256GB', Display: '12.6" AMOLED 120Hz', RAM: '8GB', Battery: '10200 mAh' },
      images: ['https://placehold.co/800x600/1e293b/7dd3fc?text=Tab+P12+Pro'],
      tags: ['lenovo', 'tablet', 'android', 'amoled'], isPublished: true,
    },

    // ── Gaming (8) ───────────────────────────────────────────────────────────
    {
      sku: 'TV-GAM-0001',
      name: 'PlayStation 5 Slim',
      description: 'Sony PlayStation 5 Slim with ultra-high-speed SSD, 4K gaming, ray tracing, 3D audio. Includes DualSense controller.',
      shortDescription: '4K gaming · Ray Tracing · 825GB SSD',
      category: cid('Gaming'), brand: 'Sony',
      price: 449.99,
      stock: 5, minStock: 10, salesCount: 76,
      specs: { CPU: 'AMD Zen 2 3.5GHz', GPU: 'AMD RDNA 2 10.3 TFLOPS', Storage: '1TB SSD', Resolution: '4K@120fps / 8K', Audio: '3D Tempest Audio' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=PS5+Slim'],
      tags: ['sony', 'playstation', 'console', 'gaming', '4k'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-GAM-0002',
      name: 'Xbox Series X',
      description: 'Microsoft Xbox Series X — the most powerful Xbox ever. 4K gaming at up to 120fps, 1TB SSD, Quick Resume.',
      shortDescription: '4K@120fps · 1TB SSD · Quick Resume',
      category: cid('Gaming'), brand: 'Microsoft',
      price: 499.99,
      stock: 8, minStock: 10, salesCount: 58,
      specs: { CPU: 'AMD Zen 2 3.8GHz', GPU: 'AMD RDNA 2 12 TFLOPS', Storage: '1TB NVMe SSD', Resolution: '4K@120fps / 8K', Feature: 'Quick Resume' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=Xbox+Series+X'],
      tags: ['microsoft', 'xbox', 'console', 'gaming', '4k'], isPublished: true,
    },
    {
      sku: 'TV-GAM-0003',
      name: 'Nintendo Switch OLED',
      description: 'Nintendo Switch OLED model with vibrant 7" OLED screen, wide adjustable stand, 64GB internal storage.',
      shortDescription: '7" OLED · 64GB · TV + Handheld',
      category: cid('Gaming'), brand: 'Nintendo',
      price: 349.99,
      stock: 40, minStock: 15, salesCount: 94,
      specs: { Display: '7" OLED 1280x720', Storage: '64GB', Modes: 'TV, Tabletop, Handheld', Battery: '4.5–9 hours', Connectivity: 'Wi-Fi + Bluetooth 4.1' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=Switch+OLED'],
      tags: ['nintendo', 'switch', 'console', 'handheld', 'gaming'], isPublished: true,
    },
    {
      sku: 'TV-GAM-0004',
      name: 'ASUS ROG Ally X',
      description: 'ASUS ROG Ally X gaming handheld with AMD Ryzen Z1 Extreme, 1TB SSD, 7" FHD 120Hz display, 24GB RAM.',
      shortDescription: 'Ryzen Z1 Extreme · 24GB · 1TB · 7" 120Hz',
      category: cid('Gaming'), brand: 'ASUS',
      price: 799.99,
      stock: 18, minStock: 6, salesCount: 29,
      specs: { Processor: 'AMD Ryzen Z1 Extreme', Memory: '24GB LPDDR5', Storage: '1TB NVMe SSD', Display: '7" FHD IPS 120Hz', Battery: '80Wh' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=ROG+Ally+X'],
      tags: ['asus', 'rog', 'handheld', 'gaming', 'windows'], isPublished: true,
    },
    {
      sku: 'TV-GAM-0005',
      name: 'Razer BlackShark V2 Pro 2023',
      description: 'Razer BlackShark V2 Pro 2023 wireless gaming headset with THX Spatial Audio, TriForce 50mm drivers, 70h battery.',
      shortDescription: 'THX Spatial Audio · 50mm drivers · 70h battery',
      category: cid('Gaming'), brand: 'Razer',
      price: 199.99,
      stock: 30, minStock: 8, salesCount: 43,
      specs: { Drivers: '50mm TriForce Titanium', Audio: 'THX Spatial Audio', Connectivity: '2.4GHz Wireless + Bluetooth', Battery: '70 hours', Microphone: 'HyperClear Super Wideband' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=BlackShark+V2+Pro'],
      tags: ['razer', 'headset', 'gaming', 'wireless', 'thx'], isPublished: true,
    },
    {
      sku: 'TV-GAM-0006',
      name: 'SteelSeries Arctis Nova 7',
      description: 'SteelSeries Arctis Nova 7 wireless gaming headset with Nova Acoustic system, 38h battery, simultaneous wireless connections.',
      shortDescription: 'Nova Acoustics · 38h · Dual wireless',
      category: cid('Gaming'), brand: 'SteelSeries',
      price: 149.99,
      stock: 25, minStock: 8, salesCount: 37,
      specs: { Drivers: '40mm Nova drivers', Connectivity: '2.4GHz + Bluetooth 5.0', Battery: '38 hours', Microphone: 'ClearCast Gen 2 retractable', Platform: 'PC, PlayStation, Switch, Mobile' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=Arctis+Nova+7'],
      tags: ['steelseries', 'arctis', 'headset', 'gaming', 'wireless'], isPublished: true,
    },
    {
      sku: 'TV-GAM-0007',
      name: 'Logitech G915 TKL',
      description: 'Logitech G915 TKL tenkeyless wireless mechanical keyboard with LIGHTSPEED, 40h battery, ultra-slim design.',
      shortDescription: 'LIGHTSPEED Wireless · GL switches · 40h · TKL',
      category: cid('Gaming'), brand: 'Logitech',
      price: 229.99,
      stock: 20, minStock: 8, salesCount: 28,
      specs: { Switches: 'Logitech GL Low Profile', Connectivity: 'LIGHTSPEED Wireless + Bluetooth', Battery: '40 hours', Backlight: 'LIGHTSYNC RGB', Layout: 'Tenkeyless' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=G915+TKL'],
      tags: ['logitech', 'keyboard', 'gaming', 'wireless', 'mechanical'], isPublished: true,
    },
    {
      sku: 'TV-GAM-0008',
      name: 'Elgato HD60 X',
      description: 'Elgato HD60 X external capture card for PS5, Xbox, PC. Up to 4K30 or 1080p60 HDR10+ capture.',
      shortDescription: '4K30 / 1080p60 HDR10+ · PS5 · Xbox · PC',
      category: cid('Gaming'), brand: 'Elgato',
      price: 149.99,
      stock: 22, minStock: 6, salesCount: 16,
      specs: { Resolution: '4K30 / 1080p60 HDR10+', Passthrough: '4K60 HDR10', Interface: 'USB 3.0', Compatibility: 'PS5, Xbox Series X|S, PC', Software: '4K60 Pro MK.2 compatible' },
      images: ['https://placehold.co/800x600/1e1b4b/c084fc?text=Elgato+HD60+X'],
      tags: ['elgato', 'capture-card', 'streaming', 'gaming'], isPublished: true,
    },

    // ── Monitors (7) ─────────────────────────────────────────────────────────
    {
      sku: 'TV-MON-0001',
      name: 'LG UltraGear 27GP950-B',
      description: '27" 4K Nano IPS gaming monitor, 160Hz, 1ms GTG, HDMI 2.1, G-Sync Compatible, DisplayHDR 600.',
      shortDescription: '27" 4K 160Hz · Nano IPS · HDMI 2.1 · HDR600',
      category: cid('Monitors'), brand: 'LG',
      price: 699.99,
      stock: 12, minStock: 6, salesCount: 22,
      specs: { Size: '27"', Resolution: '3840x2160 (4K)', 'Refresh Rate': '160Hz', Panel: 'Nano IPS', Connectivity: 'HDMI 2.1 x2, DisplayPort 1.4' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=LG+UltraGear+27'],
      tags: ['monitor', 'gaming', '4k', 'lg', 'nano-ips'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-MON-0002',
      name: 'Dell UltraSharp U2722D',
      description: '27" QHD IPS monitor, USB-C 90W power delivery, built-in KVM switch, 100% sRGB. Ideal for office multitasking.',
      shortDescription: '27" QHD · USB-C 90W · KVM · 100% sRGB',
      category: cid('Monitors'), brand: 'Dell',
      price: 549.99,
      stock: 20, minStock: 10, salesCount: 14,
      specs: { Size: '27"', Resolution: '2560x1440 (QHD)', 'Refresh Rate': '60Hz', Panel: 'IPS', Connectivity: 'USB-C 90W, HDMI, DP, USB hub' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=Dell+U2722D'],
      tags: ['monitor', 'dell', 'ultrasharp', 'office', 'usb-c'], isPublished: true,
    },
    {
      sku: 'TV-MON-0003',
      name: 'Samsung Odyssey G9 49"',
      description: '49" DQHD Curved 240Hz gaming monitor with Quantum Mini LED, 1ms, G-Sync + FreeSync. Dual QHD resolution.',
      shortDescription: '49" DQHD 240Hz · Quantum Mini-LED · Curved',
      category: cid('Monitors'), brand: 'Samsung',
      price: 1299.99,
      stock: 6, minStock: 5, salesCount: 11,
      specs: { Size: '49"', Resolution: '5120x1440 (DQHD)', 'Refresh Rate': '240Hz', Panel: 'Quantum Mini-LED', 'Curve Radius': '1000R' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=Odyssey+G9+49'],
      tags: ['monitor', 'samsung', 'odyssey', 'gaming', 'ultrawide', 'curved'], isPublished: true,
    },
    {
      sku: 'TV-MON-0004',
      name: 'ASUS ProArt PA279CRV',
      description: '27" 4K IPS professional monitor, 100% Adobe RGB, 100% DCI-P3, Calman Verified, USB-C 96W, color-accurate for creatives.',
      shortDescription: '27" 4K · 100% DCI-P3 · Adobe RGB · USB-C 96W',
      category: cid('Monitors'), brand: 'ASUS',
      price: 749.99,
      stock: 16, minStock: 6, salesCount: 17,
      specs: { Size: '27"', Resolution: '3840x2160 (4K)', 'Color Gamut': '100% Adobe RGB, 100% DCI-P3', Panel: 'IPS', Connectivity: 'USB-C 96W, HDMI 2.0, DP 1.4' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=ProArt+PA279CRV'],
      tags: ['monitor', 'asus', 'proart', 'color-accurate', '4k'], isPublished: true,
    },
    {
      sku: 'TV-MON-0005',
      name: 'LG 32UK550-B',
      description: '32" 4K UHD IPS monitor with FreeSync, HDR10, USB-C, wide color coverage. Great value 4K display.',
      shortDescription: '32" 4K UHD · IPS · HDR10 · FreeSync',
      category: cid('Monitors'), brand: 'LG',
      price: 399.99,
      stock: 28, minStock: 10, salesCount: 33,
      specs: { Size: '32"', Resolution: '3840x2160 (4K)', 'Refresh Rate': '60Hz', Panel: 'IPS', HDR: 'HDR10' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=LG+32UK550'],
      tags: ['monitor', 'lg', '4k', 'ips', 'budget'], isPublished: true,
    },
    {
      sku: 'TV-MON-0006',
      name: 'BenQ PD2706U',
      description: '27" 4K USB-C monitor designed for designers. 100% sRGB, 95% P3, Calman Verified, built-in KVM and daisy-chain.',
      shortDescription: '27" 4K · 95% DCI-P3 · USB-C KVM · Daisy-chain',
      category: cid('Monitors'), brand: 'BenQ',
      price: 699.99,
      stock: 14, minStock: 5, salesCount: 12,
      specs: { Size: '27"', Resolution: '3840x2160 (4K)', 'Color Gamut': '100% sRGB, 95% DCI-P3', Panel: 'IPS', Connectivity: 'USB-C, HDMI 2.0, DP 1.4, KVM' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=BenQ+PD2706U'],
      tags: ['monitor', 'benq', '4k', 'design', 'usb-c'], isPublished: true,
    },
    {
      sku: 'TV-MON-0007',
      name: 'Alienware AW3423DWF',
      description: '34" QD-OLED ultrawide gaming monitor, 165Hz, 0.1ms, FreeSync Premium Pro. Stunning colour and contrast.',
      shortDescription: '34" QD-OLED Ultrawide · 165Hz · 0.1ms',
      category: cid('Monitors'), brand: 'Alienware',
      price: 1099.99,
      stock: 0, minStock: 4, salesCount: 19,
      specs: { Size: '34"', Resolution: '3440x1440 (UWQHD)', 'Refresh Rate': '165Hz', Panel: 'QD-OLED', 'Response Time': '0.1ms' },
      images: ['https://placehold.co/800x600/0f2217/34d399?text=AW3423DWF+OLED'],
      tags: ['monitor', 'alienware', 'gaming', 'oled', 'ultrawide'], isPublished: true,
    },

    // ── Keyboards (6) ────────────────────────────────────────────────────────
    {
      sku: 'TV-KBD-0001',
      name: 'Logitech MX Keys S',
      description: 'Logitech MX Keys S wireless keyboard with smart backlight, multi-device, USB-C charging, optimized for productivity.',
      shortDescription: 'Smart Backlight · Multi-device · USB-C',
      category: cid('Keyboards'), brand: 'Logitech',
      price: 109.99,
      stock: 50, minStock: 15, salesCount: 67,
      specs: { Type: 'Low-profile scissor keys', Connectivity: 'Logi Bolt + Bluetooth (3 devices)', Backlight: 'Smart illumination', Battery: '10 days (backlit) / 5 months', Layout: 'Full-size' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=MX+Keys+S'],
      tags: ['logitech', 'keyboard', 'wireless', 'productivity', 'backlit'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-KBD-0002',
      name: 'Apple Magic Keyboard',
      description: 'Apple Magic Keyboard with Touch ID for Mac with Apple Silicon. Comfortable scissor keys, USB-C charging.',
      shortDescription: 'Touch ID · Scissor keys · USB-C',
      category: cid('Keyboards'), brand: 'Apple',
      price: 99.99,
      stock: 45, minStock: 15, salesCount: 89,
      specs: { Type: 'Scissor mechanism', Connectivity: 'Bluetooth + USB-C wired', Authentication: 'Touch ID', Battery: '1 month', Layout: 'Full-size' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Magic+Keyboard'],
      tags: ['apple', 'keyboard', 'wireless', 'touch-id'], isPublished: true,
    },
    {
      sku: 'TV-KBD-0003',
      name: 'Keychron Q1 Pro',
      description: 'Keychron Q1 Pro 75% wireless QMK/VIA mechanical keyboard with Gateron G Pro switches, gasket mount, knob.',
      shortDescription: 'QMK/VIA · Gateron G Pro · Gasket mount · Knob',
      category: cid('Keyboards'), brand: 'Keychron',
      price: 199.99,
      stock: 30, minStock: 10, salesCount: 31,
      specs: { Layout: '75% (84 keys)', Switches: 'Gateron G Pro (hot-swappable)', Connectivity: 'Bluetooth 5.1 + USB-C', Firmware: 'QMK / VIA', Mount: 'Gasket mount' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Keychron+Q1+Pro'],
      tags: ['keychron', 'keyboard', 'mechanical', 'qmk', 'wireless'], isPublished: true,
    },
    {
      sku: 'TV-KBD-0004',
      name: 'Ducky One 3 SF',
      description: 'Ducky One 3 SF 65% mechanical keyboard with Cherry MX switches, PBT double-shot keycaps, hot-swap PCB.',
      shortDescription: '65% · Cherry MX · PBT Double-shot · Hot-swap',
      category: cid('Keyboards'), brand: 'Ducky',
      price: 149.99,
      stock: 24, minStock: 8, salesCount: 22,
      specs: { Layout: '65% (67 keys)', Switches: 'Cherry MX (hot-swappable)', Keycaps: 'PBT Double-shot', Backlight: 'RGB', PCB: 'USB-C detachable' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Ducky+One+3+SF'],
      tags: ['ducky', 'keyboard', 'mechanical', '65%', 'hot-swap'], isPublished: true,
    },
    {
      sku: 'TV-KBD-0005',
      name: 'Das Keyboard 4 Professional',
      description: 'Das Keyboard 4 Professional full-size mechanical keyboard with Cherry MX Blue switches, dedicated media controls, aluminium top panel.',
      shortDescription: 'Cherry MX Blue · Full-size · Aluminium · Media dial',
      category: cid('Keyboards'), brand: 'Das Keyboard',
      price: 169.99,
      stock: 18, minStock: 6, salesCount: 15,
      specs: { Layout: 'Full-size (104 keys)', Switches: 'Cherry MX Blue', 'Top Case': 'Aluminium', Controls: 'Dedicated media controls + volume knob', Connectivity: 'USB 3.0 hub' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Das+Keyboard+4'],
      tags: ['daskeyboard', 'keyboard', 'mechanical', 'professional'], isPublished: true,
    },
    {
      sku: 'TV-KBD-0006',
      name: 'Corsair K70 RGB Pro',
      description: 'Corsair K70 RGB Pro full-size mechanical gaming keyboard with Cherry MX Speed switches, PBT keycaps, USB pass-through.',
      shortDescription: 'Cherry MX Speed · PBT · RGB · USB pass-through',
      category: cid('Keyboards'), brand: 'Corsair',
      price: 139.99,
      stock: 32, minStock: 10, salesCount: 44,
      specs: { Layout: 'Full-size (104 keys)', Switches: 'Cherry MX Speed Silver', Keycaps: 'PBT Double-shot', Backlight: 'RGB per-key', Extra: 'USB 2.0 pass-through' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=K70+RGB+Pro'],
      tags: ['corsair', 'keyboard', 'mechanical', 'gaming', 'rgb'], isPublished: true,
    },

    // ── Mice (5) ─────────────────────────────────────────────────────────────
    {
      sku: 'TV-MSE-0001',
      name: 'Logitech MX Master 3S',
      description: 'Logitech MX Master 3S wireless mouse with 8K DPI, MagSpeed electromagnetic scroll wheel, USB-C, multi-device.',
      shortDescription: '8K DPI · MagSpeed scroll · Multi-device · USB-C',
      category: cid('Mice'), brand: 'Logitech',
      price: 99.99,
      stock: 55, minStock: 15, salesCount: 108,
      specs: { DPI: '200–8000 DPI', Connectivity: 'Logi Bolt + Bluetooth (3 devices)', Scroll: 'MagSpeed Electromagnetic', Battery: '70 days USB-C', Buttons: '7 programmable' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=MX+Master+3S'],
      tags: ['logitech', 'mouse', 'wireless', 'productivity'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-MSE-0002',
      name: 'Apple Magic Mouse',
      description: 'Apple Magic Mouse with Multi-Touch surface, optimized feet, USB-C charging, seamless Bluetooth pairing.',
      shortDescription: 'Multi-Touch · Bluetooth · USB-C',
      category: cid('Mice'), brand: 'Apple',
      price: 79.99,
      stock: 40, minStock: 12, salesCount: 76,
      specs: { Connectivity: 'Bluetooth', Surface: 'Multi-Touch gesture support', Charging: 'USB-C', Battery: '1 month', Compatibility: 'Mac, iPad' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Magic+Mouse'],
      tags: ['apple', 'mouse', 'wireless', 'multitouch'], isPublished: true,
    },
    {
      sku: 'TV-MSE-0003',
      name: 'Razer DeathAdder V3 Pro',
      description: 'Razer DeathAdder V3 Pro wireless gaming mouse, 30K optical sensor, 90h battery, 59g ultra-lightweight.',
      shortDescription: '30K DPI · 90h battery · 59g · HyperSpeed',
      category: cid('Mice'), brand: 'Razer',
      price: 149.99,
      stock: 28, minStock: 8, salesCount: 39,
      specs: { DPI: '100–30000 DPI', Connectivity: 'HyperSpeed Wireless + Bluetooth', Battery: '90 hours', Weight: '59g', Clicks: '90M click lifespan' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=DeathAdder+V3+Pro'],
      tags: ['razer', 'mouse', 'gaming', 'wireless', 'lightweight'], isPublished: true,
    },
    {
      sku: 'TV-MSE-0004',
      name: 'SteelSeries Prime Wireless',
      description: 'SteelSeries Prime Wireless gaming mouse with Quantum 2.0 optical sensor, 18K DPI, magnetic charging, 100h battery.',
      shortDescription: '18K DPI · 100h battery · Magnetic charging',
      category: cid('Mice'), brand: 'SteelSeries',
      price: 129.99,
      stock: 20, minStock: 8, salesCount: 21,
      specs: { DPI: '100–18000 DPI', Connectivity: '2.4GHz Wireless + Bluetooth', Battery: '100 hours', Charging: 'Magnetic USB-C', Weight: '73g' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Prime+Wireless'],
      tags: ['steelseries', 'mouse', 'gaming', 'wireless'], isPublished: true,
    },
    {
      sku: 'TV-MSE-0005',
      name: 'Microsoft Arc Mouse',
      description: 'Microsoft Arc Mouse — foldable wireless mouse with BlueTrack technology, snap-and-go Bluetooth pairing.',
      shortDescription: 'Foldable · BlueTrack · Bluetooth · Compact',
      category: cid('Mice'), brand: 'Microsoft',
      price: 79.99,
      stock: 4, minStock: 6, salesCount: 18,
      specs: { DPI: 'Variable (BlueTrack)', Connectivity: 'Bluetooth', Design: 'Foldable arc', Battery: '6 months (AAA)', Weight: '79g' },
      images: ['https://placehold.co/800x600/1f2937/a78bfa?text=Arc+Mouse'],
      tags: ['microsoft', 'mouse', 'wireless', 'travel', 'foldable'], isPublished: true,
    },

    // ── Headphones (7) ───────────────────────────────────────────────────────
    {
      sku: 'TV-HPH-0001',
      name: 'Sony WH-1000XM5',
      description: 'Industry-leading noise-cancelling headphones with 30h battery, multipoint connection, 8 microphones, speak-to-chat.',
      shortDescription: 'ANC · 30h · Multipoint · 8 mics',
      category: cid('Headphones'), brand: 'Sony',
      price: 349.99,
      stock: 40, minStock: 12, salesCount: 55,
      specs: { Drivers: '30mm', ANC: 'Industry-leading', Battery: '30 hours (3h quick charge)', Connectivity: 'Bluetooth 5.2 + 3.5mm', Microphones: '8 built-in mics' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=WH-1000XM5'],
      tags: ['sony', 'headphones', 'anc', 'wireless', 'over-ear'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-HPH-0002',
      name: 'Apple AirPods Pro 2',
      description: 'Apple AirPods Pro 2 with H2 chip, Adaptive Transparency, Personalized Spatial Audio, up to 30h total battery with case.',
      shortDescription: 'H2 chip · Adaptive Transparency · 30h total',
      category: cid('Headphones'), brand: 'Apple',
      price: 249.99,
      stock: 65, minStock: 20, salesCount: 132,
      specs: { Chip: 'Apple H2', ANC: 'Adaptive Transparency', Battery: '6h (30h with case)', Connectivity: 'Bluetooth 5.3', Case: 'MagSafe / Lightning / USB-C' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=AirPods+Pro+2'],
      tags: ['apple', 'airpods', 'earbuds', 'anc', 'wireless'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-HPH-0003',
      name: 'Bose QuietComfort 45',
      description: 'Bose QuietComfort 45 wireless headphones with world-class noise cancellation, 24h battery, Aware Mode.',
      shortDescription: 'World-class ANC · 24h · Aware Mode',
      category: cid('Headphones'), brand: 'Bose',
      price: 279.99,
      stock: 30, minStock: 10, salesCount: 47,
      specs: { ANC: 'Bose Acoustic Noise Cancelling', Battery: '24 hours', Connectivity: 'Bluetooth 5.1 + 2.5mm', Weight: '240g', Modes: 'Quiet, Aware' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=QuietComfort+45'],
      tags: ['bose', 'headphones', 'anc', 'wireless', 'over-ear'], isPublished: true,
    },
    {
      sku: 'TV-HPH-0004',
      name: 'Sennheiser HD 660S2',
      description: 'Sennheiser HD 660S2 open-back audiophile headphones with improved transducer, 150Ω impedance, balanced 4.4mm cable.',
      shortDescription: 'Open-back · 150Ω · 4.4mm balanced · Audiophile',
      category: cid('Headphones'), brand: 'Sennheiser',
      price: 499.99,
      stock: 15, minStock: 4, salesCount: 12,
      specs: { Type: 'Open-back over-ear', Impedance: '150Ω', Frequency: '8Hz–41.5kHz', Cables: '3.5mm + 6.35mm + 4.4mm balanced', Weight: '260g' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=HD+660S2'],
      tags: ['sennheiser', 'headphones', 'audiophile', 'open-back', 'wired'], isPublished: true,
    },
    {
      sku: 'TV-HPH-0005',
      name: 'Jabra Evolve2 85',
      description: 'Jabra Evolve2 85 professional wireless headset with Advanced ANC, 37h battery, 8-mic array, Teams certified.',
      shortDescription: 'Advanced ANC · 37h · 8-mic · Teams certified',
      category: cid('Headphones'), brand: 'Jabra',
      price: 449.99,
      stock: 18, minStock: 6, salesCount: 14,
      specs: { ANC: 'Advanced Hybrid ANC', Battery: '37 hours', Microphones: '8-mic array', Connectivity: 'Bluetooth 5.0 + USB dongle', Certification: 'Microsoft Teams' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=Evolve2+85'],
      tags: ['jabra', 'headphones', 'business', 'teams', 'anc'], isPublished: true,
    },
    {
      sku: 'TV-HPH-0006',
      name: 'Anker Soundcore Q45',
      description: 'Anker Soundcore Q45 wireless headphones with adaptive ANC, 50h playtime, LDAC Hi-Res Audio.',
      shortDescription: 'Adaptive ANC · 50h · LDAC Hi-Res',
      category: cid('Headphones'), brand: 'Anker',
      price: 79.99,
      stock: 60, minStock: 20, salesCount: 84,
      specs: { ANC: 'Adaptive Multi-mode ANC', Battery: '50 hours', Connectivity: 'Bluetooth 5.3 + 3.5mm', Codec: 'LDAC Hi-Res Audio', Weight: '253g' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=Soundcore+Q45'],
      tags: ['anker', 'soundcore', 'headphones', 'anc', 'wireless', 'budget'], isPublished: true,
    },
    {
      sku: 'TV-HPH-0007',
      name: 'Samsung Galaxy Buds2 Pro',
      description: 'Samsung Galaxy Buds2 Pro with 360 Audio, Intelligent ANC, 29h total battery, IPX7, Hi-Fi sound.',
      shortDescription: '360 Audio · ANC · 29h total · IPX7',
      category: cid('Headphones'), brand: 'Samsung',
      price: 179.99,
      stock: 3, minStock: 8, salesCount: 31,
      specs: { Drivers: '10mm woofer + 5.3mm tweeter', ANC: 'Intelligent ANC', Battery: '5h (29h with case)', Connectivity: 'Bluetooth 5.3', Water: 'IPX7' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=Galaxy+Buds2+Pro'],
      tags: ['samsung', 'galaxy-buds', 'earbuds', 'anc', 'wireless'], isPublished: true,
    },

    // ── Speakers (5) ─────────────────────────────────────────────────────────
    {
      sku: 'TV-SPK-0001',
      name: 'Sonos Era 300',
      description: 'Sonos Era 300 spatial audio speaker with Dolby Atmos, six-driver array, line-in, AirPlay 2, Wi-Fi.',
      shortDescription: 'Dolby Atmos · Spatial Audio · AirPlay 2 · Wi-Fi',
      category: cid('Speakers'), brand: 'Sonos',
      price: 449.99,
      stock: 22, minStock: 8, salesCount: 19,
      specs: { Channels: 'Spatial (6-driver)', Audio: 'Dolby Atmos', Connectivity: 'Wi-Fi 6 + Bluetooth 5.0 + Line-in', Voice: 'Amazon Alexa', App: 'Sonos app' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=Sonos+Era+300'],
      tags: ['sonos', 'speaker', 'spatial-audio', 'dolby-atmos', 'smart'], isPublished: true,
    },
    {
      sku: 'TV-SPK-0002',
      name: 'Bose SoundLink Max',
      description: 'Bose SoundLink Max portable Bluetooth speaker with up to 20h battery, IP67 waterproof, multi-source connection.',
      shortDescription: '20h battery · IP67 · Multi-source · Bose signature sound',
      category: cid('Speakers'), brand: 'Bose',
      price: 399.99,
      stock: 28, minStock: 8, salesCount: 22,
      specs: { Battery: '20 hours', Water: 'IP67', Connectivity: 'Bluetooth 5.3 + USB-C audio', Charging: 'USB-C', Weight: '1.47 kg' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=SoundLink+Max'],
      tags: ['bose', 'speaker', 'bluetooth', 'portable', 'waterproof'], isPublished: true,
    },
    {
      sku: 'TV-SPK-0003',
      name: 'JBL Charge 5',
      description: 'JBL Charge 5 portable waterproof Bluetooth speaker with 20h playtime, IP67, powerbank function.',
      shortDescription: '20h · IP67 · Powerbank · JBL PartyBoost',
      category: cid('Speakers'), brand: 'JBL',
      price: 179.99,
      stock: 55, minStock: 15, salesCount: 78,
      specs: { Battery: '20 hours', Water: 'IP67', 'Extra Feature': '7500mAh power bank', Connectivity: 'Bluetooth 5.1', Feature: 'JBL PartyBoost' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=JBL+Charge+5'],
      tags: ['jbl', 'speaker', 'bluetooth', 'portable', 'waterproof', 'powerbank'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-SPK-0004',
      name: 'Apple HomePod 2nd Gen',
      description: 'Apple HomePod 2nd generation with S9 chip, spatial audio, room sensing, Siri, smart home hub, temperature sensor.',
      shortDescription: 'S9 chip · Spatial Audio · Siri · Smart home hub',
      category: cid('Speakers'), brand: 'Apple',
      price: 299.99,
      stock: 25, minStock: 8, salesCount: 31,
      specs: { Chip: 'Apple S9', Audio: 'Spatial Audio with Atmos', Connectivity: 'Wi-Fi 6 + Bluetooth 5.3', Voice: 'Siri', Sensors: 'Temperature + humidity' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=HomePod+2nd+Gen'],
      tags: ['apple', 'homepod', 'speaker', 'smart-speaker', 'siri'], isPublished: true,
    },
    {
      sku: 'TV-SPK-0005',
      name: 'Amazon Echo Studio',
      description: 'Amazon Echo Studio smart speaker with 3D audio, Dolby Atmos, 5 built-in speakers, Alexa, Zigbee hub.',
      shortDescription: '3D Audio · Dolby Atmos · Alexa · Zigbee hub',
      category: cid('Speakers'), brand: 'Amazon',
      price: 199.99,
      stock: 0, minStock: 6, salesCount: 28,
      specs: { Drivers: '1" tweeter + 2x 2" mid + 1x 5.25" woofer', Audio: 'Dolby Atmos 3D', Voice: 'Alexa', 'Smart Home': 'Zigbee + Matter hub', Connectivity: 'Wi-Fi 5 + Bluetooth 5.0' },
      images: ['https://placehold.co/800x600/1a1530/fb923c?text=Echo+Studio'],
      tags: ['amazon', 'echo', 'speaker', 'alexa', 'smart-speaker', 'dolby-atmos'], isPublished: true,
    },

    // ── Storage (6) ──────────────────────────────────────────────────────────
    {
      sku: 'TV-STO-0001',
      name: 'Samsung 990 Pro 2TB NVMe',
      description: 'Samsung 990 Pro 2TB PCIe 4.0 NVMe SSD with up to 7450MB/s read, 6900MB/s write. For gaming and creative pros.',
      shortDescription: '2TB · PCIe 4.0 · 7450MB/s read · 6900MB/s write',
      category: cid('Storage'), brand: 'Samsung',
      price: 199.99,
      stock: 40, minStock: 12, salesCount: 56,
      specs: { Capacity: '2TB', Interface: 'PCIe 4.0 NVMe M.2', 'Seq Read': '7450 MB/s', 'Seq Write': '6900 MB/s', TBW: '1200 TBW' },
      images: ['https://placehold.co/800x600/0d2417/4ade80?text=990+Pro+2TB+NVMe'],
      tags: ['samsung', 'ssd', 'nvme', 'storage', '2tb'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-STO-0002',
      name: 'WD Black SN850X 1TB',
      description: 'WD Black SN850X 1TB PCIe 4.0 NVMe SSD with 7300MB/s read, optimized for gaming with WD_BLACK Dashboard.',
      shortDescription: '1TB · PCIe 4.0 · 7300MB/s · Gaming optimized',
      category: cid('Storage'), brand: 'WD',
      price: 129.99,
      stock: 35, minStock: 12, salesCount: 43,
      specs: { Capacity: '1TB', Interface: 'PCIe 4.0 NVMe M.2', 'Seq Read': '7300 MB/s', 'Seq Write': '6600 MB/s', TBW: '600 TBW' },
      images: ['https://placehold.co/800x600/0d2417/4ade80?text=WD+SN850X+1TB'],
      tags: ['wd', 'ssd', 'nvme', 'storage', 'gaming'], isPublished: true,
    },
    {
      sku: 'TV-STO-0003',
      name: 'Seagate IronWolf 4TB HDD',
      description: 'Seagate IronWolf 4TB NAS HDD optimized for multi-drive NAS enclosures, 5400RPM, CMR, AgileArray.',
      shortDescription: '4TB · NAS optimized · 5400RPM · CMR · 3-year warranty',
      category: cid('Storage'), brand: 'Seagate',
      price: 99.99,
      stock: 50, minStock: 15, salesCount: 29,
      specs: { Capacity: '4TB', Type: '3.5" HDD CMR', RPM: '5400 RPM', Cache: '64MB', Interface: 'SATA 6Gb/s' },
      images: ['https://placehold.co/800x600/0d2417/4ade80?text=IronWolf+4TB+HDD'],
      tags: ['seagate', 'hdd', 'nas', 'storage', '4tb'], isPublished: true,
    },
    {
      sku: 'TV-STO-0004',
      name: 'Samsung T7 Shield 2TB',
      description: 'Samsung T7 Shield 2TB portable SSD with IP65 rugged casing, up to 1050MB/s, USB 3.2 Gen 2.',
      shortDescription: '2TB · 1050MB/s · IP65 · USB 3.2 Gen 2',
      category: cid('Storage'), brand: 'Samsung',
      price: 139.99,
      stock: 38, minStock: 12, salesCount: 41,
      specs: { Capacity: '2TB', Interface: 'USB 3.2 Gen 2 (USB-C)', 'Seq Read': '1050 MB/s', Protection: 'IP65, 3m drop-resistant', Weight: '98g' },
      images: ['https://placehold.co/800x600/0d2417/4ade80?text=T7+Shield+2TB'],
      tags: ['samsung', 'ssd', 'portable', 'storage', 'rugged'], isPublished: true,
    },
    {
      sku: 'TV-STO-0005',
      name: 'Kingston XS2000 1TB',
      description: 'Kingston XS2000 1TB portable NVMe SSD, up to 2000MB/s, USB 3.2 Gen 2x2, IP55, rubber sleeve.',
      shortDescription: '1TB · 2000MB/s · USB 3.2 Gen 2x2 · IP55',
      category: cid('Storage'), brand: 'Kingston',
      price: 89.99,
      stock: 5, minStock: 10, salesCount: 27,
      specs: { Capacity: '1TB', Interface: 'USB 3.2 Gen 2x2 (USB-C)', 'Seq Read': '2000 MB/s', Protection: 'IP55', Weight: '28.7g' },
      images: ['https://placehold.co/800x600/0d2417/4ade80?text=XS2000+1TB'],
      tags: ['kingston', 'ssd', 'portable', 'storage', 'nvme'], isPublished: true,
    },
    {
      sku: 'TV-STO-0006',
      name: 'LaCie Rugged Mini 4TB',
      description: 'LaCie Rugged Mini 4TB portable HDD with orange shock-absorbing bumper, USB 3.0, drop and crush resistant.',
      shortDescription: '4TB · Shock-resistant · USB 3.0 · Drop-proof',
      category: cid('Storage'), brand: 'LaCie',
      price: 149.99,
      stock: 32, minStock: 10, salesCount: 19,
      specs: { Capacity: '4TB', Interface: 'USB 3.0', Protection: 'Drop (1.2m), crush (1-ton), rain resistant', Weight: '260g', Compatibility: 'Windows, Mac, PS4/5, Xbox' },
      images: ['https://placehold.co/800x600/0d2417/4ade80?text=LaCie+Rugged+4TB'],
      tags: ['lacie', 'hdd', 'portable', 'storage', 'rugged'], isPublished: true,
    },

    // ── Components (6) ───────────────────────────────────────────────────────
    {
      sku: 'TV-CMP-0001',
      name: 'NVIDIA GeForce RTX 4080 Super',
      description: 'NVIDIA GeForce RTX 4080 Super 16GB GDDR6X. Exceptional 4K gaming performance with DLSS 3.5 and Ada Lovelace architecture.',
      shortDescription: '16GB GDDR6X · Ada Lovelace · DLSS 3.5 · 4K',
      category: cid('Components'), brand: 'NVIDIA',
      price: 999.99,
      stock: 10, minStock: 4, salesCount: 15,
      specs: { VRAM: '16GB GDDR6X', Architecture: 'Ada Lovelace', CUDA: '10240 cores', TDP: '320W', Connectivity: 'PCIe 4.0 x16' },
      images: ['https://placehold.co/800x600/1c1508/fbbf24?text=RTX+4080+Super'],
      tags: ['nvidia', 'gpu', 'rtx', 'gaming', '4k', 'components'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-CMP-0002',
      name: 'AMD Ryzen 9 7950X',
      description: 'AMD Ryzen 9 7950X 16-core 32-thread desktop processor, 5.7GHz boost, 64MB L3 cache, AM5 socket.',
      shortDescription: '16-core · 32-thread · 5.7GHz · AM5',
      category: cid('Components'), brand: 'AMD',
      price: 699.99,
      stock: 14, minStock: 5, salesCount: 11,
      specs: { Cores: '16 cores / 32 threads', 'Base Clock': '4.5GHz', 'Boost Clock': '5.7GHz', 'L3 Cache': '64MB', Socket: 'AM5' },
      images: ['https://placehold.co/800x600/1c1508/fbbf24?text=Ryzen+9+7950X'],
      tags: ['amd', 'ryzen', 'cpu', 'processor', 'components', 'workstation'], isPublished: true,
    },
    {
      sku: 'TV-CMP-0003',
      name: 'Corsair Vengeance DDR5 32GB',
      description: 'Corsair Vengeance DDR5 32GB (2x16GB) DDR5-5600 CL36, Intel XMP 3.0, optimized for 12th/13th/14th Gen Intel and Ryzen 7000.',
      shortDescription: '32GB DDR5-5600 · CL36 · XMP 3.0 · Dual channel',
      category: cid('Components'), brand: 'Corsair',
      price: 129.99,
      stock: 45, minStock: 15, salesCount: 62,
      specs: { Capacity: '32GB (2x16GB)', Speed: 'DDR5-5600 MHz', Latency: 'CL36', Profile: 'Intel XMP 3.0', Voltage: '1.25V' },
      images: ['https://placehold.co/800x600/1c1508/fbbf24?text=Vengeance+DDR5+32GB'],
      tags: ['corsair', 'ram', 'ddr5', 'memory', 'components'], isPublished: true,
    },
    {
      sku: 'TV-CMP-0004',
      name: 'ASUS ROG Strix Z790-E',
      description: 'ASUS ROG Strix Z790-E Gaming Wi-Fi ATX motherboard for Intel 12th/13th/14th Gen, DDR5, PCIe 5.0, Thunderbolt 4.',
      shortDescription: 'Intel Z790 · DDR5 · PCIe 5.0 · Thunderbolt 4 · Wi-Fi 6E',
      category: cid('Components'), brand: 'ASUS',
      price: 399.99,
      stock: 18, minStock: 6, salesCount: 9,
      specs: { Chipset: 'Intel Z790', Socket: 'LGA 1700', Memory: 'DDR5 up to 7800MHz+, 4 slots', Storage: 'PCIe 5.0 x4 M.2 x2', Connectivity: 'Wi-Fi 6E + Thunderbolt 4' },
      images: ['https://placehold.co/800x600/1c1508/fbbf24?text=ROG+Strix+Z790-E'],
      tags: ['asus', 'rog', 'motherboard', 'z790', 'intel', 'components'], isPublished: true,
    },
    {
      sku: 'TV-CMP-0005',
      name: 'Noctua NH-D15',
      description: 'Noctua NH-D15 dual-tower CPU air cooler with dual NF-A15 fans. Best-in-class air cooling performance, near-silent.',
      shortDescription: 'Dual-tower · Dual NF-A15 · 250W TDP · Near-silent',
      category: cid('Components'), brand: 'Noctua',
      price: 99.99,
      stock: 30, minStock: 8, salesCount: 24,
      specs: { Type: 'Dual-tower air cooler', Fans: '2x 140mm NF-A15 PWM', TDP: '250W+', Noise: '24.6 dB(A) max', Compatibility: 'Intel LGA1700, AMD AM5/AM4' },
      images: ['https://placehold.co/800x600/1c1508/fbbf24?text=Noctua+NH-D15'],
      tags: ['noctua', 'cooler', 'cpu-cooler', 'components', 'quiet'], isPublished: true,
    },
    {
      sku: 'TV-CMP-0006',
      name: 'Corsair RM1000x 1000W PSU',
      description: 'Corsair RM1000x 1000W 80 PLUS Gold fully modular ATX power supply with zero-RPM fan mode, premium capacitors.',
      shortDescription: '1000W · 80 PLUS Gold · Fully modular · Zero-RPM',
      category: cid('Components'), brand: 'Corsair',
      price: 199.99,
      stock: 0, minStock: 6, salesCount: 17,
      specs: { Wattage: '1000W', Certification: '80 PLUS Gold', Modular: 'Fully modular', Fan: 'Zero-RPM mode', Warranty: '10 years' },
      images: ['https://placehold.co/800x600/1c1508/fbbf24?text=RM1000x+PSU'],
      tags: ['corsair', 'psu', 'power-supply', '1000w', 'components'], isPublished: true,
    },

    // ── Networking (5) ───────────────────────────────────────────────────────
    {
      sku: 'TV-NET-0001',
      name: 'TP-Link Deco XE75 Pro',
      description: 'TP-Link Deco XE75 Pro Wi-Fi 6E Mesh system (2-pack), tri-band, up to 5400Mbps, 6GHz backhaul, up to 5500 sq.ft.',
      shortDescription: 'Wi-Fi 6E · Tri-band · 5400Mbps · 5500 sq.ft · 2-pack',
      category: cid('Networking'), brand: 'TP-Link',
      price: 299.99,
      stock: 24, minStock: 8, salesCount: 21,
      specs: { Standard: 'Wi-Fi 6E (802.11axe)', Bands: 'Tri-band (2.4+5+6GHz)', Speed: 'AXE5400', Coverage: '5500 sq.ft (2-pack)', Ports: '2.5G WAN + 3x Gigabit LAN each' },
      images: ['https://placehold.co/800x600/0c1a2e/38bdf8?text=Deco+XE75+Pro'],
      tags: ['tp-link', 'deco', 'mesh', 'wifi6e', 'networking'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-NET-0002',
      name: 'Netgear Nighthawk AX12',
      description: 'Netgear Nighthawk AX12 12-stream Wi-Fi 6 router, AX6000, 1.8GHz quad-core processor, Gigabit+ speeds.',
      shortDescription: 'Wi-Fi 6 AX6000 · 12-stream · 2.5G WAN · USB 3.0',
      category: cid('Networking'), brand: 'Netgear',
      price: 399.99,
      stock: 16, minStock: 5, salesCount: 13,
      specs: { Standard: 'Wi-Fi 6 (802.11ax)', Speed: 'AX6000', Streams: '12-stream', Processor: '1.8GHz Quad-core', Ports: '2.5G WAN + 4x Gigabit LAN + USB 3.0' },
      images: ['https://placehold.co/800x600/0c1a2e/38bdf8?text=Nighthawk+AX12'],
      tags: ['netgear', 'nighthawk', 'router', 'wifi6', 'networking'], isPublished: true,
    },
    {
      sku: 'TV-NET-0003',
      name: 'Ubiquiti UniFi U6 Pro',
      description: 'Ubiquiti UniFi U6 Pro Wi-Fi 6 access point, 4x4 MU-MIMO, 5.3 Gbps aggregate throughput, 300+ client devices.',
      shortDescription: 'Wi-Fi 6 · 4x4 MU-MIMO · 5.3Gbps · 300+ clients',
      category: cid('Networking'), brand: 'Ubiquiti',
      price: 179.99,
      stock: 20, minStock: 6, salesCount: 16,
      specs: { Standard: 'Wi-Fi 6 (802.11ax)', Bands: 'Dual-band (2.4+5GHz)', Streams: '4x4 MU-MIMO', Throughput: '5.3 Gbps aggregate', POE: 'PoE+ (48V 13.5W)' },
      images: ['https://placehold.co/800x600/0c1a2e/38bdf8?text=UniFi+U6+Pro'],
      tags: ['ubiquiti', 'unifi', 'access-point', 'wifi6', 'enterprise', 'networking'], isPublished: true,
    },
    {
      sku: 'TV-NET-0004',
      name: 'Synology DS923+ NAS',
      description: 'Synology DS923+ 4-bay NAS with AMD Ryzen R1600, 4GB ECC RAM, dual 1GbE + optional 10GbE. Ideal for home office.',
      shortDescription: '4-bay NAS · Ryzen R1600 · 4GB ECC · Expandable',
      category: cid('Networking'), brand: 'Synology',
      price: 599.99,
      stock: 14, minStock: 4, salesCount: 7,
      specs: { Bays: '4x 3.5"/2.5"', Processor: 'AMD Ryzen R1600 Dual-core 2.6GHz', Memory: '4GB ECC DDR4 (expandable to 32GB)', Network: 'Dual 1GbE (10GbE card optional)', OS: 'DiskStation Manager (DSM)' },
      images: ['https://placehold.co/800x600/0c1a2e/38bdf8?text=DS923%2B+NAS'],
      tags: ['synology', 'nas', 'storage', 'networking', 'home-server'], isPublished: true,
    },
    {
      sku: 'TV-NET-0005',
      name: 'TP-Link TL-SG108E 8-Port Switch',
      description: 'TP-Link TL-SG108E 8-port Gigabit Easy Smart managed switch with VLAN, QoS, bandwidth control.',
      shortDescription: '8-port Gigabit · VLAN · QoS · Easy Smart managed',
      category: cid('Networking'), brand: 'TP-Link',
      price: 49.99,
      stock: 4, minStock: 8, salesCount: 33,
      specs: { Ports: '8x Gigabit RJ45', Management: 'Easy Smart (web UI + app)', Features: 'VLAN, QoS, loop prevention', 'Switching Capacity': '16 Gbps', Power: 'External adapter' },
      images: ['https://placehold.co/800x600/0c1a2e/38bdf8?text=TL-SG108E+Switch'],
      tags: ['tp-link', 'switch', 'gigabit', 'vlan', 'networking'], isPublished: true,
    },

    // ── Smart Home (5) ───────────────────────────────────────────────────────
    {
      sku: 'TV-SMH-0001',
      name: 'Apple HomePod mini',
      description: 'Apple HomePod mini with S5 chip, 360° audio, Intercom, smart home hub for Matter/HomeKit/Thread.',
      shortDescription: 'S5 chip · 360° audio · Siri · Smart home hub',
      category: cid('Smart Home'), brand: 'Apple',
      price: 99.99,
      stock: 50, minStock: 15, salesCount: 87,
      specs: { Chip: 'Apple S5', Audio: '360° audio', Voice: 'Siri', 'Smart Home': 'HomeKit + Thread + Matter hub', Connectivity: 'Wi-Fi 4 + Bluetooth 5.0' },
      images: ['https://placehold.co/800x600/082b1a/86efac?text=HomePod+mini'],
      tags: ['apple', 'homepod', 'smart-speaker', 'homekit', 'siri'], isPublished: true,
    },
    {
      sku: 'TV-SMH-0002',
      name: 'Amazon Echo Show 10',
      description: 'Amazon Echo Show 10 with 10.1" HD display that auto-rotates to face you, Alexa, smart home hub, 13MP camera.',
      shortDescription: '10.1" HD · Rotating · Alexa · 13MP camera',
      category: cid('Smart Home'), brand: 'Amazon',
      price: 249.99,
      stock: 22, minStock: 6, salesCount: 24,
      specs: { Display: '10.1" HD 1280x800 (rotating)', Camera: '13MP', Voice: 'Alexa', 'Smart Home': 'Zigbee + Matter + Sidewalk hub', Audio: '2.1 stereo + tweeters' },
      images: ['https://placehold.co/800x600/082b1a/86efac?text=Echo+Show+10'],
      tags: ['amazon', 'echo', 'smart-display', 'alexa', 'smart-home'], isPublished: true,
    },
    {
      sku: 'TV-SMH-0003',
      name: 'Google Nest Hub Max',
      description: 'Google Nest Hub Max with 10" HD display, Google Assistant, built-in Nest camera, Duo video calling.',
      shortDescription: '10" HD · Google Assistant · Nest Cam · Duo calls',
      category: cid('Smart Home'), brand: 'Google',
      price: 229.99,
      stock: 18, minStock: 6, salesCount: 21,
      specs: { Display: '10" HD 1280x800', Camera: '6.5MP Nest camera', Voice: 'Google Assistant', Audio: '2x 10W woofer + 2x 10mm tweeter', Connectivity: 'Wi-Fi 5 + Bluetooth 5.0' },
      images: ['https://placehold.co/800x600/082b1a/86efac?text=Nest+Hub+Max'],
      tags: ['google', 'nest', 'smart-display', 'assistant', 'smart-home'], isPublished: true,
    },
    {
      sku: 'TV-SMH-0004',
      name: 'Philips Hue Starter Kit',
      description: 'Philips Hue White & Color Ambiance E27 starter kit with 4 bulbs and Hue Bridge. Works with Alexa, Google, Apple Home.',
      shortDescription: '4x E27 bulbs · Hue Bridge · 16M colors · Voice control',
      category: cid('Smart Home'), brand: 'Philips',
      price: 199.99,
      stock: 30, minStock: 10, salesCount: 39,
      specs: { Contents: '4x E27 bulbs + Hue Bridge', Colors: '16 million colors + whites', Control: 'App + voice + switch', Compatibility: 'Alexa, Google, Apple Home, Matter', Protocol: 'Zigbee + Matter bridge' },
      images: ['https://placehold.co/800x600/082b1a/86efac?text=Philips+Hue+Kit'],
      tags: ['philips', 'hue', 'smart-lighting', 'homekit', 'smart-home'], isPublished: true,
    },
    {
      sku: 'TV-SMH-0005',
      name: 'Ring Video Doorbell Pro 2',
      description: 'Ring Video Doorbell Pro 2 with 3D Motion Detection, Bird\'s Eye View, 1536p HD video, Head-to-Toe view, hardwired.',
      shortDescription: '1536p HD · 3D Motion · Bird\'s Eye · Head-to-Toe',
      category: cid('Smart Home'), brand: 'Ring',
      price: 249.99,
      stock: 0, minStock: 6, salesCount: 18,
      specs: { Video: '1536p HD with HDR', FOV: '150° horizontal, 150° vertical (Head-to-Toe)', Motion: '3D Motion Detection + Bird\'s Eye View', Power: 'Hardwired', Connectivity: 'Wi-Fi 2.4+5GHz' },
      images: ['https://placehold.co/800x600/082b1a/86efac?text=Ring+Doorbell+Pro+2'],
      tags: ['ring', 'doorbell', 'security', 'smart-home', 'amazon'], isPublished: true,
    },

    // ── Accessories (9) ──────────────────────────────────────────────────────
    {
      sku: 'TV-ACC-0001',
      name: 'Anker USB-C Hub 7-in-1',
      description: '7-in-1 USB-C hub with 4K HDMI, 100W Power Delivery pass-through, 2x USB-A 3.0, SD + microSD card reader.',
      shortDescription: '7-in-1 · 4K HDMI · 100W PD · SD reader',
      category: cid('Accessories'), brand: 'Anker',
      price: 49.99,
      stock: 150, minStock: 20, salesCount: 210,
      specs: { Ports: '4K HDMI, 2x USB-A 3.0, USB-C Data, SD, microSD', 'Power Delivery': '100W pass-through', Video: '4K@30Hz', Compatibility: 'MacBook, iPad, Windows, Chromebook' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=Anker+Hub+7-in-1'],
      tags: ['anker', 'hub', 'usb-c', 'accessories', '4k'], isFeatured: true, isPublished: true,
    },
    {
      sku: 'TV-ACC-0002',
      name: 'Apple MagSafe Charger',
      description: 'Apple MagSafe Charger for iPhone 12 and later. Magnetically aligns for optimal wireless charging at up to 15W.',
      shortDescription: 'MagSafe · Up to 15W · USB-C cable included',
      category: cid('Accessories'), brand: 'Apple',
      price: 39.99,
      stock: 80, minStock: 25, salesCount: 156,
      specs: { Output: 'Up to 15W (iPhone 12+)', Standard: 'MagSafe magnetic alignment', Connector: 'USB-C (cable to adapter)', Compatibility: 'iPhone 12–15 series, MagSafe cases', Cable: '1m USB-C' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=MagSafe+Charger'],
      tags: ['apple', 'magsafe', 'charger', 'wireless', 'accessories'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0003',
      name: 'Belkin 3-in-1 MagSafe Charger',
      description: 'Belkin BoostCharge Pro 3-in-1 wireless charging pad with MagSafe for iPhone, Apple Watch, and AirPods simultaneously.',
      shortDescription: 'iPhone MagSafe + Apple Watch + AirPods · 15W',
      category: cid('Accessories'), brand: 'Belkin',
      price: 149.99,
      stock: 35, minStock: 10, salesCount: 42,
      specs: { 'iPhone Output': 'Up to 15W MagSafe', 'Watch Output': 'Apple Watch fast charging', Devices: '3 simultaneously', Adapter: '30W included', Compatibility: 'iPhone 12+, AirPods Pro, Apple Watch' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=Belkin+3-in-1'],
      tags: ['belkin', 'magsafe', 'charger', 'wireless', 'accessories'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0004',
      name: 'Spigen Liquid Air Case',
      description: 'Spigen Liquid Air matte black case for iPhone 15 Pro. Slim fit, flexible TPU, spider-web pattern, drop protection.',
      shortDescription: 'iPhone 15 Pro · Slim TPU · Spider-web grip · Matte',
      category: cid('Accessories'), brand: 'Spigen',
      price: 14.99,
      stock: 120, minStock: 30, salesCount: 203,
      specs: { Material: 'Flexible TPU', Compatibility: 'iPhone 15 Pro', Protection: 'Drop-tested 7.5ft (MIL-STD-810G)', Texture: 'Spider-web matte', Color: 'Matte Black' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=Spigen+Liquid+Air'],
      tags: ['spigen', 'case', 'iphone', 'accessories', 'protection'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0005',
      name: 'UAG Metropolis Slim Case',
      description: 'Urban Armor Gear Metropolis Slim for Samsung Galaxy S24 Ultra. Tough, slim case with MagSafe and card slot.',
      shortDescription: 'Galaxy S24 Ultra · MagSafe · Card slot · Slim tough',
      category: cid('Accessories'), brand: 'UAG',
      price: 49.99,
      stock: 40, minStock: 12, salesCount: 31,
      specs: { Material: 'Lightweight composite', Compatibility: 'Samsung Galaxy S24 Ultra', Features: 'MagSafe + card slot', Protection: 'MIL-STD-810G drop rated', Thickness: '1.2mm' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=UAG+Metropolis'],
      tags: ['uag', 'case', 'samsung', 'accessories', 'protection'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0006',
      name: 'Twelve South BookArc',
      description: 'Twelve South BookArc vertical stand for MacBook. Space-saving design stores MacBook vertically when using external display.',
      shortDescription: 'MacBook vertical stand · Space-saving · USB-C + MagSafe',
      category: cid('Accessories'), brand: 'Twelve South',
      price: 79.99,
      stock: 4, minStock: 6, salesCount: 14,
      specs: { Material: 'Aluminum + silicone inserts', Compatibility: 'MacBook Pro/Air (USB-C or MagSafe)', Design: 'Vertical stand, pass-through cable slot', Footprint: '8.25 × 3.2 cm', Color: 'Silver' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=BookArc+Stand'],
      tags: ['twelve-south', 'stand', 'macbook', 'accessories', 'desk'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0007',
      name: 'UGREEN Nexode 100W GaN Charger',
      description: 'UGREEN Nexode 100W 4-port GaN charger (3x USB-C + 1x USB-A) with PPS, PD 3.0. Charges MacBook Pro + iPhone + iPad simultaneously.',
      shortDescription: '100W GaN · 3x USB-C + 1x USB-A · PPS + PD 3.0',
      category: cid('Accessories'), brand: 'UGREEN',
      price: 89.99,
      stock: 60, minStock: 20, salesCount: 71,
      specs: { Output: '100W total (3x USB-C + 1x USB-A)', Technology: 'GaN, PD 3.0, PPS', 'Max Single Port': '100W (USB-C)', Size: 'Compact desktop form', Compatibility: 'MacBook, iPad, iPhone, Android' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=Nexode+100W+GaN'],
      tags: ['ugreen', 'charger', 'gan', 'usb-c', 'accessories', '100w'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0008',
      name: 'Satechi USB-C Slim Multi-Port Hub',
      description: 'Satechi USB-C Slim Multi-Port hub with 4K HDMI, 60W PD, USB-A 3.0, SD/microSD reader — perfect for MacBook.',
      shortDescription: '4K HDMI · 60W PD · USB-A · SD · Slim design',
      category: cid('Accessories'), brand: 'Satechi',
      price: 79.99,
      stock: 45, minStock: 12, salesCount: 48,
      specs: { Ports: '4K HDMI, USB-A 3.0, USB-C PD 60W, SD, microSD', Video: '4K@60Hz', 'Power Delivery': '60W pass-through', Design: 'Slim aluminum body', Compatibility: 'MacBook Pro/Air, iPad Pro' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=Satechi+Hub'],
      tags: ['satechi', 'hub', 'usb-c', 'accessories', 'macbook'], isPublished: true,
    },
    {
      sku: 'TV-ACC-0009',
      name: 'Elgato Facecam MK.2',
      description: 'Elgato Facecam MK.2 1080p60 full-HD webcam with Sony STARVIS sensor, f/2.4 lens, 84° FOV, no compression.',
      shortDescription: '1080p60 · Sony STARVIS · f/2.4 · No compression',
      category: cid('Accessories'), brand: 'Elgato',
      price: 199.99,
      stock: 25, minStock: 8, salesCount: 17,
      specs: { Resolution: '1080p@60fps (uncompressed)', Sensor: 'Sony STARVIS CMOS', Aperture: 'f/2.4 fixed focus', FOV: '84° diagonal', Connectivity: 'USB-C' },
      images: ['https://placehold.co/800x600/1e293b/94a3b8?text=Facecam+MK.2'],
      tags: ['elgato', 'webcam', 'streaming', 'accessories', '1080p'], isPublished: true,
    },
  ];
};

// ─── Coupons ─────────────────────────────────────────────────────────────────
const COUPONS = [
  {
    code: 'WELCOME10',
    type: 'percentage',
    value: 10,
    minOrderAmount: 50,
    usageLimit: 1000,
    perUserLimit: 1,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2026-12-31'),
    isActive: true,
  },
  {
    code: 'SAVE50',
    type: 'fixed',
    value: 50,
    minOrderAmount: 300,
    usageLimit: 200,
    perUserLimit: 2,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2026-12-31'),
    isActive: true,
  },
  {
    code: 'TECHFEST20',
    type: 'percentage',
    value: 20,
    maxDiscountAmount: 200,
    minOrderAmount: 500,
    usageLimit: 100,
    perUserLimit: 1,
    validFrom: new Date('2024-06-01'),
    validUntil: new Date('2026-06-30'),
    isActive: true,
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────
const seed = async (force = false) => {
  await connectDB();

  if (force) {
    warn('--force flag detected — dropping existing seed collections');
    const dropSafe = (model) =>
      model.collection.drop().catch((err) => {
        if (err.codeName !== 'NamespaceNotFound') throw err;
      });
    await Promise.all([
      dropSafe(User), dropSafe(Category), dropSafe(Product),
      dropSafe(Order), dropSafe(Coupon), dropSafe(Review), dropSafe(Notification),
    ]);
    log('Existing data cleared');
  } else {
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      warn('Database already contains data. Run with --force to reseed.');
      warn('Skipping seed — no changes made.');
      process.exit(0);
    }
  }

  // ── 1. Categories ────────────────────────────────────────────────────────────
  const categories = await Category.insertMany(CATEGORIES);
  log(`Categories created (${categories.length})`);
  categories.forEach(cat => info(`${cat.name} → ${cat._id}`));

  // ── 2. Users ─────────────────────────────────────────────────────────────────
  const users = await User.create(USERS);
  log(`Users created (${users.length})`);
  users.forEach(u => info(`${u.email} [${u.role}]`));

  const alice = users.find(u => u.email === 'alice@example.com');
  const bob   = users.find(u => u.email === 'bob@example.com');

  // ── 3. Products ───────────────────────────────────────────────────────────────
  const catMap = new Map(categories.map(c => [c.name, c]));
  const products = await Product.create(buildProducts(catMap));
  log(`Products created (${products.length})`);
  products.forEach(p => info(`${p.sku}  ${p.name} — $${p.price} (stock: ${p.stock})`));

  const mbp    = products.find(p => p.name.includes('MacBook Pro'));
  const iphone = products.find(p => p.name.includes('iPhone 15 Pro'));
  const sony   = products.find(p => p.name.includes('Sony WH'));
  const anker  = products.find(p => p.name.includes('Anker USB-C Hub'));

  // ── 4. Orders ─────────────────────────────────────────────────────────────────
  const shippingAlice = { street: '10 Dizengoff St', city: 'Tel Aviv', zip: '64332', country: 'IL' };
  const shippingBob   = { street: '5 Allenby Rd',    city: 'Haifa',    zip: '31022', country: 'IL' };

  const buildOrder = (user, shippingAddress, items, status, paymentStatus, createdAt) => {
    const subtotal  = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
    const taxRate   = 0.17;
    const taxAmount = parseFloat((subtotal * taxRate).toFixed(2));
    const total     = parseFloat((subtotal + taxAmount).toFixed(2));
    return {
      orderNumber: orderNum(),
      user: user._id,
      items,
      shippingAddress,
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxAmount,
      shippingCost: 0,
      total,
      status,
      paymentStatus,
      createdAt,
      updatedAt: createdAt,
    };
  };

  const orders = await Order.insertMany([
    buildOrder(
      alice, shippingAlice,
      [
        { product: mbp._id,   name: mbp.name,   sku: mbp.sku,   image: mbp.images[0],   unitPrice: mbp.price,   quantity: 1, totalPrice: mbp.price },
        { product: anker._id, name: anker.name, sku: anker.sku, image: anker.images[0], unitPrice: anker.price, quantity: 2, totalPrice: anker.price * 2 },
      ],
      'delivered', 'paid', daysAgo(45)
    ),
    buildOrder(
      alice, shippingAlice,
      [
        { product: iphone._id, name: iphone.name, sku: iphone.sku, image: iphone.images[0], unitPrice: iphone.price, quantity: 1, totalPrice: iphone.price },
      ],
      'shipped', 'paid', daysAgo(10)
    ),
    buildOrder(
      alice, shippingAlice,
      [
        { product: sony._id, name: sony.name, sku: sony.sku, image: sony.images[0], unitPrice: sony.price, quantity: 1, totalPrice: sony.price },
      ],
      'pending', 'unpaid', daysAgo(1)
    ),
    buildOrder(
      bob, shippingBob,
      [
        { product: iphone._id, name: iphone.name, sku: iphone.sku, image: iphone.images[0], unitPrice: iphone.price, quantity: 2, totalPrice: iphone.price * 2 },
      ],
      'confirmed', 'paid', daysAgo(5)
    ),
    buildOrder(
      bob, shippingBob,
      [
        { product: mbp._id, name: mbp.name, sku: mbp.sku, image: mbp.images[0], unitPrice: mbp.price, quantity: 1, totalPrice: mbp.price },
      ],
      'refunded', 'refunded', daysAgo(20)
    ),
  ]);
  log(`Orders created (${orders.length})`);
  orders.forEach(o => info(`${o.orderNumber} [${o.status}] — $${o.total}`));

  // ── 5. Reviews ────────────────────────────────────────────────────────────────
  await Review.insertMany([
    { user: alice._id, product: mbp._id,   rating: 5, title: 'Absolutely love it',   body: 'The M3 Pro chip is insanely fast. Battery lasts all day. Best laptop I have ever owned.',        isVerified: true },
    { user: bob._id,   product: iphone._id, rating: 4, title: 'Great phone, pricey',  body: 'Camera is incredible. Battery life improved a lot over previous gen. A bit expensive.',           isVerified: true },
    { user: alice._id, product: anker._id,  rating: 5, title: 'Must-have accessory',  body: 'Works perfectly with my MacBook. All ports function as expected. Great value.',                    isVerified: true },
    { user: bob._id,   product: sony._id,   rating: 5, title: 'Best headphones ever', body: 'Noise cancellation is unreal. Perfect for the office and long flights. 30h battery is spot on.',  isVerified: true },
  ]);
  log('Reviews created (4)');

  // ── 6. Coupons ────────────────────────────────────────────────────────────────
  const coupons = await Coupon.insertMany(COUPONS);
  log(`Coupons created (${coupons.length})`);
  coupons.forEach(cp => info(`${cp.code} — ${cp.type} ${cp.value}${cp.type === 'percentage' ? '%' : '$'}`));

  // ── 7. Notifications ──────────────────────────────────────────────────────────
  await Notification.insertMany([
    { user: alice._id, type: 'order_confirmed', title: 'Order Confirmed',          message: `Your order ${orders[0].orderNumber} has been placed successfully.`, isRead: true  },
    { user: alice._id, type: 'order_shipped',   title: 'Your order is on its way', message: `Order ${orders[1].orderNumber} has been shipped.`,                  isRead: false },
    { user: bob._id,   type: 'order_confirmed', title: 'Order Confirmed',          message: `Your order ${orders[3].orderNumber} has been placed successfully.`, isRead: false },
  ]);
  log('Notifications created (3)');

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n' + c.bold('─'.repeat(55)));
  console.log(c.bold(c.green('  Seed complete!')));
  console.log(c.bold('─'.repeat(55)));
  console.log('');
  console.log(`  ${products.length} products across ${categories.length} categories`);
  console.log('');
  console.log('  Test credentials:');
  console.log(c.dim('  superadmin@techvault.dev  /  Admin123!  [superadmin]'));
  console.log(c.dim('  admin@techvault.dev       /  Admin123!  [admin]'));
  console.log(c.dim('  warehouse@techvault.dev   /  Admin123!  [warehouse]'));
  console.log(c.dim('  alice@example.com         /  User123!   [user]'));
  console.log(c.dim('  bob@example.com           /  User123!   [user]'));
  console.log('');
  console.log('  Test coupon codes:  WELCOME10 · SAVE50 · TECHFEST20');
  console.log(c.bold('─'.repeat(55)));
  console.log('');
};

// ─── Entry point ──────────────────────────────────────────────────────────────
const force = process.argv.includes('--force');

seed(force)
  .catch(err => {
    console.error(c.red('\n  Seed failed: ') + err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => mongoose.connection.close());
