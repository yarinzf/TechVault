import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, FileText, Activity, Check, Loader, Info, ShoppingBag, CreditCard,
  Truck, ListChecks, Repeat, Phone, XCircle, RotateCcw, Crown, Monitor,
} from 'lucide-react';
import { orderService } from '../../features/orders/api/order.service';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import { useReorder } from '../../features/orders/hooks/useReorder';
import ReturnRequestModal from '../../features/orders/components/ReturnRequestModal';
import PaymentCountdown from '../../features/orders/components/PaymentCountdown';
import { openSupportChat } from '../../utils/openSupportChat';
import {
  getBadgeBucket, BADGE_ICON, BADGE_LABEL_KEY, getTimelineSteps,
  isMembershipOnlyOrder, CANCELLABLE_STATUSES, canRequestReturn,
  getShippingMethodLabel,
} from '../../features/orders/orderPresentation';
import s from './OrderDetailsPage.module.css';

const BADGE_CLASS = {
  pending_payment: 'pendingPaymentBadge',
  preparing:       'preparing',
  shipping:        'shipping',
  delivered:       'delivered',
  cancelled:       'cancelledBadge',
};

function ProgressCard({ order, t }) {
  const steps = getTimelineSteps(order);
  const currentKey = steps.find((st) => st.current)?.key ?? 'received';

  return (
    <div className={s.osCard}>
      <div className={s.osCardTitle}><Activity size={16} /> {t('order.details.progress_title')}</div>
      <div className={s.odTimeline}>
        {steps.map((step) => (
          <div key={step.key} className={`${s.odStep} ${step.done ? s.done : ''} ${step.current ? s.current : ''}`}>
            <div className={s.odStepIcon}>
              {step.done && <Check size={16} />}
              {step.current && <Loader size={16} className={s.spinIcon} />}
            </div>
            <div className={s.odStepLabel}>{t(`order.timeline.${step.key}`)}</div>
          </div>
        ))}
      </div>
      <div className={s.odProgressNote}>
        <Info size={17} />
        <p>{t(`order.details.progress_note.${currentKey}`)}</p>
      </div>
    </div>
  );
}

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency('Israel');
  const { reorder, reorderingId } = useReorder();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [returnModal, setReturnModal] = useState(null);

  const fmtDate = useCallback((iso) =>
    new Date(iso).toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  [language]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await orderService.getById(orderId);
      setOrder(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const handleContinuePayment = () => {
    try {
      const existing = JSON.parse(localStorage.getItem('techvault_checkout') || '{}');
      localStorage.setItem('techvault_checkout', JSON.stringify({
        ...existing,
        pendingOrderId:  order._id,
        pendingOrderNum: order.orderNumber,
        expiresAt:       order.expiresAt ?? null,
      }));
    } catch {}
    navigate('/checkout');
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await orderService.cancel(order._id);
      setOrder((prev) => ({ ...prev, status: 'cancelled' }));
      toast.info(t('order.cancelled_toast'));
    } catch (err) {
      toast.error(err.message || t('order.cancel_error'));
    } finally {
      setCancelling(false);
    }
  };

  const openReturn = async () => {
    const returns = await orderService.listMyReturns(order._id);
    const active = returns.find((r) => r.status !== 'refunded') ?? returns[0] ?? null;
    setReturnModal({ order, existingReturn: active });
  };

  const handleReturnSubmit = async (dto) => {
    await orderService.requestReturn(order._id, dto);
    toast.success(t('order.return_sent'));
    setOrder((prev) => ({ ...prev, _hasReturn: true }));
  };

  if (loading) {
    return (
      <div className={s.odPage}>
        <div className={s.loadingWrap}><div className={s.spinner} /></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className={s.odPage}>
        <div className={s.odError}>
          <div className={s.odErrorIcon}>{'⚠️'}</div>
          <div className={s.odErrorTitle}>{t('order.details.not_found')}</div>
          <Link to="/orders" className={s.osBtnPrimary}>
            <ArrowRight size={16} /> {t('order.details.back_to_orders')}
          </Link>
        </div>
      </div>
    );
  }

  const bucket = getBadgeBucket(order.status);
  const BadgeIcon = BADGE_ICON[bucket];
  const membershipOnly = isMembershipOnlyOrder(order);
  const showTimeline = !['cancelled', 'delivered'].includes(order.status) && !membershipOnly;
  const showNextSteps = showTimeline; // same "genuinely in-progress physical order" condition
  const hasProductItems = (order.items ?? []).some((item) => item.itemType !== 'membership');
  const addr = order.shippingAddress;
  const couponDiscount = order.couponDiscount ?? 0;
  const pointsValue = order.pointsRedeemedValue ?? 0;
  const refundedAmount = order.refundedAmount ?? 0;
  const canCancel = CANCELLABLE_STATUSES.includes(order.status);
  const canReturn = canRequestReturn(order);
  const canPay = order.paymentReservationStatus === 'active';
  const paymentExpired = order.paymentReservationStatus === 'expired';

  return (
    <div className={s.odPage}>
      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <div className={s.breadcrumbInner}>
          <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {t('profile.breadcrumb_home')}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <Link to="/profile" className={s.bcLink}>{t('nav.account')}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <Link to="/orders" className={s.bcLink}>{t('order.page_title')}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <span className={s.bcCurrent}>{t('order.details.page_title')}</span>
        </div>
      </div>

      <div className={s.odInner}>
        <div className={s.ordHeader}>
          <h1 className={s.ordTitle}>{t('order.details.page_title')}</h1>
          <p className={s.ordSubtitle}>{t('order.details.page_subtitle')}</p>
        </div>

        {/* ORDER SUMMARY */}
        <div className={s.osCard}>
          <div className={s.osCardTitle}><FileText size={16} /> {t('order.details.summary_title')}</div>
          <div className={s.odSummaryTop}>
            <span className={`${s.badge} ${s[BADGE_CLASS[bucket]]}`}>
              <span className={s.badgeIcon}><BadgeIcon size={11} /></span>
              {t(BADGE_LABEL_KEY[bucket])}
            </span>
            <div className={s.odSummaryTotal}>
              <div className={s.odSummaryTotalLabel}>{t('checkout.to_pay')}</div>
              <div className={s.odSummaryTotalVal}>{formatPrice(order.total ?? 0)}</div>
            </div>
          </div>

          {canPay && (
            <div className={s.pendingBar}>
              <CreditCard size={16} style={{ color: 'var(--sv-gold)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--sv-gold)', fontWeight: 600 }}>
                {t('order.pending_payment_note')}
              </span>
              {order.expiresAt && <PaymentCountdown expiresAt={order.expiresAt} s={s} />}
              <button className={s.btnContinuePay} onClick={handleContinuePayment}>
                <CreditCard size={13} />
                {t('order.continue_payment')}
              </button>
            </div>
          )}
          {paymentExpired && (
            <div className={s.pendingBar}>
              <span className={s.expiredBadge}>{t('order.payment_expired')}</span>
            </div>
          )}

          <div className={s.osInfoGrid}>
            <div className={s.osInfoItem}>
              <div className={s.osInfoLabel}>{t('order.details.order_number')}</div>
              <div className={`${s.osInfoVal} ${s.orderNum}`}>#{order.orderNumber}</div>
            </div>
            <div className={s.osInfoItem}>
              <div className={s.osInfoLabel}>{t('order.detail.ordered_at')}</div>
              <div className={s.osInfoVal}>{fmtDate(order.createdAt)}</div>
            </div>
            {membershipOnly && order.membershipPlanSnapshot ? (
              <div className={`${s.osInfoItem} ${s.span2}`}>
                <div className={s.osInfoLabel}>{t('order.digital_membership')}</div>
                <div className={s.osInfoVal}>{order.membershipPlanSnapshot.name ?? t('order.digital_membership')}</div>
              </div>
            ) : addr ? (
              <div className={`${s.osInfoItem} ${s.span2}`}>
                <div className={s.osInfoLabel}>{t('order.detail.shipping')}</div>
                <div className={s.osInfoVal} dir="ltr">{addr.street}, {addr.city}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* ORDER PROGRESS */}
        {showTimeline && <ProgressCard order={order} t={t} />}

        {/* ORDER ITEMS */}
        <div className={s.osCard}>
          <div className={s.osCardTitle}><ShoppingBag size={16} /> {t('order.detail.items')}</div>
          <div className={s.osProdList}>
            {(order.items ?? []).map((item, i) => {
              const clickable = Boolean(item.product?.slug && item.product?.isPublished && !item.product?.isDeleted);
              const Content = (
                <>
                  <div className={s.osProdImg}>
                    {item.image
                      ? <img src={item.image} alt={item.name} />
                      : (item.itemType === 'membership' ? <Crown size={26} /> : <Monitor size={26} />)}
                  </div>
                  <div className={s.osProdInfo}>
                    {item.brand && <div className={s.osProdBrand}>{item.brand}</div>}
                    <div className={s.osProdName}>{item.name}</div>
                    <div className={s.osProdQty}>{t('order.details.qty_label')} {item.quantity} · {t('order.details.unit_price_label')} {formatPrice(item.unitPrice ?? 0)}</div>
                  </div>
                  <div className={s.osProdPrice}>{formatPrice((item.unitPrice ?? 0) * item.quantity)}</div>
                </>
              );
              return clickable ? (
                <Link key={i} to={`/products/${item.product.slug}`} className={`${s.osProdItem} ${s.odClickable}`}>
                  {Content}
                </Link>
              ) : (
                <div key={i} className={s.osProdItem}>{Content}</div>
              );
            })}
          </div>
          <div className={s.osTotalRow}>
            <span className={s.osTotalLabel}>{t('checkout.total_products')}</span>
            <span className={s.osTotalVal}>{formatPrice(order.subtotal ?? 0)}</span>
          </div>
        </div>

        {/* PAYMENT INFORMATION */}
        <div className={s.osCard}>
          <div className={s.osCardTitle}><CreditCard size={16} /> {t('order.details.payment_title')}</div>
          <div className={s.ordmSummary}>
            <div className={s.ordmSumRow}>
              <span>{t('order.details.payment_status')}</span>
              <span>{t(`order.paymentStatus.${order.paymentStatus}`)}</span>
            </div>
            <div className={s.ordmSumRow}>
              <span>{t('order.details.coupon_label')}</span>
              <span>{order.couponCode || t('order.details.no_coupon')}</span>
            </div>
            {couponDiscount > 0 && (
              <div className={`${s.ordmSumRow} ${s.coupon}`}>
                <span>{t('checkout.coupon_discount')}</span><span>{'-'}{formatPrice(couponDiscount)}</span>
              </div>
            )}
            {pointsValue > 0 && (
              <div className={`${s.ordmSumRow} ${s.coupon}`}>
                <span>{t('order.points_redeemed')}</span><span>{'-'}{formatPrice(pointsValue)}</span>
              </div>
            )}
            {!membershipOnly && (
              <div className={s.ordmSumRow}>
                <span>{t('checkout.shipping')}</span>
                <span>{(order.shippingCost ?? 0) === 0 ? t('checkout.free') : formatPrice(order.shippingCost)}</span>
              </div>
            )}
            {(order.taxAmount ?? 0) > 0 && (
              <div className={s.ordmSumRow}>
                <span>{t('order.detail.vat')}</span><span>{formatPrice(order.taxAmount)}</span>
              </div>
            )}
            <div className={s.ordmSumDivider} />
            <div className={`${s.ordmSumRow} ${s.total}`}>
              <span>{t('checkout.to_pay')}</span><span>{formatPrice(order.total ?? 0)}</span>
            </div>
            {refundedAmount > 0 && (
              <div className={`${s.ordmSumRow} ${s.discount}`}>
                <span>{order.paymentStatus === 'refunded' ? t('order.refunded_full') : t('order.refunded_partial')}</span>
                <span>{formatPrice(refundedAmount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* DELIVERY INFORMATION */}
        {!membershipOnly && addr && (
          <div className={s.osCard}>
            <div className={s.osCardTitle}><Truck size={16} /> {t('order.details.delivery_title')}</div>
            <div className={s.osInfoGrid}>
              <div className={s.osInfoItem}>
                <div className={s.osInfoLabel}>{t('order.shipping_method_label')}</div>
                <div className={s.osInfoVal}>{getShippingMethodLabel(order.shippingMethod, t)}</div>
              </div>
              <div className={s.osInfoItem}>
                <div className={s.osInfoLabel}>{t('order.shipping_cost_label')}</div>
                <div className={s.osInfoVal}>
                  {(order.shippingCost ?? 0) === 0 ? t('checkout.free') : formatPrice(order.shippingCost)}
                </div>
              </div>
              {/* Store Pickup never collects a real delivery address (see
                  order.validator.js) — show a truthful note instead of a
                  malformed/blank address line. */}
              {addr.street ? (
                <div className={`${s.osInfoItem} ${s.span2}`}>
                  <div className={s.osInfoLabel}>{t('order.details.full_address')}</div>
                  <div className={s.osInfoVal} dir="ltr">{addr.street}, {addr.city}, {addr.zip}, {addr.country}</div>
                </div>
              ) : (
                <div className={`${s.osInfoItem} ${s.span2}`}>
                  <div className={s.osInfoVal}>{t('order.shipping_pickup_note')}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* WHAT HAPPENS NEXT */}
        {showNextSteps && (
          <div className={s.osCard}>
            <div className={s.osCardTitle}><ListChecks size={16} /> {t('order.details.next_title')}</div>
            <div className={s.odNextList}>
              {['pack', 'quality', 'carrier', 'sms'].map((key) => (
                <div key={key} className={s.odNextItem}>
                  <div className={s.odNextIcon}><Check size={15} /></div>
                  <div className={s.odNextText}>{t(`order.details.next.${key}`)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIONS */}
        <div className={s.osActions}>
          <button className={s.osBtnPrimary} onClick={() => navigate('/orders')}>
            <ArrowRight size={17} /> {t('order.details.back_to_orders')}
          </button>
          <div className={s.osBtnRow}>
            {hasProductItems && (
              <button className={s.osBtnOutline} onClick={() => reorder(order)} disabled={reorderingId === order._id}>
                <Repeat size={14} /> {reorderingId === order._id ? t('order.reordering') : t('order.reorder_btn')}
              </button>
            )}
            {canCancel && (
              <button className={`${s.osBtnOutline} ${s.danger}`} onClick={handleCancel} disabled={cancelling}>
                <XCircle size={14} /> {cancelling ? t('order.cancelling') : t('order.cancel_btn')}
              </button>
            )}
            {canReturn && (
              <button className={s.osBtnOutline} onClick={openReturn}>
                <RotateCcw size={14} /> {order._hasReturn ? t('order.return_status') : t('order.request_return')}
              </button>
            )}
            <button className={s.osBtnOutline} onClick={openSupportChat}>
              <Phone size={14} /> {t('order.details.contact_support')}
            </button>
          </div>
        </div>
      </div>

      {returnModal && (
        <ReturnRequestModal
          order={returnModal.order}
          existingReturn={returnModal.existingReturn}
          onClose={() => setReturnModal(null)}
          onSubmit={handleReturnSubmit}
          formatPrice={formatPrice}
        />
      )}
    </div>
  );
}
