import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CreditCard, Package, Truck, RotateCcw, RefreshCw, Eye,
  ArrowRight, ChevronDown, Monitor, XCircle, Crown, Calendar, MapPin,
} from 'lucide-react';
import { orderService } from '../../features/orders/api/order.service';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import { useReorder } from '../../features/orders/hooks/useReorder';
import ReturnRequestModal from '../../features/orders/components/ReturnRequestModal';
import PaymentCountdown from '../../features/orders/components/PaymentCountdown';
import {
  getBadgeBucket, BADGE_ICON, BADGE_LABEL_KEY, getTimelineSteps,
  isMembershipOnlyOrder, CANCELLABLE_STATUSES, canRequestReturn,
  getShippingMethodLabel,
} from '../../features/orders/orderPresentation';
import s from './OrdersPage.module.css';

const PAGE_SIZE = 20;

const FILTER_TABS = [
  { key: 'all',       statuses: null },
  { key: 'preparing', statuses: 'confirmed,processing' },
  { key: 'shipping',  statuses: 'shipped' },
  { key: 'delivered', statuses: 'delivered' },
  { key: 'cancelled', statuses: 'cancelled' },
];

const FILTER_LABEL_KEY = {
  all:       'order.status.all',
  preparing: 'order.filter.preparing',
  shipping:  'order.status.shipped',
  delivered: 'order.status.delivered',
  cancelled: 'order.status.cancelled',
};

// CSS-module class per badge bucket — the icon/label mapping itself is
// shared (orderPresentation.js); only the class names are page-local.
const badgeClass = (s) => ({
  pending_payment: s.pendingPaymentBadge,
  preparing:       s.preparing,
  shipping:        s.shipping,
  delivered:       s.delivered,
  cancelled:       s.cancelledBadge,
});

// ── Progress timeline (list-card compact dot version) ────────────────────────

