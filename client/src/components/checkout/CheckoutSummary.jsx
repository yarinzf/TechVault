import { Loader2, Truck, CreditCard, Lock, ShieldCheck, RotateCcw, Ticket, Monitor, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { freeShippingThreshold } from '../../features/checkout/shippingEstimate';
import { formatDiscountAmount } from '../../features/checkout/formatDiscount';
import s from './checkout.module.css';

export default function CheckoutSummary({
  items,
  coupon,        // { input, applied, loading, error, onInput, onApply, onRemove }
  points,        // { isMember, available, maxRedeemable, redeem, discount, onRedeemChange }
  totals,        // { totalPrice, displayTotal, installments }
  shipping,      // { method, cost, isFree, merchandiseSubtotal, isMember }
  currency,      // { formatPrice, loading, fallback, code }
  placing,
  orderExpired,
  isRetry,
  onPlaceOrder,
}) {
  const { t, language } = useLanguage();
  const { formatPrice, loading: loadingCurrency, fallback: currencyFallback, code: currencyCode } = currency;
  const { totalPrice, displayTotal, installments } = totals;
  const showInstallSummary = displayTotal >= 500 && installments > 1;

  // Free-standard-shipping progress note — only meaningful once a method is
  // chosen and it's Standard (Express is never free; Store Pickup is always
  // free, so a "spend more" nudge would be misleading for either).
  const shippingRemaining = shipping?.method === 'standard' && !shipping.isFree
    ? Math.max(0, freeShippingThreshold(shipping.isMember) - shipping.merchandiseSubtotal)
    : 0;

  return (
    <>
      {/* Coupon at top — matching Sapir's co-summary-coupon */}
      <div className={s.couponSectionTop}>
        <div className={s.couponSectionTitle}>
          <Ticket size={14} /> {t('checkout.coupon_title')}
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

      {/* Club points redemption — active VIP members only. Server
          (order.service.js) recomputes and caps the real discount; this
          control only expresses the customer's REQUEST. */}
      {points?.isMember && (
        <div className={s.couponSectionTop}>
          <div className={s.couponSectionTitle}>
            <Gift size={14} /> {t('checkout.points_title')}
          </div>
          {points.available > 0 ? (
            <>
              <p className={s.couponAppliedLabel} style={{ marginBottom: 8 }}>
                {t('checkout.points_available').replace('{count}', points.available.toLocaleString())}
              </p>
              <div className={s.couponRow}>
                <input
                  type="number"
                  className="input"
                  min={0}
                  max={points.maxRedeemable}
                  value={points.redeem || ''}
                  placeholder="0"
                  disabled={placing}
                  onChange={e => {
                    const raw = parseInt(e.target.value, 10);
                    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(raw, points.maxRedeemable)) : 0;
                    points.onRedeemChange(clamped);
                  }}
                />
                <button
                  type="button"
                  className={s.couponApplyBtn}
                  disabled={placing || points.maxRedeemable === 0}
                  onClick={() => points.onRedeemChange(points.maxRedeemable)}
                >
                  {t('checkout.points_use_max')}
                </button>
                {points.redeem > 0 && (
                  <button
                    type="button"
                    className={s.couponRemoveBtn}
                    disabled={placing}
                    onClick={() => points.onRedeemChange(0)}
                    aria-label={t('checkout.points_clear')}
                  >
                    ✕
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className={s.couponError} role="status">{t('checkout.points_none')}</p>
          )}
        </div>
      )}

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
          <span>{formatDiscountAmount(coupon.applied.discount, formatPrice, language)}</span>
        </div>
      )}
      {points?.discount > 0 && (
        <div className={`${s.summaryRow} ${s.discountRow}`}>
          <span>{t('checkout.points_discount')} ({points.redeem.toLocaleString()})</span>
          <span>{formatDiscountAmount(points.discount, formatPrice, language)}</span>
        </div>
      )}
      <div className={s.summaryRow}>
        <span className={s.sumLabel}>{t('checkout.shipping')}</span>
        {!shipping?.method ? (
          <span className={s.sumVal}>{t('cart.shipping_at_checkout')}</span>
        ) : shipping.isFree ? (
          <span className={s.sumValGreen}>{t('checkout.free')}</span>
        ) : (
          <span className={s.sumVal}>{formatPrice(shipping.cost)}</span>
        )}
      </div>
      {/* Club-note kept OUT of the value cell above (on its own line, like
          shippingRemaining below) — nesting it inside the value <span> made
          that row's value text wider than every other row's, so "חינם"
          rendered shifted inward instead of flush against the same value
          column every other row's amount sits on. */}
      {shipping?.isFree && shipping.method === 'standard' && shipping.isMember && (
        <p className={s.currencyNote}>{t('checkout.free_shipping_club_note')}</p>
      )}
      {shippingRemaining > 0 && (
        <p className={s.currencyNote}>
          {t('checkout.shipping_progress').replace('{amount}', formatPrice(shippingRemaining))}
        </p>
      )}

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
        <div className={s.badge}><Lock size={12} className={s.badgeIcon} /> {t('trust.pdp_secure')}</div>
        <div className={s.badge}><ShieldCheck size={12} className={s.badgeIcon} /> SSL {t('checkout.ssl_full')}</div>
        <div className={s.badge}><RotateCcw size={12} className={s.badgeIcon} /> {t('trust.pdp_returns')}</div>
      </div>
    </>
  );
}
