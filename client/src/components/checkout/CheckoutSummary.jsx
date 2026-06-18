import { Loader2, Truck, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
import Button from '../ui/Button/Button';
import s from './checkout.module.css';

const DELIVERY_LABEL_KEYS = {
  home_delivery: 'checkout.delivery.home',
  pickup_point:  'checkout.delivery.pickup',
  store_pickup:  'checkout.delivery.store',
};

export default function CheckoutSummary({
  items,
  coupon,        // { input, applied, loading, error, onInput, onApply, onRemove }
  totals,        // { totalPrice, displayTotal, installments }
  currency,      // { formatPrice, loading, fallback, code }
  delivery,
  placing,
  orderExpired,
  isRetry,
  onPlaceOrder,
}) {
  const t = useTranslation();
  const { formatPrice, loading: loadingCurrency, fallback: currencyFallback, code: currencyCode } = currency;
  const { totalPrice, displayTotal, installments } = totals;
  const showInstallSummary = displayTotal >= 500 && installments > 1;

  return (
    <>
      <h2 className={s.sectionTitle}>{t('checkout.summary_title')}</h2>

      <div className={s.summaryItems}>
        {items.map(item => {
          const pid   = String(item.product?._id ?? item.product);
          const price = item.priceAtAdd ?? item.unitPrice ?? 0;
          const name  = item.nameAtAdd  ?? item.name      ?? '';
          const img   = item.imageAtAdd || item.image     || '';
          return (
            <div key={pid} className={s.summaryItem}>
              <div className={s.thumbWrap}>
                {img
                  ? <img src={img} alt={name} className={s.thumb} />
                  : <div className={s.thumbPlaceholder} />
                }
                {item.quantity > 1 && <span className={s.thumbBadge}>{item.quantity}</span>}
              </div>
              <div className={s.summaryItemName}>{name}</div>
              <div className={s.summaryItemQty}>×{item.quantity}</div>
              <div className={s.summaryItemPrice}>{formatPrice(price * item.quantity)}</div>
            </div>
          );
        })}
      </div>

      <div className={s.couponSection}>
        {coupon.applied ? (
          <div className={s.couponApplied}>
            <span className={s.couponAppliedLabel}>
              🏷 {t('checkout.coupon_applied_prefix')} <strong>{coupon.applied.code}</strong> {t('checkout.coupon_applied_suffix')}
            </span>
            <button
              type="button"
              className={s.couponRemoveBtn}
              onClick={coupon.onRemove}
              disabled={placing}
              aria-label={t('checkout.coupon_remove')}
            >
              ✕
            </button>
          </div>
        ) : (
          <>
            <div className={s.couponRow}>
              <input
                className={`input ${s.couponInput}${coupon.error ? ` ${s.inputErr}` : ''}`}
                placeholder={t('checkout.coupon_placeholder')}
                value={coupon.input}
                onChange={e => coupon.onInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && coupon.onApply()}
                disabled={placing || coupon.loading}
                maxLength={20}
                dir="ltr"
              />
              <button
                type="button"
                className={s.couponApplyBtn}
                onClick={coupon.onApply}
                disabled={placing || coupon.loading || !coupon.input.trim()}
              >
                {coupon.loading ? '…' : t('checkout.coupon_apply')}
              </button>
            </div>
            {coupon.error && <p className={s.couponError} role="alert">{coupon.error}</p>}
          </>
        )}
      </div>

      {delivery && (
        <div className={s.deliverySummary}>
          <Truck size={13} />
          <span>{t(DELIVERY_LABEL_KEYS[delivery] ?? '')}</span>
        </div>
      )}

      <div className={s.freeShippingBadge}>
        <Truck size={13} aria-hidden="true" />
        <span>{t('checkout.free_shipping')}</span>
      </div>

      <div className={s.divider} />
      <div className={s.summaryRow}>
        <span>{t('checkout.total_products')}</span>
        <span>{formatPrice(totalPrice)}</span>
      </div>
      <div className={s.summaryRow}>
        <span>{t('checkout.shipping')}</span>
        <span className={s.free}>{t('checkout.free')}</span>
      </div>
      {coupon.applied && (
        <div className={`${s.summaryRow} ${s.discountRow}`}>
          <span>{t('checkout.coupon_discount')} ({coupon.applied.code})</span>
          <span>−{formatPrice(coupon.applied.discount)}</span>
        </div>
      )}
      <div className={`${s.summaryRow} ${s.summaryTotal}`}>
        <span>{t('checkout.to_pay')}</span>
        <span>{loadingCurrency ? '…' : formatPrice(displayTotal)}</span>
      </div>
      {showInstallSummary && (
        <div className={s.installSummary}>
          <CreditCard size={12} />
          <span>{installments} × {formatPrice(displayTotal / installments)}</span>
        </div>
      )}
      {!loadingCurrency && currencyFallback && (
        <p className={s.currencyNote}>{t('checkout.currency_fallback')}</p>
      )}
      {!loadingCurrency && !currencyFallback && currencyCode !== 'USD' && (
        <p className={s.currencyNote}>{t('checkout.currency_note')}</p>
      )}

      <Button
        full size="lg"
        onClick={onPlaceOrder}
        disabled={placing || orderExpired}
        style={{ marginTop: 'var(--space-5)' }}
      >
        {placing ? (
          <span className={s.placingInner}>
            <Loader2 size={16} className={s.spinIcon} />
            {isRetry ? t('checkout.retrying') : t('checkout.placing')}
          </span>
        ) : orderExpired ? (
          t('checkout.timer_expired')
        ) : isRetry ? (
          `${t('checkout.retry_btn')} · ${formatPrice(displayTotal)}`
        ) : (
          `${t('checkout.place_order')} · ${formatPrice(displayTotal)}`
        )}
      </Button>
      <Link to="/cart" className={s.backLink}>{t('checkout.back_link')}</Link>
    </>
  );
}
