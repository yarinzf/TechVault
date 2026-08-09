import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Clock, CreditCard, Package, Truck, RotateCcw, RefreshCw, Eye,
  ArrowRight, ChevronDown, Monitor, XCircle, Crown, Check, Calendar, MapPin,
} from 'lucide-react';
import { orderService } from '../../features/orders/api/order.service';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import { useCart } from '../../hooks/useCart';
import s from './OrdersPage.module.css';

const PAGE_SIZE = 20;

// Sapir's 4 badge states + a "cancelled" state map onto the real backend
// status field this way — a PRESENTATION mapping only, the real `status`
// value is never renamed or altered.
//
// pending_payment/pending are NOT "preparing" — the order hasn't been paid
// or confirmed yet, so grouping it with confirmed/processing would claim
// fulfillment work is happening when it isn't (payment.controller.js and
// admin.service.js both treat pending_payment/pending as pre-confirmation,
// not-yet-real-revenue states). They get their own "Pending Payment" badge
// instead, using the same gold/credit-card payment language already used
// by the countdown and "Continue Payment" UI on this page.
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

const BADGE_META = {
  pending_payment: { cls: s.pendingPaymentBadge, Icon: CreditCard, labelKey: 'order.status.pending_payment' },
  preparing:       { cls: s.preparing,           Icon: Clock,      labelKey: 'order.filter.preparing' },
  shipping:        { cls: s.shipping,            Icon: Truck,      labelKey: 'order.status.shipped' },
  delivered:       { cls: s.delivered,           Icon: Check,      labelKey: 'order.status.delivered' },
  cancelled:       { cls: s.cancelledBadge,      Icon: XCircle,    labelKey: 'order.status.cancelled' },
};

const getBadgeBucket = (status) => {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'delivered') return 'delivered';
  if (status === 'shipped') return 'shipping';
  if (status === 'pending_payment' || status === 'pending') return 'pending_payment';
  return 'preparing'; // confirmed, processing
};

// 5 real stages — the reference's 6th stage ("נארזה"/Packed) has no
// backend-fulfillment equivalent (real statuses jump confirmed→processing
// →shipped) so it's omitted rather than faked; see the final report.
const TIMELINE_STAGES = ['received', 'paid', 'preparing', 'shipped', 'delivered'];

// Real statuses jump straight from pending_payment/pending to confirmed once
// paid, so "payment approved" is never independently observable as its own
// status — it's implied (done) the moment status reaches confirmed/beyond.
const STATUS_TO_STAGE_INDEX = {
  pending_payment: 0,
  pending: 0,
  confirmed: 2,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

const getTimelineSteps = (order) => {
  const currentIdx = STATUS_TO_STAGE_INDEX[order.status] ?? 0;
  return TIMELINE_STAGES.map((key, i) => ({
    key,
    done: i < currentIdx,
    current: i === currentIdx,
  }));
};

const isMembershipOnlyOrder = (order) =>
  (order.items ?? []).length > 0 && (order.items ?? []).every(item => item.itemType === 'membership');

const CANCELLABLE_STATUSES = ['pending_payment', 'pending', 'confirmed'];

// ── Payment countdown for a single order ─────────────────────────────────────

function PaymentCountdown({ expiresAt }) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(expiresAt) - Date.now()));
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const tick = () => {
      if (!alive.current) return;
      setRemaining(Math.max(0, new Date(expiresAt) - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive.current = false; clearInterval(id); };
  }, [expiresAt]);

  const expired  = remaining === 0;
  const totalSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec < 60 && !expired;

  if (expired) {
    return <span className={s.expiredBadge}>{t('order.payment_expired')}</span>;
  }

  return (
    <span className={`${s.timerBadge}${urgent ? ' ' + s.timerUrgent : ''}`}>
      <Clock size={11} />
      {t('order.expires_in')} {mm}:{ss}
    </span>
  );
}

// ── Return Request Modal ──────────────────────────────────────────────────────

