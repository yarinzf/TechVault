import { Heart, ShoppingCart, Loader, CreditCard, GitCompare, Truck, RotateCcw, ShieldCheck, Lock } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import StarRating from '../../../../components/ui/StarRating/StarRating';
import Badge from '../../../../components/ui/Badge/Badge';
import QuantitySelector from '../../../../components/ui/QuantitySelector';
import { getProductPricing } from '../../utils/pricing';
import { getStockStatus } from '../../utils/stockStatus';
import { formatWarranty } from '../../utils/warranty';
import s from './ProductBuyBox.module.css';

const TRUST_ITEMS = [
  { Icon: Truck,       textKey: 'trust.pdp_shipping' },
  { Icon: RotateCcw,   textKey: 'trust.pdp_returns'  },
  { Icon: Lock,        textKey: 'trust.pdp_secure'   },
];

// Generic, customer-facing stock message only — never the exact quantity
// (that number stays internal: quantity-selector cap, cart/checkout
// validation, admin/warehouse views).
function StockStatus({ stock, t }) {
  const tier = getStockStatus(stock);
  if (tier === 'in') {
    return (
      <div className={s.stockRow}>
        <span className={`${s.dot} ${s.dotGreen}`} />
        <span className={s.stockText}>{t('product.stock_in')}</span>
      </div>
    );
  }
  if (tier === 'low') {
    return (
      <div className={s.stockRow}>
        <span className={`${s.dot} ${s.dotOrange}`} />
        <span className={`${s.stockText} ${s.stockLow}`}>{t('product.stock_low')}</span>
      </div>
    );
  }
  return (
    <div className={s.stockRow}>
      <span className={`${s.dot} ${s.dotRed}`} />
      <span className={`${s.stockText} ${s.stockNone}`}>{t('product.out_of_stock')}</span>
    </div>
  );
}

