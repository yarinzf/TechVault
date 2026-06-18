import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { wishlistService } from '../api/wishlist.service';

export const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Set of product ID strings — for O(1) isInWishlist checks
  const [ids, setIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  // Sync with server when user logs in/out
  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    setLoading(true);
    wishlistService.get()
      .then(wishlist => {
        setIds(new Set((wishlist.products ?? []).map(p => String(p._id ?? p))));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const isInWishlist = useCallback((productId) => ids.has(String(productId)), [ids]);

  const toggle = useCallback(async (productId) => {
    if (!user) {
      toast.info('התחבר כדי לשמור מוצרים למועדפים');
      return;
    }
    const id = String(productId);
    const wasIn = ids.has(id);

    // Optimistic update
    setIds(prev => {
      const next = new Set(prev);
      wasIn ? next.delete(id) : next.add(id);
      return next;
    });

    try {
      if (wasIn) {
        await wishlistService.remove(productId);
      } else {
        await wishlistService.add(productId);
        toast.success('נשמר למועדפים');
      }
    } catch (err) {
      // Revert on failure
      setIds(prev => {
        const next = new Set(prev);
        wasIn ? next.add(id) : next.delete(id);
        return next;
      });
      toast.error(err.message || 'שגיאה בעדכון המועדפים');
    }
  }, [user, ids, toast]);

  return (
    <WishlistContext.Provider value={{ ids, isInWishlist, toggle, loading }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return ctx;
}