function OrderTimeline({ order }) {
  const { t } = useLanguage();
  const steps = getTimelineSteps(order);

  return (
    <div className={s.timelineWrap}>
      <div className={s.timeline}>
        {steps.map(step => {
          const cls = [
            s.step,
            step.done && !step.current ? s.stepDone : '',
            step.current ? s.stepCurrent : '',
            step.current && step.key === 'shipped' ? s.orange : '',
          ].filter(Boolean).join(' ');
          return (
            <div key={step.key} className={cls}>
              <span className={s.stepDot} />
              <span className={s.stepLabel}>{t(`order.timeline.${step.key}`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { toast }  = useToast();
  const navigate   = useNavigate();
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency('Israel');
  const { reorder, reorderingId } = useReorder();
  const BADGE_CLASS = badgeClass(s);

  const fmt = useCallback((iso) =>
    new Date(iso).toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', { year: 'numeric', month: 'short', day: 'numeric' }),
  [language]);

  const [orders,      setOrders]      = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [page,        setPage]        = useState(1);
  const [filter,      setFilter]      = useState('all');
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(false);
  const [openItems,   setOpenItems]   = useState(new Set());
  const [cancelling,  setCancelling]  = useState(null);
  const [returnModal, setReturnModal] = useState(null);

  const load = useCallback(async (pageNum, filterKey, append) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(false);
    try {
      const tab = FILTER_TABS.find(f => f.key === filterKey);
      const params = { page: pageNum, limit: PAGE_SIZE };
      if (tab?.statuses) params.status = tab.statuses;
      const { orders: fetched, meta: m } = await orderService.listMine(params);
      setOrders(prev => append ? [...prev, ...fetched] : fetched);
      setMeta(m);
      setPage(pageNum);
    } catch {
      setError(true);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, filter, false); }, [filter, load]);

  const handleCancel = async (orderId) => {
    setCancelling(orderId);
    try {
      await orderService.cancel(orderId);
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: 'cancelled' } : o));
      toast.info(t('order.cancelled_toast'));
    } catch (err) {
      toast.error(err.message || t('order.cancel_error'));
    } finally {
      setCancelling(null);
    }
  };

  const openReturnModal = async (order) => {
    const returns = await orderService.listMyReturns(order._id);
    const active  = returns.find(r => r.status !== 'refunded') ?? returns[0] ?? null;
    setReturnModal({ order, existingReturn: active });
  };

  const handleReturnSubmit = async (dto) => {
    const order = returnModal.order;
    await orderService.requestReturn(order._id, dto);
    toast.success(t('order.return_sent'));
    setOrders(prev => prev.map(o => o._id === order._id ? { ...o, _hasReturn: true } : o));
  };

  const handleContinuePayment = (order) => {
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

  const toggleItems = (id) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const safeOrders = Array.isArray(orders) ? orders : [];
  const hasMore = meta && page < meta.pages;

  if (loading) {
    return (
      <div className={s.ordPage}>
        <div className={s.loadingWrap}>
          <div className={s.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={s.ordPage}>

      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <div className={s.breadcrumbInner}>
          <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {t('profile.breadcrumb_home')}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <Link to="/profile" className={s.bcLink}>{t('nav.account')}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <span className={s.bcCurrent}>{t('order.page_title')}</span>
        </div>
      </div>

      {/* Header */}
      <div className={s.ordHeader}>
        <h1 className={s.ordTitle}>{t('order.page_title')}</h1>
        <p className={s.ordSubtitle}>{t('order.subtitle')}</p>
      </div>

      {/* Filter tabs */}
      <div className={s.ordFilters}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            className={`${s.filterChip}${filter === tab.key ? ' ' + s.filterChipActive : ''}`}
            onClick={() => setFilter(tab.key)}
          >
            {t(FILTER_LABEL_KEY[tab.key])}
          </button>
        ))}
      </div>

      {/* Order list */}
      <div className={s.ordList}>
        {error ? (
          <div className={s.ordEmpty}>
            <div className={s.ordEmptyIcon}>{'⚠️'}</div>
            <div className={s.ordEmptyTitle}>{t('order.load_error')}</div>
            <button className={s.ordEmptyBtn} onClick={() => load(1, filter, false)}>
              <RefreshCw size={16} />
              {t('btn.retry')}
            </button>
          </div>
        ) : safeOrders.length === 0 ? (
          <div className={s.ordEmpty}>
            <div className={s.ordEmptyIcon}>{'📦'}</div>
            <div className={s.ordEmptyTitle}>
              {filter === 'all' ? t('order.no_orders') : `${t('order.no_orders')} — ${t(FILTER_LABEL_KEY[filter])}`}
            </div>
            <div className={s.ordEmptySub}>
              {filter === 'all' ? t('order.no_orders_sub') : t('order.no_status_orders_sub')}
            </div>
            {filter === 'all' && (
              <Link to="/" className={s.ordEmptyBtn}>
                <Package size={16} />
                {t('order.discover')}
              </Link>
            )}
          </div>
        ) : (
          safeOrders.map(order => {
            const bucket = getBadgeBucket(order.status);
            const BadgeIcon = BADGE_ICON[bucket];
            const canPay  = order.paymentReservationStatus === 'active';
            const expired = order.paymentReservationStatus === 'expired';
            const items = order.items ?? [];
            const isOpen = openItems.has(order._id);
            const visibleThumbs = items.slice(0, 3);
            const extraCount = items.length - visibleThumbs.length;
            const membershipOnly = isMembershipOnlyOrder(order);
            // Sapir's reference never renders the timeline once an order is
            // delivered — a completed order has nothing left to track.
            const showTimeline = !['cancelled', 'delivered'].includes(order.status) && !membershipOnly;
            const hasProductItems = items.some(item => item.itemType !== 'membership');

            return (
              <div
                key={order._id}
                className={`${s.ordCard}${order.status === 'cancelled' ? ' ' + s.cancelled : ''}`}
              >
                {/* Topbar */}
                <div className={s.cardTopbar}>
                  <span className={`${s.badge} ${BADGE_CLASS[bucket]}`}>
                    <span className={s.badgeIcon}><BadgeIcon size={11} /></span>
                    {t(BADGE_LABEL_KEY[bucket])}
                  </span>
                  <div>
                    <div className={s.cardId}>{t('order.number_prefix')} #{order.orderNumber}</div>
                    <div className={s.cardDate}><Calendar size={11} />{fmt(order.createdAt)}</div>
                  </div>
                  <div className={s.cardTotalBlock}>
                    <div className={s.cardTotalLabel}>{t('checkout.to_pay')}</div>
                    <div className={s.cardTotalVal}>{formatPrice(order.total ?? 0)}</div>
                  </div>
                </div>

                {/* Pending payment bar */}
                {canPay && (
                  <div className={s.pendingBar}>
                    <CreditCard size={16} style={{ color: 'var(--sv-gold)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--sv-gold)', fontWeight: 600 }}>
                      {t('order.pending_payment_note')}
                    </span>
                    {order.expiresAt && <PaymentCountdown expiresAt={order.expiresAt} s={s} />}
                    <button className={s.btnContinuePay} onClick={() => handleContinuePayment(order)}>
                      <CreditCard size={13} />
                      {t('order.continue_payment')}
                    </button>
                  </div>
                )}
                {expired && (
                  <div className={s.pendingBar}>
                    <span className={s.expiredBadge}>{t('order.payment_expired')}</span>
                  </div>
                )}

                {/* Body: info column + thumbnails */}
                <div className={s.cardBody}>
                  <div className={s.infoCol}>
                    <div className={s.infoRow}><Package size={13} />{items.length} {t('order.items')}</div>
                    {membershipOnly && order.membershipPlanSnapshot && (
                      <div className={s.infoRow}><Crown size={13} />{order.membershipPlanSnapshot.name ?? t('order.digital_membership')}</div>
                    )}
                    {!membershipOnly && order.shippingAddress?.city && (
                      <div className={s.infoRow}><MapPin size={13} />{t('order.shipping_to')} {order.shippingAddress.city}</div>
                    )}
                    {/* Legacy orders (shippingMethod: null) simply omit this
                        row rather than showing a guessed method. */}
                    {!membershipOnly && order.shippingMethod && (
                      <div className={s.infoRow}><Truck size={13} />{getShippingMethodLabel(order.shippingMethod, t)}</div>
                    )}
                    {order.paymentStatus === 'refunded' && (
                      <div className={`${s.infoRow} ${s.infoRowRefund}`}>{t('order.refunded_full')}</div>
                    )}
                    {order.paymentStatus === 'partially_refunded' && (
                      <div className={`${s.infoRow} ${s.infoRowRefund}`}>{t('order.refunded_partial')} {formatPrice(order.refundedAmount ?? 0)}</div>
                    )}
                    <button
                      className={`${s.expandBtn}${isOpen ? ' ' + s.expandBtnOpen : ''}`}
                      onClick={() => toggleItems(order._id)}
                    >
                      {t('order.detail.items')}
                      <ChevronDown size={12} />
                    </button>
                  </div>

                  <div className={s.thumbsCol}>
                    <div className={s.thumbs}>
                      {visibleThumbs.map((item, i) => (
                        <div key={i} className={s.thumb}>
                          {item.image
                            ? <img src={item.image} alt={item.name} className={s.thumbImg} />
                            : (item.itemType === 'membership' ? <Crown size={18} /> : <Monitor size={18} />)}
                          {item.quantity > 1 && <span className={s.thumbQty}>{item.quantity}</span>}
                        </div>
                      ))}
                      {extraCount > 0 && (
                        <button className={s.thumbMore} onClick={() => toggleItems(order._id)}>
                          {'+'}{extraCount}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded item rows */}
                <div className={`${s.itemsPanel}${isOpen ? ' ' + s.itemsPanelOpen : ''}`}>
                  <div className={s.itemsPanelInner}>
                    {items.map((item, i) => (
                      <div key={i} className={s.itemRow}>
                        <div className={s.itemImg}>
                          {item.image
                            ? <img src={item.image} alt={item.name} />
                            : (item.itemType === 'membership' ? <Crown size={15} /> : <Monitor size={15} />)}
                        </div>
                        <div>
                          <div className={s.itemName}>{item.name}</div>
                          <div className={s.itemMeta}>{'×'}{item.quantity}</div>
                        </div>
                        <div className={s.itemPrice}>{formatPrice((item.unitPrice ?? 0) * item.quantity)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress timeline */}
                {showTimeline && <OrderTimeline order={order} />}

                {/* Actions */}
                <div className={s.actionsRow}>
                  <button className={s.btnPrimary} onClick={() => navigate(`/orders/${order._id}`)}>
                    <Eye size={13} />
                    {t('order.view_details')}
                  </button>

                  {hasProductItems && (
                    <button
                      className={s.btnSecondary}
                      onClick={() => reorder(order)}
                      disabled={reorderingId === order._id}
                    >
                      <RefreshCw size={13} />
                      {reorderingId === order._id ? t('order.reordering') : t('order.reorder_btn')}
                    </button>
                  )}

                  {CANCELLABLE_STATUSES.includes(order.status) && (
                    <button
                      className={s.btnDanger}
                      onClick={() => handleCancel(order._id)}
                      disabled={cancelling === order._id}
                    >
                      <XCircle size={13} />
                      {cancelling === order._id ? t('order.cancelling') : t('order.cancel_btn')}
                    </button>
                  )}

                  {membershipOnly && order.status === 'delivered' && (
                    <button className={s.btnSecondary} onClick={() => navigate('/club')}>
                      <Crown size={13} />
                      {t('nav.club')}
                    </button>
                  )}

                  {canRequestReturn(order) && (
                    <button className={s.btnSecondary} onClick={() => openReturnModal(order)}>
                      <RotateCcw size={13} />
                      {order._hasReturn ? t('order.return_status') : t('order.request_return')}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {!error && hasMore && (
          <div className={s.loadMoreWrap}>
            <button className={s.loadMoreBtn} onClick={() => load(page + 1, filter, true)} disabled={loadingMore}>
              {loadingMore ? t('order.loading_more') : t('order.load_more')}
            </button>
          </div>
        )}
      </div>

      {/* Return request modal */}
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
