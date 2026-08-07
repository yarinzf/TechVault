import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, CheckCircle, Tag, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useWishlist } from '../../hooks/useWishlist';
import { wishlistService } from '../../features/wishlist/api/wishlist.service';
import { productService } from '../../features/products/api/product.service';
import ProductCard from '../../features/products/components/ProductCard';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import Modal from '../../components/ui/Modal/Modal';
import Button from '../../components/ui/Button/Button';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import { useTranslation } from '../../context/LanguageContext';
import s from './WishlistPage.module.css';

// Mirrors ProductCard's own discount logic exactly (an active Campaign is
// the ONLY sale source — compareAtPrice never counts) so the "On sale"
// filter/sort never disagrees with what a card visually shows.
function hasRealDiscount(p) {
  return p.discountedPrice != null && p.discountedPrice < p.price;
}
function effectivePrice(p) {
  const hasCampaign = p.discountedPrice != null && p.discountedPrice < p.price;
  return hasCampaign ? p.discountedPrice : p.price;
}

export default function WishlistPage() {
  const { user } = useAuth();
  const { ids, clearAll, loading: idsLoading } = useWishlist();
  const navigate = useNavigate();
  const t = useTranslation();

  // Canonical product data fetched for this page — never mutated by `ids`
  // changes. WishlistProvider's `ids` is the sole source of truth for WHICH
  // products are currently wishlisted; membership is applied by *deriving*
  // `wishlistProducts` below, not by destructively filtering this array. That
  // way an optimistic remove/Clear All that later rolls back (failed API
  // call restores `ids`) automatically brings the card(s) back — the data
  // was never thrown away, just hidden.
  const [loadedProducts, setLoadedProducts] = useState([]);
  const [loading,  setLoading]        = useState(true);
  const [error,    setError]          = useState(null);
  const [filter,   setFilter]         = useState('all');
  const [sort,     setSort]           = useState('recommended');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing]       = useState(false);

  const loadWishlist = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    wishlistService.get()
      .then(w => setLoadedProducts(w.products ?? []))
      .catch(err => setError(err.message || t('wishlist.load_error')))
      .finally(() => setLoading(false));
  }, [user, t]);

  useEffect(() => { loadWishlist(); }, [loadWishlist]);

  // Derived, not stored — recomputes automatically on every `ids` change
  // (optimistic remove, rollback, Clear All, rollback) with no extra fetch.
  const wishlistProducts = useMemo(
    () => loadedProducts.filter(p => ids.has(String(p._id))),
    [loadedProducts, ids]
  );

  const filtered = useMemo(() => {
    let list = wishlistProducts;
    if (filter === 'inStock') list = list.filter(p => p.stock > 0);
    if (filter === 'onSale')  list = list.filter(hasRealDiscount);

    list = [...list];
    if (sort === 'price_asc')  list.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    if (sort === 'price_desc') list.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    if (sort === 'rating')     list.sort((a, b) => (b.ratings?.average || 0) - (a.ratings?.average || 0));
    return list;
  }, [wishlistProducts, filter, sort]);

  // "Products you might like" — real catalog data only. Deterministic, not
  // an ML system: prefer products from the wishlist's most common category,
  // topped up with best-sellers if that yields too few. Fetched once the
  // wishlist itself has loaded (its categories are the recommendation
  // basis); re-running on every `ids` change would refetch on every heart
  // click, so exclusion of already-wishlisted items happens at render time
  // via `visibleRecs` instead — same derive-don't-mutate pattern as
  // `wishlistProducts`, reusing WishlistProvider's `ids` as the only source
  // of truth for membership.
  const [recCandidates, setRecCandidates] = useState([]);

  useEffect(() => {
    if (loading || idsLoading) return;
    let cancelled = false;

    (async () => {
      const categoryCounts = new Map();
      loadedProducts.forEach((p) => {
        const slug = p.category?.slug;
        if (slug) categoryCounts.set(slug, (categoryCounts.get(slug) || 0) + 1);
      });
      const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

      let candidates = [];
      try {
        if (topCategory) {
          const { products: byCategory } = await productService.list({ category: topCategory, limit: 12 });
          candidates = byCategory;
        }
        if (candidates.length < 4) {
          const bestSellers = await productService.getBestSellers(12);
          const seen = new Set(candidates.map((p) => String(p._id)));
          candidates = [...candidates, ...bestSellers.filter((p) => !seen.has(String(p._id)))];
        }
      } catch {
        candidates = [];
      }

      if (!cancelled) setRecCandidates(candidates);
    })();

    return () => { cancelled = true; };
  }, [loading, idsLoading, loadedProducts]);

  // `loadedProducts` is only fetched once (page mount / retry) — adding a
  // product to the wishlist from a *recommendation* card updates `ids` via
  // WishlistProvider but that product's full data was never fetched into
  // `loadedProducts`, so it would raise the header badge without ever
  // appearing in the main grid below. Backfill it here from data already in
  // hand (`recCandidates`) rather than refetching — still append-only, still
  // no separate membership state, `ids` remains the sole source of truth for
  // WHICH ids are wishlisted.
  useEffect(() => {
    const known = new Set(loadedProducts.map((p) => String(p._id)));
    const missing = recCandidates.filter((p) => ids.has(String(p._id)) && !known.has(String(p._id)));
    if (missing.length > 0) {
      setLoadedProducts((prev) => [...prev, ...missing]);
    }
  }, [ids, recCandidates, loadedProducts]);

  const visibleRecs = useMemo(
    () => recCandidates.filter((p) => !ids.has(String(p._id))).slice(0, 4),
    [recCandidates, ids]
  );

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearAll();
      setConfirmOpen(false);
    } catch {
      // WishlistProvider already surfaced a toast and rolled back state —
      // keep the dialog open so the user can retry.
    } finally {
      setClearing(false);
    }
  };

  if (!user) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🔒</div>
          <h3>{t('wishlist.login_required')}</h3>
          <p>{t('wishlist.login_prompt')}</p>
          <Button onClick={() => navigate('/login')}>{t('wishlist.login_btn')}</Button>
        </div>
      </div>
    );
  }

  // Wait for BOTH the page's own product fetch and the provider's ids fetch
  // before deriving anything. Otherwise, if the page's fetch resolves first
  // while the provider's `ids` is still its initial empty Set, every loaded
  // product would momentarily filter out and flash a false empty state.
  if (loading || idsLoading) return <PageSpinner />;

  const count = wishlistProducts.length;
  const countText = count === 1
    ? t('wishlist.count_singular')
    : t('wishlist.count_plural').replace('{count}', count);

  const crumbs = [
    { label: t('product.breadcrumb_home'), href: '/' },
    { label: t('wishlist.page_title') },
  ];

  return (
    <div className={s.page}>
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Breadcrumb items={crumbs} className={s.breadcrumbNav} />
        </div>
      </div>

      <div className={s.pageInner}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>
            <span className={s.titleIcon} aria-hidden="true">❤️</span>
            {t('wishlist.page_title')}
            {!error && <span className={s.countBadge}>{countText}</span>}
          </h1>
          <p className={s.subtitle}>{t('wishlist.subtitle')}</p>
        </div>
        {!error && count > 0 && (
          <button className={s.clearAllBtn} onClick={() => setConfirmOpen(true)}>
            <Trash2 size={14} /> {t('wishlist.clear_all')}
          </button>
        )}
      </div>

      {error ? (
        <div className={s.errorState}>
          <AlertTriangle size={32} />
          <p>{error}</p>
          <Button onClick={loadWishlist}>{t('wishlist.retry')}</Button>
        </div>
      ) : count === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><Heart size={32} /></div>
          <h3>{t('wishlist.empty_title')}</h3>
          <p>{t('wishlist.empty_sub')}</p>
          <Button onClick={() => navigate('/products')}>{t('wishlist.discover')}</Button>
        </div>
      ) : (
        <>
          <div className={s.controls}>
            <div className={s.filters}>
              <button
                className={`${s.filterBtn} ${filter === 'all' ? s.filterBtnActive : ''}`}
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                {t('wishlist.filter_all')}
              </button>
              <button
                className={`${s.filterBtn} ${filter === 'inStock' ? s.filterBtnActive : ''}`}
                aria-pressed={filter === 'inStock'}
                onClick={() => setFilter('inStock')}
              >
                <CheckCircle size={13} /> {t('catalog.in_stock')}
              </button>
              <button
                className={`${s.filterBtn} ${filter === 'onSale' ? s.filterBtnActive : ''}`}
                aria-pressed={filter === 'onSale'}
                onClick={() => setFilter('onSale')}
              >
                <Tag size={13} /> {t('catalog.on_sale')}
              </button>
            </div>
            <div className={s.sortWrap}>
              <select
                className={s.sort}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label={t('catalog.sort_label')}
              >
                <option value="recommended">{t('wishlist.sort_recommended')}</option>
                <option value="price_asc">{t('sort.price_asc')}</option>
                <option value="price_desc">{t('sort.price_desc')}</option>
                <option value="rating">{t('sort.rating')}</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={s.filteredEmpty}>
              <p>{t('wishlist.filtered_empty_title')}</p>
              <button className={s.filteredEmptyBtn} onClick={() => setFilter('all')}>
                {t('wishlist.filtered_empty_action')}
              </button>
            </div>
          ) : (
            <div className={s.grid}>
              {filtered.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          )}

          {visibleRecs.length > 0 && (
            <div className={s.recs}>
              <div className={s.recsTitle}>
                <Sparkles size={20} />
                {t('wishlist.recs_title')}
              </div>
              <div className={s.recsGrid}>
                {visibleRecs.map((p) => (
                  <ProductCard key={p._id} product={p} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={confirmOpen}
        onClose={() => !clearing && setConfirmOpen(false)}
        title={t('wishlist.clear_all_confirm_title')}
        size="sm"
      >
        <p className={s.confirmBody}>{t('wishlist.clear_all_confirm_body')}</p>
        <div className={s.confirmActions}>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={clearing}>
            {t('wishlist.clear_all_cancel')}
          </Button>
          <Button variant="danger" onClick={handleClearAll} disabled={clearing}>
            {t('wishlist.clear_all_confirm_action')}
          </Button>
        </div>
      </Modal>
      </div>

      <Footer />
    </div>
  );
}
