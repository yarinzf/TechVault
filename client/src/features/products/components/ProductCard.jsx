import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Plus, Loader, ImageOff, Crown, TrendingUp, ExternalLink } from 'lucide-react';
import { useCart }     from '../../../hooks/useCart';
import { useWishlist } from '../../../hooks/useWishlist';
import { useToast }    from '../../../hooks/useToast';
import { useLanguage } from '../../../context/LanguageContext';
import { getLocalizedProductName } from '../utils/localizedProduct';
import s from './ProductCard.module.css';

// rankLabel/salesCount/contextBadge/showViewButton are additive, opt-in
// presentation props for the Best Sellers rank-card treatment (Sapir's
// .bs-rank-card) — every existing caller (HomePage's showRanks preview,
// CatalogPage, NewArrivalsPage, WishlistPage, RelatedProducts) omits them
// and renders exactly as before. Real cart/wishlist hooks, routing, stock
// and campaign pricing are shared unchanged — no forked business logic.
export default function ProductCard({
  product, rank, fit = 'cover', arrivalLabel,
  rankLabel = false, salesCount = null, salesCountLabel = null, contextBadge = null, showViewButton = false,
}) {
  const { addItem }              = useCart();
  const { isInWishlist, toggle } = useWishlist();
  const { toast }                = useToast();
  const { t, language }          = useLanguage();
  const navigate                 = useNavigate();
  const [adding, setAdding]      = useState(false);
  const [imgError, setImgError]  = useState(false);

  const wished = isInWishlist(product._id);
  const displayName = getLocalizedProductName(product, language);
  const hasImage = !imgError && !!product.images?.[0];

  const handleWishlist = (e) => {
    e.stopPropagation();
    toggle(product._id);
  };

  // "On sale" means ONLY a currently active Campaign discounts this product
  // (discountedPrice/discountPercent, injected server-side — see
  // server/services/product.service.js). compareAtPrice is a legacy/
  // reference-price field and must never independently produce a
  // strikethrough price or a discount badge.
  const hasDiscount         = product.discountedPrice != null && product.discountedPrice < product.price;
  const displayPrice        = hasDiscount ? product.discountedPrice : product.price;
  const strikethroughPrice  = hasDiscount ? product.price : null;
  const discountPct         = hasDiscount ? product.discountPercent : null;

  const handleAddToCart = async (e) => {
    e.stopPropagation();
    if (product.stock === 0) return;
    setAdding(true);
    try {
      await addItem(product._id, 1, {
        name:          displayName,
        price:         displayPrice,
        image:         product.images?.[0] ?? '',
        originalPrice: hasDiscount ? product.price : null,
      });
      toast.success(`${displayName} ${t('product.added_to_cart_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setAdding(false);
    }
  };

  const rankClass = rank === 1 ? s.gold : rank === 2 ? s.silver : rank === 3 ? s.bronze : '';
  // Card border/glow tint for rank 1-3 — only in the Best Sellers rankLabel
  // mode, never for the plain-numeral rank badge used elsewhere.
  const cardTintClass = rankLabel && rankClass ? rankClass : '';

  // Text stars matching Sapir's ★ pattern
  const avgRating  = product.ratings?.average || 0;
  const starCount  = Math.round(avgRating);
  const starStr    = '★'.repeat(Math.min(starCount, 5)) + (starCount < 5 ? '☆' : '');
  const hasRating  = product.ratings?.count > 0;

  // Spec chips — show up to 4 short, meaningful spec values
  const specChips = (() => {
    const raw = product.specs;
    if (!raw || typeof raw !== 'object') return [];
    const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw);
    // Keys worth showing as chips, in priority order
    const CHIP_KEYS = [
      'Screen Size', 'Resolution', 'Refresh Rate', 'Panel Type',
      'Keyboard Type', 'Connection', 'Layout', 'Switch Type',
      'Driver Size', 'Noise Cancellation', 'Connectivity',
      'Sensor', 'DPI', 'Form Factor',
    ];
    const SKIP_VALUES = new Set(['true', 'false', 'N/A', 'n/a', '', 'none']);
    const MAX_LEN = 20;

    const picked = [];
    const seen = new Set();
    for (const key of CHIP_KEYS) {
      if (picked.length >= 4) break;
      const match = entries.find(([k]) => k === key);
      if (!match) continue;
      const val = String(match[1]).trim();
      if (SKIP_VALUES.has(val) || val.length > MAX_LEN || seen.has(val)) continue;
      seen.add(val);
      picked.push(val);
    }
    // If priority keys didn't fill 4, grab remaining short values
    if (picked.length < 4) {
      for (const [, v] of entries) {
        if (picked.length >= 4) break;
        const val = String(v).trim();
        if (SKIP_VALUES.has(val) || val.length > MAX_LEN || seen.has(val)) continue;
        seen.add(val);
        picked.push(val);
      }
    }
    return picked;
  })();

  return (
    <article
      className={`${s.card}${cardTintClass ? ' ' + cardTintClass : ''}`}
      onClick={() => navigate(`/products/${product.slug}`)}
    >
      {/* ── Image area (.pc-img) ── */}
      <div className={s.imageWrap}>
        {hasImage
          ? (
            <img
              className={s.image}
              src={product.images[0]}
              alt={displayName}
              loading="lazy"
              style={fit === 'contain' ? { objectFit: 'contain' } : undefined}
              onError={() => setImgError(true)}
            />
          )
          : (
            <div className={s.imageFallback} aria-hidden="true">
              <ImageOff size={28} strokeWidth={1.5} />
            </div>
          )
        }

        {/* Rank badge — top right (.pc-rank) — plain numeral by default
            (HomePage's showRanks preview and any other existing caller),
            or Sapir's Best Sellers pill treatment ("מקום N" + crown for #1)
            when rankLabel is explicitly requested. */}
        {rank != null && (
          rankLabel ? (
            <div className={`${s.rankBadge} ${rankClass}`}>
              {rank === 1 && <Crown size={12} className={s.rankCrown} aria-hidden="true" />}
              <span>{t('product.rank_badge_label').replace('{rank}', rank)}</span>
            </div>
          ) : (
            <div className={`${s.rank} ${rankClass}`} aria-label={t('product.rank_badge_label').replace('{rank}', rank)}>
              {rank}
            </div>
          )
        )}

        {/* Sale + feature badges — top left (.pc-badges) */}
        <div className={s.badges}>
          {hasDiscount && discountPct && (
            <span className={`${s.badge} ${s.badgeSale}`}>−{discountPct}%</span>
          )}
          {/* Arrival label (New Arrivals page) — solid blue, distinct from the
              unrelated admin-curated `tags.includes('new')` badge below. An
              optional presentation prop; every other caller omits it and
              gets identical behavior to before. */}
          {arrivalLabel && (
            <span className={`${s.badge} ${s.badgeArrival}`}>{arrivalLabel}</span>
          )}
          {product.tags?.includes('new') && (
            <span className={`${s.badge} ${s.badgeNew}`}>{t('product.badge_new')}</span>
          )}
        </div>

        {/* Wishlist heart — top right, behind rank */}
        <button
          className={`${s.heartBtn}${wished ? ' ' + s.heartActive : ''}`}
          onClick={handleWishlist}
          aria-label={wished ? t('product.remove_from_wishlist') : t('product.add_to_wishlist')}
          aria-pressed={wished}
        >
          <Heart size={14} fill={wished ? '#f43f5e' : 'none'} stroke={wished ? '#f43f5e' : 'currentColor'} />
        </button>

        {/* Out-of-stock overlay */}
        {product.stock === 0 && (
          <div className={s.outOfStock}>{t('product.out_of_stock')}</div>
        )}
      </div>

      {/* ── Body (.pc-body) ── */}
      <div className={s.body}>
        {/* Context badge (.bs-context-badge) — Best Sellers only, deterministic */}
        {contextBadge && (
          <div className={s.contextBadge}>{contextBadge}</div>
        )}

        {/* Brand (.pc-brand) */}
        {product.brand && (
          <div className={s.brand}>{product.brand}</div>
        )}

        {/* Name (.pc-name) */}
        <div className={s.name}>{displayName}</div>

        {/* Rating (.pc-rating) */}
        {hasRating && (
          <div className={s.rating}>
            <span className={s.stars}>{starStr}</span>
            <span className={s.rcount}>({product.ratings.count})</span>
          </div>
        )}

        {/* Sales line (.bs-sales-line) — Best Sellers only, real aggregated
            units sold. salesCountLabel lets the caller supply period-correct
            wording (e.g. "...sold this month" vs plain "...sold"); falls
            back to the generic label when omitted. */}
        {salesCount != null && (
          <div className={s.salesLine}>
            <TrendingUp size={12} aria-hidden="true" />
            {salesCountLabel ?? t('product.units_sold_label').replace('{count}', salesCount.toLocaleString())}
          </div>
        )}

        {/* Spec chips (.pc-chips) — short spec highlights; omitted on the
            Best Sellers rank card to match Sapir's cleaner card layout. */}
        {specChips.length > 0 && salesCount == null && (
          <div className={s.chips}>
            {specChips.map((v, i) => (
              <span key={i} className={s.chip}>{v}</span>
            ))}
          </div>
        )}

        {/* Prices (.pc-prices) */}
        <div className={s.prices}>
          <span className={s.price}>
            ₪{Number(displayPrice).toLocaleString()}
          </span>
          {hasDiscount && strikethroughPrice && (
            <span className={s.priceOld}>
              ₪{Number(strikethroughPrice).toLocaleString()}
            </span>
          )}
          {discountPct && (
            <span className={s.priceDisc}>−{discountPct}%</span>
          )}
        </div>

        {/* Add to cart (.pc-add) — full width by default; shares a row with
            the optional secondary "View Product" button (Best Sellers rank
            card only — Sapir's card has both). */}
        <div className={showViewButton ? s.actions : undefined}>
          <button
            className={s.addBtn}
            onClick={handleAddToCart}
            disabled={adding || product.stock === 0}
          >
            {adding
              ? <Loader size={14} className={s.spin} />
              : <Plus size={14} />
            }
            {product.stock === 0
              ? t('product.out_of_stock')
              : adding
              ? t('product.adding')
              : t('product.add_to_cart_btn')}
          </button>
          {showViewButton && (
            <button
              className={s.viewBtn}
              onClick={(e) => { e.stopPropagation(); navigate(`/products/${product.slug}`); }}
            >
              <ExternalLink size={13} aria-hidden="true" /> {t('deals.view_product')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