// Data-driven — renders nothing unless the product actually carries variant
// options. No variant system exists in the catalog today (every color/size
// is its own product), so this is inert until that data exists.
function ProductVariants({ variants }) {
  if (!variants?.length) return null;
  return (
    <div className={s.variants}>
      {variants.map((v) => (
        <button key={v.value} type="button" className={`${s.variantPill}${v.active ? ' ' + s.variantActive : ''}`}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

export default function ProductBuyBox({
  product,
  qty,
  onQtyChange,
  onAddToCart,
  onBuyNow,
  adding,
  buying,
  wished,
  onToggleWishlist,
  isComparing,
  onToggleCompare,
  onScrollToReviews,
}) {
  const { t, language } = useLanguage();
  const { price, oldPrice, discountPercent, savings, hasDiscount } = getProductPricing(product);
  const outOfStock = product.stock === 0;

  const isWireless   = product.specs?.['Wireless'] === 'true' || product.specs?.['Bluetooth'] === 'true';
  const isHotSwap    = product.specs?.['Hot Swap'] === 'true';
  const isTrending   = product.tags?.includes('trending');
  const isBestSeller = product.tags?.includes('best-seller');
  const warranty     = formatWarranty(product.specs?.['Warranty'], language);

  // Only a small, intentional set of customer-facing badges — never the raw
  // internal tags array (that's catalog metadata for filtering/search).
  const hasAnyBadge = hasDiscount || isBestSeller || isTrending || isWireless || isHotSwap;

  return (
    <div className={s.buyBox}>
      {/* 1. Badges */}
      {hasAnyBadge && (
        <div className={s.badgesRow}>
          {hasDiscount && discountPercent != null && <Badge variant="error">{t('product.badge_sale')} −{discountPercent}%</Badge>}
          {isBestSeller && <span className={`${s.signal} ${s.sigSeller}`}>{t('product.badge_bestseller')}</span>}
          {isTrending   && <span className={`${s.signal} ${s.sigTrending}`}>{t('product.badge_trending')}</span>}
          {isWireless   && <span className={`${s.signal} ${s.sigWireless}`}>{t('product.badge_wireless')}</span>}
          {isHotSwap    && <span className={`${s.signal} ${s.sigHotswap}`}>{t('product.badge_hotswap')}</span>}
        </div>
      )}

      {/* 2. Brand */}
      {product.brand && <div className={s.brand}>{product.brand}</div>}

      {/* 3. Product name */}
      <h1 className={s.name}>{product.name}</h1>

      {/* 4. Short description */}
      {product.shortDescription && <p className={s.subtitle}>{product.shortDescription}</p>}

      {/* 5. Rating + review count (only when available) */}
      {product.ratings?.count > 0 && (
        <div className={s.ratingRow}>
          <StarRating value={product.ratings.average} size={16} />
          <span className={s.ratingNum}>{product.ratings.average.toFixed(1)}</span>
          <a href="#pdp-reviews" className={s.ratingLink} onClick={onScrollToReviews}>
            {product.ratings.count} {t('product.reviews_label')}
          </a>
        </div>
      )}

      {/* 6. Price */}
      <div className={`${s.group} ${s.groupFirst}`}>
        <div className={s.priceBlock}>
          <div className={s.priceRow}>
            <span className={s.price}>₪{price.toFixed(2)}</span>
            {hasDiscount && (
              <>
                <span className={s.oldPrice}>₪{oldPrice.toFixed(2)}</span>
                {discountPercent != null && <span className={s.discPill}>{discountPercent}%−</span>}
              </>
            )}
          </div>
          {hasDiscount && savings != null && (
            <div className={s.saving}>{t('product.saved_prefix')} ₪{savings.toFixed(2)}</div>
          )}
        </div>
        <ProductVariants variants={product.variants} />
      </div>

      {/* 7. Purchase details / customer assurances — before Add to Cart */}
      <div className={s.group}>
        <div className={s.groupLabel}>{t('product.purchase_details_label')}</div>
        {warranty && (
          <div className={s.badgesRowTight}>
            <span className={s.warrantyBadge}><ShieldCheck size={12} /> {warranty}</span>
          </div>
        )}
        <div className={s.trustRow}>
          {TRUST_ITEMS.map(({ Icon, textKey }) => (
            <div key={textKey} className={s.trustItem}>
              <Icon size={13} className={s.trustIcon} aria-hidden="true" />
              <span>{t(textKey)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 8-11. Stock status, quantity, add to cart, buy now */}
      <div className={s.group}>
        <StockStatus stock={product.stock} t={t} />

        <div className={s.qtyRow}>
          <span className={s.qtyLabel}>{t('product.qty_label')}</span>
          <QuantitySelector
            value={qty}
            onChange={onQtyChange}
            min={1}
            max={product.stock}
            disabled={outOfStock}
            decreaseLabel={t('product.decrease_qty')}
            increaseLabel={t('product.increase_qty')}
          />
        </div>

        <div className={s.actions}>
          <button className={s.addBtn} onClick={onAddToCart} disabled={adding || outOfStock}>
            {adding
              ? <><Loader size={17} className={s.spin} /> {t('product.adding')}</>
              : outOfStock
                ? t('product.out_of_stock')
                : <><ShoppingCart size={17} /> {t('product.add_to_cart_btn')}</>}
          </button>
          <button className={s.buyBtn} onClick={onBuyNow} disabled={adding || buying || outOfStock}>
            {buying ? <Loader size={16} className={s.spin} /> : <CreditCard size={16} />} {t('product.buy_now')}
          </button>
        </div>
      </div>

      {/* 12. Compare + wishlist */}
      <div className={`${s.group} ${s.groupTight}`}>
        <div className={s.secondaryActions}>
          <button className={s.secondaryBtn} onClick={onToggleCompare}>
            <GitCompare size={15} /> {isComparing ? t('product.compare_view') : t('product.compare_btn')}
          </button>
          <button
            className={`${s.secondaryBtn}${wished ? ' ' + s.secondaryBtnActive : ''}`}
            onClick={onToggleWishlist}
            aria-label={wished ? t('product.remove_from_wishlist') : t('product.add_to_wishlist')}
            aria-pressed={wished}
          >
            <Heart size={15} fill={wished ? '#f43f5e' : 'none'} stroke={wished ? '#f43f5e' : 'currentColor'} /> {t('product.wishlist_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
