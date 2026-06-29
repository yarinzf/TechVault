import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Clock, CreditCard, Package, Truck, RotateCcw, Eye,
  ArrowRight, ChevronDown, Search, Monitor, XCircle,
} from 'lucide-react';
import { orderService } from '../../features/orders/api/order.service';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from '../../context/LanguageContext';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import s from './OrdersPage.module.css';

const STATUS_FILTERS = ['all', 'pending_payment', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const STATUS_CLASS_MAP = {
  pending_payment: 'processing',
  pending:         'processing',
  confirmed:       'confirmed',
  shipped:         'shipped',
  delivered:       'done',
  cancelled:       'statusCancelled',
};

const fmt = (iso) =>
  new Date(iso).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });

// ── Payment countdown for a single order ─────────────────────────────────────

function PaymentCountdown({ expiresAt }) {
  const t = useTranslation();
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
    return (
      <span className={s.expiredBadge}>
        {t('order.payment_expired')}
      </span>
    );
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
  const t = useTranslation();

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
      name:      item.nameAtAdd ?? item.name,
      sku:       item.sku ?? '',
      image:     item.imageAtAdd ?? item.image ?? '',
      unitPrice: item.priceAtAdd ?? item.unitPrice ?? 0,
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
            className={s.btnReorder}
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

function OrderDetail({ order, onClose, onCancel, formatPrice }) {
  const t = useTranslation();
  const canCancel = ['pending_payment', 'pending', 'confirmed'].includes(order.status);
  const addr = order.shippingAddress;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>{t('order.number_prefix')} {order.orderNumber}</div>
            <div style={{ fontSize: 11, color: 'var(--sv-muted)', marginTop: 4 }}>
              {t('order.detail.ordered_at')}{fmt(order.createdAt)}
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
                <Monitor size={22} />
              </div>
              <div className={s.modalItemName}>{item.nameAtAdd ?? item.name}</div>
              <div className={s.modalItemQty}>{'×'}{item.quantity}</div>
              <div className={s.modalItemPrice}>
                {formatPrice((item.priceAtAdd ?? item.unitPrice ?? 0) * item.quantity)}
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
          <div className={s.summaryRow}><span>{t('checkout.shipping')}</span><span style={{ color: 'var(--sv-success)' }}>{t('checkout.free')}</span></div>
          <div className={s.summaryTotal}>
            <span>{t('checkout.to_pay')}</span>
            <span>{formatPrice(order.total ?? 0)}</span>
          </div>
        </div>

        <div className={s.modalFooter}>
          {canCancel && (
            <button className={s.btnCancel} onClick={() => onCancel(order._id)}>
              <XCircle size={13} />
              {t('order.detail.cancel')}
            </button>
          )}
          <button className={s.btnSecondary} onClick={onClose}>{t('btn.close')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { toast }  = useToast();
  const navigate   = useNavigate();
  const t = useTranslation();
  const { formatPrice } = useCurrency('Israel');

  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openOrders,  setOpenOrders]  = useState(new Set());
  const [selected,    setSelected]    = useState(null);
  const [cancelling,  setCancelling]  = useState(null);
  const [returnModal, setReturnModal] = useState(null);

  useEffect(() => {
    orderService.listMine()
      .then(result => setOrders(Array.isArray(result) ? result : (result?.orders ?? [])))
      .catch(() => toast.error(t('order.load_error')))
      .finally(() => setLoading(false));
  }, []);

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

  const canRequestReturn = (order) =>
    order.status === 'delivered' &&
    ['paid', 'partially_refunded'].includes(order.paymentStatus);

  const toggleOrder = (id) => {
    setOpenOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const safeOrders = Array.isArray(orders) ? orders : [];

  // Filter by status
  const statusFiltered = filter === 'all' ? safeOrders : safeOrders.filter(o => o.status === filter);

  // Filter by search query (order number, product names)
  const visible = searchQuery.trim()
    ? statusFiltered.filter(o => {
        const q = searchQuery.trim().toLowerCase();
        if (String(o.orderNumber).includes(q)) return true;
        if (o.items?.some(it => ((it.nameAtAdd ?? it.name) || '').toLowerCase().includes(q))) return true;
        return false;
      })
    : statusFiltered;

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
          <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {'עמוד ראשי'}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <span className={s.bcCurrent}>{t('order.page_title')}</span>
        </div>
      </div>

      {/* Header */}
      <div className={s.ordHeader}>
        <h1 className={s.ordTitle}>{t('order.page_title')}</h1>
        <p className={s.ordSubtitle}>
          {safeOrders.length} {t('order.items') || 'הזמנות'}
        </p>
      </div>

      {/* Toolbar: search + status filter */}
      <div className={s.ordToolbar}>
        <div className={s.searchWrap}>
          <input
            type="text"
            className={s.searchInput}
            placeholder={t('order.search') || 'חיפוש לפי מספר הזמנה...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <Search size={15} className={s.searchIcon} />
        </div>
        <select
          className={s.filterSelect}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          {STATUS_FILTERS.map(f => (
            <option key={f} value={f}>{t(`order.status.${f}`)}</option>
          ))}
        </select>
      </div>

      {/* Order list */}
      <div className={s.ordList}>
        {visible.length === 0 ? (
          <div className={s.ordEmpty}>
            <div className={s.ordEmptyIcon}>
              <Package size={40} />
            </div>
            <div className={s.ordEmptyTitle}>
              {filter === 'all' ? t('order.no_orders') : `${t('order.no_orders')} "${t(`order.status.${filter}`)}"`}
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
          visible.map(order => {
            const isOpen = openOrders.has(order._id);
            const statusClass = STATUS_CLASS_MAP[order.status] || 'processing';
            const statusLabel = t(`order.status.${order.status}`) || order.status;
            const canPay  = order.paymentReservationStatus === 'active';
            const expired = order.paymentReservationStatus === 'expired';
            const addr = order.shippingAddress;

            return (
              <div
                key={order._id}
                className={`${s.ordCard}${order.status === 'cancelled' ? ' ' + s.cancelled : ''}${isOpen ? ' ' + s.openCard : ''}`}
              >
                {/* Collapsed head */}
                <div className={s.cardHead} onClick={() => toggleOrder(order._id)}>
                  <div className={s.ordNum}>
                    <span className={s.numLabel}>{t('order.number_prefix') || 'מספר הזמנה'}</span>
                    #{order.orderNumber}
                  </div>
                  <div className={s.dateCol}>{fmt(order.createdAt)}</div>
                  <div className={s.itemsCol}>{order.items?.length ?? 0} {t('order.items') || 'פריטים'}</div>
                  <div className={s.totalCol}>{formatPrice(order.total ?? 0)}</div>
                  <span className={`${s.status} ${s[statusClass]}`}>{statusLabel}</span>
                  {canPay && order.expiresAt && <PaymentCountdown expiresAt={order.expiresAt} />}
                  {expired && <span className={s.expiredBadge}>{t('order.payment_expired')}</span>}
                  <ChevronDown size={18} className={s.toggleIcon} />
                </div>

                {/* Expanded details */}
                <div className={s.details}>
                  <div className={s.detailsInner}>

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

                    {/* Details grid */}
                    <div className={s.detailsGrid}>
                      <div>
                        <div className={s.detailLabel}>{t('order.detail.ordered_at') || 'תאריך הזמנה'}</div>
                        <div className={s.detailVal}>{fmt(order.createdAt)}</div>
                      </div>
                      <div>
                        <div className={s.detailLabel}>{t('order.payment') || 'תשלום'}</div>
                        <div className={s.detailVal}>{order.paymentMethod || t('order.card')}</div>
                      </div>
                      {addr && (
                        <div>
                          <div className={s.detailLabel}>{t('order.detail.shipping') || 'כתובת משלוח'}</div>
                          <div className={s.detailVal}>
                            {addr.street}, {addr.city}<br />
                            {addr.zip}, {addr.country}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className={s.detailLabel}>{t('order.status_label') || 'סטטוס'}</div>
                        <div className={s.detailVal}>
                          <span className={`${s.status} ${s[statusClass]}`}>{statusLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Products */}
                    <div className={s.productsTitle}>{t('order.detail.items') || 'פריטים'}</div>
                    <div className={s.productsList}>
                      {(order.items ?? []).map((item, i) => (
                        <div key={i} className={s.productRow}>
                          <div className={s.productIcon}>
                            <Monitor size={20} />
                          </div>
                          <div className={s.productInfo}>
                            {item.brand && <div className={s.productBrand}>{item.brand}</div>}
                            <div className={s.productName}>{item.nameAtAdd ?? item.name}</div>
                          </div>
                          <div className={s.productQty}>{'×'}{item.quantity}</div>
                          <div className={s.productPrice}>
                            {formatPrice((item.priceAtAdd ?? item.unitPrice ?? 0) * item.quantity)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className={s.ordTotals}>
                      <div className={s.ordTotalRow}>
                        <span>{t('checkout.total_products')}</span>
                        <span>{formatPrice(order.subtotal ?? 0)}</span>
                      </div>
                      {(order.taxAmount ?? 0) > 0 && (
                        <div className={s.ordTotalRow}>
                          <span>{t('order.detail.vat')}</span>
                          <span>{formatPrice(order.taxAmount ?? 0)}</span>
                        </div>
                      )}
                      <div className={s.ordTotalRow}>
                        <span>{t('checkout.shipping')}</span>
                        <span style={{ color: 'var(--sv-success)' }}>{t('checkout.free')}</span>
                      </div>
                      <div className={s.ordTotalFinal}>
                        <span>{t('checkout.to_pay')}</span>
                        <span>{formatPrice(order.total ?? 0)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className={s.ordActions}>
                      <button className={s.btnReorder} onClick={() => setSelected(order)}>
                        <Eye size={13} />
                        {t('order.details')}
                      </button>

                      {['pending_payment', 'pending', 'confirmed'].includes(order.status) && (
                        <button
                          className={s.btnCancel}
                          onClick={() => handleCancel(order._id)}
                          disabled={cancelling === order._id}
                        >
                          <XCircle size={13} />
                          {cancelling === order._id ? t('order.cancelling') : t('order.cancel_btn')}
                        </button>
                      )}

                      {order.status === 'shipped' && (
                        <button className={s.btnSecondary} onClick={() => {}}>
                          <Truck size={13} />
                          {t('order.track_order') || 'Track Order'}
                        </button>
                      )}

                      {order.status === 'delivered' && (
                        <button className={s.btnSecondary} onClick={() => navigate('/products')}>
                          {t('order.write_review')}
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
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Order detail modal */}
      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onCancel={handleCancel}
          formatPrice={formatPrice}
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
