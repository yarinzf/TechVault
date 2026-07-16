import { useState, useCallback } from 'react';

const KEY      = 'techvault_recently_viewed';
const MAX      = 10;

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
};

export function useRecentlyViewed() {
  const [items, setItems] = useState(read);

  const track = useCallback((product) => {
    if (!product?._id) return;
    const entry = {
      productId: String(product._id),
      slug:      product.slug,
      name:      product.name,
      nameHe:    product.nameHe || '',
      image:     product.images?.[0] ?? '',
      price:     product.discountedPrice ?? product.price,
      viewedAt:  Date.now(),
    };
    const next = [entry, ...read().filter(p => p.productId !== entry.productId)].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    setItems(next);
  }, []);

  return { items, track };
}
