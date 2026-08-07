import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Plus, Loader, ImageOff, Hourglass, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { useCart } from '../../../hooks/useCart';
import { useWishlist } from '../../../hooks/useWishlist';
import { useToast } from '../../../hooks/useToast';
import { useLanguage } from '../../../context/LanguageContext';
import s from './DealProductCard.module.css';

const LOW_STOCK_THRESHOLD = 10;

// Countdown ticks purely off the real campaign endDate — same proven
// approach as HomePage's weekly-deal countdown (derive-only, never a
// client-stored/resettable timer, cleans up its interval on unmount).
function useCountdown(endDate) {
  const targetRef = useRef(endDate ? Date.parse(endDate) : null);
  const [secs, setSecs] = useState(() =>
    targetRef.current ? Math.max(0, Math.floor((targetRef.current - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    if (!endDate) { setSecs(null); return; }
    targetRef.current = Date.parse(endDate);

    const tick = () => {
      const remaining = Math.max(0, Math.floor((targetRef.current - Date.now()) / 1000));
      setSecs(remaining);
      if (remaining <= 0) clearInterval(id);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  return secs;
}

// Real ecommerce interactions only — cart/wishlist/routing are the shared
// hooks used everywhere else; this component owns presentation only
// (Sapir's enlarged deal-card layout with an optional inline countdown).
export default function DealProductCard({ product, endDate, showCountdown = false }) {
  const { addItem } = useCart();
  const { isInWishlist, toggle } = useWishlist();
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [imgError, setImgError] = useState(false);

  const secs = useCountdown(showCountdown ? endDate : null);
  const expired = showCountdown && secs != null && secs <= 0;

  const wished = isInWishlist(product.id);
  const hasImage = !imgError && !!product.image;
  const outOfStock = !(product.stock > 0);
  const lowStock = !outOfStock && product.stock <= LOW_STOCK_THRESHOLD;

  const savings = Math.max(0, Math.round((product.price - product.discountedPrice) * 100) / 100);

  const goToProduct = () => navigate(`/products/${product.slug}`);

  const handleWishlist = (e) => {
    e.stopPropagation();
    toggle(product.id);
  };

  const handleAddToCart = async (e) => {
    e.stopPropagation();
    if (outOfStock || expired || adding) return;
    setAdding(true);
    try {
      await addItem(product.id, 1, {
        name: product.name,
        price: product.discountedPrice,
        image: product.image ?? '',
        originalPrice: product.price,
      });
      toast.success(`${product.name} ${t('product.added_to_cart_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setAdding(false);
    }
  };

  const d  = showCountdown && secs != null ? String(Math.floor(secs / 86400)).padStart(2, '0') : null;
  const h  = showCountdown && secs != null ? String(Math.floor((secs % 86400) / 3600)).padStart(2, '0') : null;
  const m  = showCountdown && secs != null ? String(Math.floor((secs % 3600) / 60)).padStart(2, '0') : null;

  return (
    <article className={s.card} onClick={goToProduct}>
      <div className={s.imageWrap}>
        {hasImage ? (
          <img
            className={s.image}
            src={product.image}
            alt={product.name}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={s.imageFallback} aria-hidden="true">
            <ImageOff size={28} strokeWidth={1.5} />
          </div>
        )}

        <div className={s.badges}>
          <span className={s.badgeSale}>−{product.discountPercent}%</span>
        </div>

        <button
          className={`${s.heartBtn}${wished ? ' ' + s.heartActive : ''}`}
          onClick={handleWishlist}
          aria-label={wished ? t('product.remove_from_wishlist') : t('product.add_to_wishlist')}
          aria-pressed={wished}
        >
          <Heart size={14} fill={wished ? '#f43f5e' : 'none'} stroke={wished ? '#f43f5e' : 'currentColor'} />
        </button>

        {outOfStock && <div className={s.outOfStock}>{t('product.out_of_stock')}</div>}
      </div>

      <div className={s.body}>
        {product.brand && <div className={s.brand}>{product.brand}</div>}
        <div className={s.name}>{product.name}</div>

        {product.ratings?.count > 0 && (
          <div className={s.rating}>
            <span className={s.stars}>
              {'★'.repeat(Math.round(product.ratings.average)) + '☆'.repeat(5 - Math.round(product.ratings.average))}
            </span>
            <span className={s.rcount}>({product.ratings.count})</span>
          </div>
        )}

        {!outOfStock && (
          <div className={`${s.stock}${lowStock ? ' ' + s.stockLow : ''}`}>
            {lowStock ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            {lowStock
              ? `${t('product.low_stock_prefix')} ${product.stock} ${t('product.low_stock_suffix')}`
              : t('product.in_stock')}
          </div>
        )}

        {showCountdown && secs != null && (
          expired ? (
            <div className={`${s.countdownLabel} ${s.countdownExpired}`}>
              <AlertTriangle size={11} /> {t('deals.card_expired')}
            </div>
          ) : (
            <>
              <div className={s.countdownLabel}>
                <Hourglass size={11} /> {t('deals.ends_in')}
              </div>
              <div className={s.countdownBlocks} dir="ltr">
                <div className={s.cBlock}><span className={s.cNum}>{d}</span><span className={s.cLbl}>{t('deals.days_full')}</span></div>
                <div className={s.cBlock}><span className={s.cNum}>{h}</span><span className={s.cLbl}>{t('deals.hours_full')}</span></div>
                <div className={s.cBlock}><span className={s.cNum}>{m}</span><span className={s.cLbl}>{t('deals.mins_full')}</span></div>
              </div>
            </>
          )
        )}

        <div className={s.prices}>
          <span className={s.price}>₪{Number(product.discountedPrice).toLocaleString()}</span>
          <span className={s.priceOld}>₪{Number(product.price).toLocaleString()}</span>
          <span className={s.priceDisc}>−{product.discountPercent}%</span>
        </div>

        {savings > 0 && (
          <div className={s.save}>{t('product.saved_prefix')} ₪{savings.toLocaleString()}</div>
        )}

        <div className={s.actions}>
          <button
            className={s.addBtn}
            onClick={handleAddToCart}
            disabled={adding || outOfStock || expired}
          >
            {adding
              ? <Loader size={14} className={s.spin} />
              : <Plus size={14} />}
            {expired
              ? t('deals.card_expired')
              : outOfStock
              ? t('product.out_of_stock')
              : adding
              ? t('product.adding')
              : t('product.add_to_cart_btn')}
          </button>
          <button className={s.viewBtn} onClick={(e) => { e.stopPropagation(); goToProduct(); }}>
            <ExternalLink size={13} /> {t('deals.view_product')}
          </button>
        </div>
      </div>
    </article>
  );
}
