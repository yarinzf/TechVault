import asusIcon from '../assets/icons/brands/asus.svg';
import razerIcon from '../assets/icons/brands/razer.svg';
import corsairIcon from '../assets/icons/brands/corsair.svg';
import nvidiaIcon from '../assets/icons/brands/nvidia.svg';
import msiIcon from '../assets/icons/brands/msi.svg';
import logitechIcon from '../assets/icons/brands/logitech.png';

/* Curated "Leading Brands" row for the homepage only — matches Sapir's
   reference exactly (DOM order below renders, in RTL, as the reference's
   visual left-to-right order: Logitech, MSI, NVIDIA, Corsair, Razer, ASUS).
   Logos are local assets extracted from the reference's own inline SVG/PNG
   markup (not the external, frequently-404ing simpleicons.org CDN).
   This list does not affect the real product catalog, filters, or any
   other brand — those remain fully available via /products and category
   filters regardless of what is shown here.

   queryType/queryValue drive the real /products destination generically:
   'brand' -> ?brand=<value> (the catalog's real brand filter), 'search' ->
   ?search=<value> (the catalog's real full-text search). NVIDIA uses
   'search' because no product in this catalog carries brand:'NVIDIA' —
   NVIDIA only appears as a GPU spec inside other brands' products — so
   ?brand=nvidia would correctly but unhelpfully return zero results. */
export const LEADING_BRANDS = [
  { id: 1, name: 'ASUS ROG', queryType: 'brand',  queryValue: 'asus',     iconUrl: asusIcon },
  { id: 2, name: 'Razer',    queryType: 'brand',  queryValue: 'razer',    iconUrl: razerIcon },
  { id: 3, name: 'Corsair',  queryType: 'brand',  queryValue: 'corsair',  iconUrl: corsairIcon },
  { id: 4, name: 'NVIDIA',   queryType: 'search', queryValue: 'nvidia',   iconUrl: nvidiaIcon },
  { id: 5, name: 'MSI',      queryType: 'brand',  queryValue: 'msi',      iconUrl: msiIcon },
  { id: 6, name: 'Logitech', queryType: 'brand',  queryValue: 'logitech', iconUrl: logitechIcon },
];
