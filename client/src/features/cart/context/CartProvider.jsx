import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { cartService } from '../api/cart.service';
import { getToken } from '../../../services/api';
import { useAuth } from '../../../hooks/useAuth';

// ── Guest cart localStorage helpers ──────────────────────────────────────────
const GUEST_KEY = 'techvault_guest_cart';

const loadGuestCart = () => {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]'); }
  catch { return []; }
};
const saveGuestCart = (items) => {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(items)); }
  catch {}
};
const clearGuestCart = () => {
  try { localStorage.removeItem(GUEST_KEY); }
  catch {}
};

export const CartContext = createContext(null);

/**
 * Dual-mode cart:
 *   • Authenticated  → syncs with backend API (existing behaviour, unchanged)
 *   • Guest          → stores in localStorage, no network calls
 *
 * On login:  guest items are migrated to the backend cart, then guest cart cleared.
 * On logout: guest cart localStorage is cleared, items reset to [].
 */
export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);

  // Guards against treating the initial auth-bootstrap resolution
  // as a "just logged in" transition (which would incorrectly trigger migration).
  const hasBootstrapped = useRef(false);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + (i.priceAtAdd ?? i.unitPrice ?? 0) * i.quantity, 0);

  // ── Backend cart fetch (auth only) ────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    try {
      const cart = await cartService.get();
      setItems(cart?.items ?? []);
    } catch { /* ignore — 401 will be handled by the api wrapper */ }
    finally { setLoading(false); }
  }, []);

  // ── Auth-state transitions ────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return; // wait for auth bootstrap to complete

    if (!hasBootstrapped.current) {
      // Page load / refresh — auth has just resolved for the first time
      hasBootstrapped.current = true;
      if (user) {
        fetchCart();           // logged in on load: fetch backend cart
      } else {
        setItems(loadGuestCart()); // guest on load: restore localStorage
      }
      return;
    }

    // Runtime transition during the same session
    if (user) {
      // null → user: user just logged in — migrate guest cart to backend
      const guestItems = loadGuestCart();
      if (!guestItems.length) {
        fetchCart();
        return;
      }
      setLoading(true);
      (async () => {
        for (const item of guestItems) {
          try { await cartService.addItem(item.product, item.quantity); }
          catch { /* ignore per-item failures (deleted product, out of stock) */ }
        }
        clearGuestCart();
        setLoading(false);
        fetchCart(); // load the merged backend cart
      })();
    } else {
      // user → null: user just logged out
      clearGuestCart();
      setItems([]);
    }
  }, [user, authLoading, fetchCart]);

  // ── Add item ──────────────────────────────────────────────────────────────
  // snapshot = { name, price, image, originalPrice } — required for guest mode
  // so the cart can display product info without a backend round-trip.
  const addItem = useCallback(async (productId, quantity = 1, snapshot = null) => {
    if (!user) {
      const pid = String(productId);
      setItems(prev => {
        const idx = prev.findIndex(i => String(i.product) === pid);
        let next;
        if (idx >= 0) {
          next = prev.map((item, i) =>
            i === idx ? { ...item, quantity: item.quantity + quantity } : item
          );
        } else {
          next = [...prev, {
            product:            pid,
            quantity,
            nameAtAdd:          snapshot?.name          ?? '',
            priceAtAdd:         snapshot?.price         ?? 0,
            imageAtAdd:         snapshot?.image         ?? '',
            originalPriceAtAdd: snapshot?.originalPrice ?? null,
          }];
        }
        saveGuestCart(next);
        return next;
      });
      return;
    }
    const cart = await cartService.addItem(productId, quantity);
    setItems(cart?.items ?? []);
  }, [user]);

  // ── Update item quantity ──────────────────────────────────────────────────
  const updateItem = useCallback(async (productId, quantity) => {
    const pid = String(productId);
    if (!user) {
      setItems(prev => {
        const next = quantity < 1
          ? prev.filter(i => String(i.product) !== pid)
          : prev.map(i => String(i.product) === pid ? { ...i, quantity } : i);
        saveGuestCart(next);
        return next;
      });
      return;
    }
    if (quantity < 1) {
      const cart = await cartService.removeItem(productId);
      setItems(cart?.items ?? []);
      return;
    }
    const cart = await cartService.updateItem(productId, quantity);
    setItems(cart?.items ?? []);
  }, [user]);

  // ── Remove item ───────────────────────────────────────────────────────────
  const removeItem = useCallback(async (productId) => {
    const pid = String(productId);
    if (!user) {
      setItems(prev => {
        const next = prev.filter(i => String(i.product) !== pid);
        saveGuestCart(next);
        return next;
      });
      return;
    }
    const cart = await cartService.removeItem(productId);
    setItems(cart?.items ?? []);
  }, [user]);

  // ── Clear cart ────────────────────────────────────────────────────────────
  const clearCart = useCallback(async () => {
    if (!user) {
      clearGuestCart();
      setItems([]);
      return;
    }
    await cartService.clear();
    setItems([]);
  }, [user]);

  // resetCart is called after checkout — user is always authenticated at that point
  const resetCart = useCallback(() => setItems([]), []);

  return (
    <CartContext.Provider value={{
      items, loading, totalItems, totalPrice,
      fetchCart, addItem, updateItem, removeItem, clearCart, resetCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}
