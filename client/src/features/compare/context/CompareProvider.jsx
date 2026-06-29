import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CompareContext = createContext(null);
const STORAGE_KEY = 'techvault_compare';
const MAX_ITEMS = 4;

function loadItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    // Migration: if old format stored {id, slug} objects, extract just the id
    return raw.map(x => (typeof x === 'object' && x !== null && x.id) ? String(x.id) : String(x));
  } catch {
    return [];
  }
}

export function CompareProvider({ children }) {
  const [items, setItems] = useState(loadItems);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  const addProduct = useCallback((id) => {
    const sid = String(id);
    setItems(prev => {
      if (prev.includes(sid) || prev.length >= MAX_ITEMS) return prev;
      return [...prev, sid];
    });
  }, []);

  const removeProduct = useCallback((id) => {
    const sid = String(id);
    setItems(prev => prev.filter(x => x !== sid));
  }, []);

  const isComparing = useCallback((id) => items.includes(String(id)), [items]);

  const clearAll = useCallback(() => setItems([]), []);

  return (
    <CompareContext.Provider value={{ items, addProduct, removeProduct, isComparing, clearAll }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used inside CompareProvider');
  return ctx;
}