function ReturnRequestModal({ order, existingReturn, onClose, onSubmit, formatPrice }) {
  const { t } = useLanguage();

  const RETURN_REASONS = [
    { key: 'order.return_reason.defect',       value: t('order.return_reason.defect') },
    { key: 'order.return_reason.wrong',        value: t('order.return_reason.wrong') },
    { key: 'order.return_reason.not_matching', value: t('order.return_reason.not_matching') },
    { key: 'order.return_reason.changed_mind', value: t('order.return_reason.changed_mind') },
    { key: 'order.return_reason.duplicate',    value: t('order.return_reason.duplicate') },
    { key: 'order.return_reason.other',        value: t('order.return_reason.other') },
  ];

  const RETURN_STATUS = {
    pending:  { label: t('order.return_status.pending'),  color: '#fbbf24' },
    approved: { label: t('order.return_status.approved'), color: '#3b82f6' },
    rejected: { label: t('order.return_status.rejected'), color: '#ef4444' },
    received: { label: t('order.return_status.received'), color: '#8b5cf6' },
    refunded: { label: t('order.return_status.refunded'), color: '#10b981' },
  };

  const [selectedItems, setSelectedItems] = useState(
    () => (order.items ?? []).map(item => ({
      product:   (item.product?._id ?? item.product ?? '').toString(),
      name:      item.name,
      sku:       item.sku ?? '',
      image:     item.image ?? '',
      unitPrice: item.unitPrice ?? 0,
      maxQty:    item.quantity,
      quantity:  item.quantity,
      reason:    '',
      selected:  false,
    }))
  );
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');

  const toggle    = (i) => setSelectedItems(prev =>
    prev.map((it, idx) => idx === i ? { ...it, selected: !it.selected } : it)
  );
  const setQty    = (i, v) => setSelectedItems(prev =>
    prev.map((it, idx) => idx === i ? { ...it, quantity: Math.max(1, Math.min(it.maxQty, parseInt(v) || 1)) } : it)
  );
  const setReason = (i, v) => setSelectedItems(prev =>
    prev.map((it, idx) => idx === i ? { ...it, reason: v } : it)
  );

  const handleSubmit = async () => {
    const toReturn = selectedItems.filter(it => it.selected);
    if (toReturn.length === 0) { setError(t('order.return.select_one')); return; }
    const missing = toReturn.find(it => !it.reason);
    if (missing) { setError(`${t('order.return.select_reason_for')} "${missing.name}"`); return; }

    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        items: toReturn.map(it => ({ product: it.product, quantity: it.quantity, reason: it.reason })),
        customerNote,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (existingReturn) {
    const meta = RETURN_STATUS[existingReturn.status] ?? { label: existingReturn.status, color: '#6b7280' };
    return (
      <div className={s.overlay} onClick={onClose}>
        <div className={s.modal} onClick={e => e.stopPropagation()}>
          <div className={s.modalHeader}>
            <div className={s.modalTitle}>{t('order.return.status_title')}</div>
            <button className={s.modalClose} onClick={onClose}>✕</button>
          </div>
          <div className={s.modalSection}>
            <p style={{ fontSize: 13, color: 'var(--sv-muted)', marginBottom: 12 }}>
              {t('order.number_prefix')} #{order.orderNumber}
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: `${meta.color}18`, border: `1px solid ${meta.color}44` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
            </div>
            {existingReturn.adminNote && (
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--sv-muted)', background: 'var(--sv-surface)', padding: '8px 12px', borderRadius: 8 }}>
                {t('order.return.admin_note')} {existingReturn.adminNote}
              </p>
            )}
            {existingReturn.refundAmount && (
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--sv-success)' }}>
                {t('order.return.refunded')} {formatPrice(existingReturn.refundAmount)}
              </p>
            )}
          </div>
          <div className={s.modalFooter}>
            <button className={s.btnSecondary} onClick={onClose}>{t('btn.close')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>{t('order.return.title')}</div>
            <div style={{ fontSize: 11, color: 'var(--sv-muted)', marginTop: 4 }}>
              {t('order.number_prefix')} #{order.orderNumber}
            </div>
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>{t('order.return.select_items')}</div>
          {selectedItems.map((item, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--sv-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggle(i)}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <div className={s.modalItemIcon}>
                  <Monitor size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: 'var(--sv-text)', fontWeight: 500 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--sv-muted)' }}>{t('order.return.purchased')} {item.maxQty} {'יח׳'} × {formatPrice(item.unitPrice)}</p>
                </div>
                {item.selected && (
                  <input
                    type="number"
                    min={1}
                    max={item.maxQty}
                    value={item.quantity}
                    onChange={e => setQty(i, e.target.value)}
                    style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--sv-border)', background: 'var(--sv-surface)', color: 'var(--sv-text)', fontSize: 13, textAlign: 'center' }}
                  />
                )}
              </div>
              {item.selected && (
                <div style={{ marginTop: 10, marginRight: 76 }}>
                  <select
                    value={item.reason}
                    onChange={e => setReason(i, e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--sv-border)', background: 'var(--sv-surface)', color: item.reason ? 'var(--sv-text)' : 'var(--sv-muted)', fontSize: 13 }}
                  >
                    <option value="">{t('order.return.select_reason')}</option>
                    {RETURN_REASONS.map(r => <option key={r.key} value={r.value}>{r.value}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>{t('order.return.note')}</div>
          <textarea
            rows={2}
            value={customerNote}
            onChange={e => setCustomerNote(e.target.value)}
            placeholder={t('order.return.note_ph')}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--sv-border)', background: 'var(--sv-surface)', color: 'var(--sv-text)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {error && (
          <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--sv-red)' }}>{error}</p>
        )}

        <div className={s.modalFooter}>
          <button
            className={s.btnPrimary}
            onClick={handleSubmit}
            disabled={submitting || !selectedItems.some(it => it.selected)}
          >
            {submitting ? t('order.return.submitting') : t('order.return.submit')}
          </button>
          <button className={s.btnSecondary} onClick={onClose} disabled={submitting}>{t('btn.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Order detail modal ────────────────────────────────────────────────────────

function OrderDetail({ order, onClose, onCancel, cancelling, formatPrice, fmt }) {
  const { t } = useLanguage();
  const canCancel = CANCELLABLE_STATUSES.includes(order.status);
  const addr = order.shippingAddress;
  const couponDiscount = order.couponDiscount ?? 0;
  const pointsValue = order.pointsRedeemedValue ?? 0;
  const refundedAmount = order.refundedAmount ?? 0;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>{t('order.number_prefix')} #{order.orderNumber}</div>
            <div style={{ fontSize: 11, color: 'var(--sv-muted)', marginTop: 4 }}>
              {t('order.detail.ordered_at')} {fmt(order.createdAt)}
            </div>
            {order.paymentStatus === 'unpaid' && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--sv-gold)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                {t('order.pending_payment_note')}
              </div>
            )}
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>{t('order.detail.items')}</div>
          {order.items?.map((item, i) => (
            <div key={i} className={s.modalItem}>
              <div className={s.modalItemIcon}>
                {item.itemType === 'membership' ? <Crown size={22} /> : <Monitor size={22} />}
              </div>
              <div className={s.modalItemName}>{item.name}</div>
              <div className={s.modalItemQty}>{'×'}{item.quantity}</div>
              <div className={s.modalItemPrice}>
                {formatPrice((item.unitPrice ?? 0) * item.quantity)}
              </div>
            </div>
          ))}
        </div>

        {addr && (
          <div className={s.modalSection}>
            <div className={s.modalSectionTitle}>{t('order.detail.shipping')}</div>
            <div className={s.addressBlock}>
              {addr.street}, {addr.city}, {addr.zip}<br />
              {addr.country}
            </div>
          </div>
        )}

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>{t('order.detail.summary')}</div>
          <div className={s.summaryRow}><span>{t('checkout.total_products')}</span><span>{formatPrice(order.subtotal ?? 0)}</span></div>
          {(order.taxAmount ?? 0) > 0 && (
            <div className={s.summaryRow}><span>{t('order.detail.vat')}</span><span>{formatPrice(order.taxAmount ?? 0)}</span></div>
          )}
          {couponDiscount > 0 && (
            <div className={`${s.summaryRow} ${s.summaryRowCoupon}`}><span>{t('checkout.coupon_discount')}</span><span>{'-'}{formatPrice(couponDiscount)}</span></div>
          )}
          {pointsValue > 0 && (
            <div className={`${s.summaryRow} ${s.summaryRowPoints}`}><span>{t('order.points_redeemed')}</span><span>{'-'}{formatPrice(pointsValue)}</span></div>
          )}
          {!isMembershipOnlyOrder(order) && (
            <div className={s.summaryRow}><span>{t('checkout.shipping')}</span><span style={{ color: 'var(--sv-success)' }}>{t('checkout.free')}</span></div>
          )}
          <div className={s.summaryTotal}>
            <span>{t('checkout.to_pay')}</span>
            <span>{formatPrice(order.total ?? 0)}</span>
          </div>
          {refundedAmount > 0 && (
            <div className={`${s.summaryRow} ${s.summaryRowRefund}`} style={{ marginTop: 8 }}>
              <span>{order.paymentStatus === 'refunded' ? t('order.refunded_full') : t('order.refunded_partial')}</span>
              <span>{formatPrice(refundedAmount)}</span>
            </div>
          )}
        </div>

        <div className={s.modalFooter}>
          {canCancel && (
            <button className={s.btnDanger} onClick={() => onCancel(order._id)} disabled={cancelling === order._id}>
              <XCircle size={13} />
              {cancelling === order._id ? t('order.cancelling') : t('order.detail.cancel')}
            </button>
          )}
          <button className={s.btnSecondary} onClick={onClose}>{t('btn.close')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Progress timeline ─────────────────────────────────────────────────────────

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
  const { addItem } = useCart();

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
  const [selected,    setSelected]    = useState(null);
  const [cancelling,  setCancelling]  = useState(null);
  const [reordering,  setReordering]  = useState(null);
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
      setSelected(prev => prev?._id === orderId ? { ...prev, status: 'cancelled' } : prev);
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

  // Reorder currently-purchasable physical items back into the real cart —
  // uses the same server-validated addItem() the rest of the storefront
  // uses, so deleted/unpublished/out-of-stock items fail per-item rather
  // than silently "succeeding". Membership purchases are never re-added.
  const handleReorder = async (order) => {
    const productItems = (order.items ?? []).filter(item => item.itemType !== 'membership');
    if (productItems.length === 0) return;

    setReordering(order._id);
    let succeeded = 0;
    let failed = 0;
    for (const item of productItems) {
      const productId = item.product?._id ?? item.product;
      if (!productId) { failed++; continue; }
      try {
        await addItem(productId, item.quantity);
        succeeded++;
      } catch {
        failed++;
      }
    }
    setReordering(null);

    if (succeeded > 0 && failed === 0) toast.success(t('order.reorder_success'));
    else if (succeeded > 0 && failed > 0) toast.info(t('order.reorder_partial'));
    else toast.error(t('order.reorder_fail'));
  };

  const canRequestReturn = (order) =>
    order.status === 'delivered' &&
    ['paid', 'partially_refunded'].includes(order.paymentStatus) &&
    !isMembershipOnlyOrder(order); // digital purchase — nothing physical to return

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
            const badge = BADGE_META[bucket];
            const BadgeIcon = badge.Icon;
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
                  <span className={`${s.badge} ${badge.cls}`}>
                    <span className={s.badgeIcon}><BadgeIcon size={11} /></span>
                    {t(badge.labelKey)}
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
                    {order.expiresAt && <PaymentCountdown expiresAt={order.expiresAt} />}
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
                  <button className={s.btnPrimary} onClick={() => setSelected(order)}>
                    <Eye size={13} />
                    {t('order.view_details')}
                  </button>

                  {hasProductItems && (
                    <button
                      className={s.btnSecondary}
                      onClick={() => handleReorder(order)}
                      disabled={reordering === order._id}
                    >
                      <RefreshCw size={13} />
                      {reordering === order._id ? t('order.reordering') : t('order.reorder_btn')}
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

      {/* Order detail modal */}
      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onCancel={handleCancel}
          cancelling={cancelling}
          formatPrice={formatPrice}
          fmt={fmt}
        />
      )}

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
