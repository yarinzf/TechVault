import { Loader2, Truck, CreditCard, Lock, ShieldCheck, RotateCcw, Ticket, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
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
      {/* Coupon at top — matching Sapir's co-summary-coupon */}
      <div className={s.couponSectionTop}>
        <div className={s.couponSectionTitle}>
          <Ticket size={14} /> {t('checkout.coupon_title') || 'קופון / שובר מתנה'}
        </div>
        {coupon.applied ? (
          <div className={s.couponApplied}>
            <span className={s.couponAppliedLabel}>
              {t('checkout.coupon_applied_prefix')} <strong>{coupon.applied.code}</strong> {t('checkout.coupon_applied_suffix')}
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
                placeholder={t('checkout.coupon_placeholder') || 'הכנס קוד קופון'}
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
                {coupon.loading ? '…' : t('checkout.coupon_apply') || 'החל'}
              </button>
            </div>
            {coupon.error && <p className={s.couponError} role="alert">{coupon.error}</p>}
          </>
        )}
      </div>

      {/* Summary title */}
      <div className={s.summaryTitle}>{t('checkout.summary_title')}</div>

      {/* Items */}
      <div className={s.summaryItems}>
        {items.map(item => {
          const pid   = String(item.product?._id ?? item.product);
          const price = item.priceAtAdd ?? item.unitPrice ?? 0;
          const name  = item.nameAtAdd  ?? item.name      ?? '';
          const img   = item.imageAtAdd || item.image     || '';
          const brand = item.product?.brand ?? '';
          return (
            <div key={pid} className={s.summaryItem}>
              <div className={s.thumbWrap}>
                {img
                  ? <img src={img} alt={name} className={s.thumb} />
                  : <Monitor size={20} className={s.thumbPlaceholder} />
                }
              </div>
              <div className={s.summaryItemInfo}>
                {brand && <div className={s.summaryItemBrand}>{brand}</div>}
                <div className={s.summaryItemName}>{name}</div>
                <div className={s.summaryItemQty}>× {item.quantity}</div>
              </div>
              <div className={s.summaryItemPrice}>{formatPrice(price * item.quantity)}</div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className={s.summaryRow}>
        <span className={s.sumLabel}>{t('checkout.total_products')}</span>
        <span className={s.sumVal}>{formatPrice(totalPrice)}</span>
      </div>
      {coupon.applied && (
        <div className={`${s.summaryRow} ${s.discountRow}`}>
          <span>{t('checkout.coupon_discount')} ({coupon.applied.code})</span>
          <span>−{formatPrice(coupon.applied.discount)}</span>
        </div>
      )}
      <div className={s.summaryRow}>
        <span className={s.sumLabel}>{t('checkout.shipping')}</span>
        <span className={s.sumValGreen}>{t('checkout.free')}</span>
      </div>

      <hr className={s.divider} />

      <div className={s.summaryTotal}>
        <span className={s.totalLabel}>{t('checkout.to_pay')}</span>
        <span className={s.totalVal}>{loadingCurrency ? '…' : formatPrice(displayTotal)}</span>
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

      <button
        className={s.placeOrderBtn}
        onClick={onPlaceOrder}
        disabled={placing || orderExpired}
      >
        {placing ? (
          <span className={s.placingInner}>
            <Loader2 size={16} className={s.spinIcon} />
            {isRetry ? t('checkout.retrying') : t('checkout.placing')}
          </span>
        ) : orderExpired ? (
          t('checkout.timer_expired')
        ) : isRetry ? (
          <><ShieldCheck size={18} /> {t('checkout.retry_btn')} · {formatPrice(displayTotal)}</>
        ) : (
          <><ShieldCheck size={18} /> {t('checkout.place_order')} · {formatPrice(displayTotal)}</>
        )}
      </button>

      <div className={s.badges}>
        <div className={s.badge}><Lock size={12} className={s.badgeIcon} /> {t('trust.pdp_secure') || 'תשלום מאובטח'}</div>
        <div className={s.badge}><ShieldCheck size={12} className={s.badgeIcon} /> SSL {t('checkout.ssl_full') || 'מלא'}</div>
        <div className={s.badge}><RotateCcw size={12} className={s.badgeIcon} /> {t('trust.pdp_returns') || 'החזרה ב-30 יום'}</div>
      </div>
    </>
  );
}
