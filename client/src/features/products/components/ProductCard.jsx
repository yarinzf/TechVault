import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Plus, Loader } from 'lucide-react';
import { useCart }     from '../../../hooks/useCart';
import { useWishlist } from '../../../hooks/useWishlist';
import { useToast }    from '../../../hooks/useToast';
import { useTranslation } from '../../../context/LanguageContext';
import s from './ProductCard.module.css';

export default function ProductCard({ product, rank }) {
  const { addItem }              = useCart();
  const { isInWishlist, toggle } = useWishlist();
  const { toast }                = useToast();
  const t                        = useTranslation();
  const navigate                 = useNavigate();
  const [adding, setAdding]      = useState(false);

  const wished = isInWishlist(product._id);

  const handleWishlist = (e) => {
    e.stopPropagation();
    toggle(product._id);
  };

  const hasCampaignDiscount = product.discountedPrice != null && product.discountedPrice < product.price;
  const hasStaticDiscount   = !hasCampaignDiscount && product.compareAtPrice != null && product.compareAtPrice > product.price;
  const hasDiscount         = hasCampaignDiscount || hasStaticDiscount;
  const displayPrice        = hasCampaignDiscount ? product.discountedPrice : product.price;
  const strikethroughPrice  = hasCampaignDiscount ? product.price : product.compareAtPrice;
  const discountPct         = hasCampaignDiscount
    ? product.discountPercent
    : hasStaticDiscount
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : null;

  const handleAddToCart = async (e) => {
    e.stopPropagation();
    if (product.stock === 0) return;
    setAdding(true);
    try {
      await addItem(product._id, 1, {
        name:          product.name,
        price:         displayPrice,
        image:         product.images?.[0] ?? '',
        originalPrice: hasDiscount ? product.price : null,
      });
      toast.success(`${product.name} ${t('product.added_to_cart_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setAdding(false);
    }
  };

  const rankClass = rank === 1 ? s.gold : rank === 2 ? s.silver : rank === 3 ? s.bronze : '';

  // Text stars matching Sapir's ★ pattern
  const avgRating  = product.ratings?.average || 0;
  const starCount  = Math.round(avgRating);
  const starStr    = '★'.repeat(Math.min(starCount, 5)) + (starCount < 5 ? '☆' : '');
  const hasRating  = product.ratings?.count > 0;

  return (
    <article
      className={s.card}
      onClick={() => navigate(`/products/${product.slug}`)}
    >
      {/* ── Image area (.pc-img) ── */}
      <div className={s.imageWrap}>
        <img
          className={s.image}
          src={product.images?.[0] || 'https://picsum.photos/400/300'}
          alt={product.name}
          loading="lazy"
        />

        {/* Rank badge — top right (.pc-rank) */}
        {rank != null && (
          <div className={`${s.rank} ${rankClass}`} aria-label={`מקום ${rank}`}>
            {rank}
          </div>
        )}

        {/* Sale + feature badges — top left (.pc-badges) */}
        <div className={s.badges}>
          {hasDiscount && discountPct && (
            <span className={`${s.badge} ${s.badgeSale}`}>−{discountPct}%</span>
          )}
          {product.tags?.includes('new') && (
            <span className={`${s.badge} ${s.badgeNew}`}>חדש</span>
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
        {/* Brand (.pc-brand) */}
        {product.brand && (
          <div className={s.brand}>{product.brand}</div>
        )}

        {/* Name (.pc-name) */}
        <div className={s.name}>{product.name}</div>

        {/* Rating (.pc-rating) */}
        {hasRating && (
          <div className={s.rating}>
            <span className={s.stars}>{starStr}</span>
            <span className={s.rcount}>({product.ratings.count})</span>
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

        {/* Add to cart (.pc-add) — full width */}
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
      </div>
    </article>
  );
}
