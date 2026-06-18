import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CreditCard, Package, Truck, RotateCcw, Eye } from 'lucide-react';
import { orderService } from '../../features/orders/api/order.service';
import { useToast } from '../../hooks/useToast';
import Badge, { statusVariant } from '../../components/ui/Badge/Badge';
import Button from '../../components/ui/Button/Button';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import { useTranslation } from '../../context/LanguageContext';
import s from './OrdersPage.module.css';

const STATUS_FILTERS = ['all', 'pending_payment', 'confirmed', 'shipped', 'delivered', 'cancelled'];

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

function ReturnRequestModal({ order, existingReturn, onClose, onSubmit }) {
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
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
              {t('order.number_prefix')} #{order.orderNumber}
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: `${meta.color}18`, border: `1px solid ${meta.color}44` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
              <span style={{ fontSize: 'var(--text-sm)', color: meta.color, fontWeight: 'var(--font-semibold)' }}>{meta.label}</span>
            </div>
            {existingReturn.adminNote && (
              <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                {t('order.return.admin_note')} {existingReturn.adminNote}
              </p>
            )}
            {existingReturn.refundAmount && (
              <p style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: '#10b981' }}>
                {t('order.return.refunded')} ${existingReturn.refundAmount.toFixed(2)}
              </p>
            )}
          </div>
          <div className={s.cardFooter} style={{ border: 'none', padding: 0 }}>
            <Button variant="secondary" size="sm" onClick={onClose}>{t('btn.close')}</Button>
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
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              {t('order.number_prefix')} #{order.orderNumber}
            </div>
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>{t('order.return.select_items')}</div>
          {selectedItems.map((item, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggle(i)}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <img
                  src={item.image || 'https://picsum.photos/48/48'}
                  alt={item.name}
                  style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 'var(--font-medium)' }}>{item.name}</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('order.return.purchased')} {item.maxQty} יח׳ × ${item.unitPrice.toFixed(2)}</p>
                </div>
                {item.selected && (
                  <input
                    type="number"
                    min={1}
                    max={item.maxQty}
                    value={item.quantity}
                    onChange={e => setQty(i, e.target.value)}
                    style={{ width: 60, padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', textAlign: 'center' }}
                  />
                )}
              </div>
              {item.selected && (
                <div style={{ marginTop: 10, marginRight: 76 }}>
                  <select
                    value={item.reason}
                    onChange={e => setReason(i, e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: item.reason ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 'var(--text-sm)' }}
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
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {error && (
          <p style={{ marginBottom: 12, fontSize: 'var(--text-sm)', color: '#ef4444' }}>{error}</p>
        )}

        <div className={s.cardFooter} style={{ border: 'none', padding: 0 }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !selectedItems.some(it => it.selected)}
          >
            {submitting ? t('order.return.submitting') : t('order.return.submit')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>{t('btn.cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Order detail modal ────────────────────────────────────────────────────────

function OrderDetail({ order, onClose, onCancel }) {
  const t = useTranslation();
  const canCancel = ['pending_payment', 'pending', 'confirmed'].includes(order.status);
  const addr = order.shippingAddress;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>{t('order.number_prefix')} {order.orderNumber}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              {t('order.detail.ordered_at')}{fmt(order.createdAt)}
            </div>
            {order.paymentStatus === 'unpaid' && (
              <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: '#92400e', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 4, padding: '3px 8px', display: 'inline-block' }}>
                ⚠ {t('order.pending_payment_note')}
              </div>
            )}
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>{t('order.detail.items')}</div>
          {order.items?.map((item, i) => (
            <div key={i} className={s.modalItem}>
              <img
                className={s.modalItemImg}
                src={item.imageAtAdd || item.image || 'https://picsum.photos/48/48'}
                alt={item.nameAtAdd ?? item.name}
              />
              <div className={s.modalItemName}>{item.nameAtAdd ?? item.name}</div>
              <div className={s.modalItemQty}>×{item.quantity}</div>
              <div className={s.modalItemPrice}>
                ${((item.priceAtAdd ?? item.unitPrice ?? 0) * item.quantity).toFixed(2)}
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
          <div className={s.summaryRow}><span>{t('checkout.total_products')}</span><span>${(order.subtotal ?? 0).toFixed(2)}</span></div>
          {(order.taxAmount ?? 0) > 0 && (
            <div className={s.summaryRow}><span>{t('order.detail.vat')}</span><span>${(order.taxAmount ?? 0).toFixed(2)}</span></div>
          )}
          <div className={s.summaryRow}><span>{t('checkout.shipping')}</span><span style={{ color: 'var(--success)' }}>{t('checkout.free')}</span></div>
          <div className={s.summaryTotal}>
            <span>{t('checkout.to_pay')}</span>
            <span>${(order.total ?? 0).toFixed(2)}</span>
          </div>
        </div>

        <div className={s.cardFooter} style={{ border: 'none', padding: 0 }}>
          {canCancel && (
            <Button variant="danger" size="sm" onClick={() => onCancel(order._id)}>
              {t('order.detail.cancel')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>{t('btn.close')}</Button>
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

  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('all');
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
    // Save context to localStorage so CheckoutPage can restore it
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

  const safeOrders = Array.isArray(orders) ? orders : [];
  const visible = filter === 'all' ? safeOrders : safeOrders.filter(o => o.status === filter);

  // Pending-payment orders section (shown at top when filter = all).
  // Uses the server-computed virtual — avoids client-side time checks.
  const pendingPaymentOrders = filter === 'all'
    ? safeOrders.filter(o => o.paymentReservationStatus === 'active')
    : [];

  if (loading) return <PageSpinner />;

  return (
    <div className="page">
      <h1 className={s.heading}>{t('order.page_title')}</h1>

      {/* Pending payment spotlight */}
      {pendingPaymentOrders.length > 0 && (
        <div className={s.pendingSection}>
          {pendingPaymentOrders.map(order => (
            <div key={order._id} className={s.pendingCard}>
              <div className={s.pendingLeft}>
                <CreditCard size={18} className={s.pendingIcon} />
                <div>
                  <div className={s.pendingTitle}>
                    {t('order.number_prefix')} #{order.orderNumber}
                  </div>
                  <div className={s.pendingMeta}>
                    ${(order.total ?? 0).toFixed(2)} · {fmt(order.createdAt)}
                  </div>
                </div>
              </div>
              <div className={s.pendingRight}>
                {order.expiresAt && <PaymentCountdown expiresAt={order.expiresAt} />}
                <Button
                  size="sm"
                  onClick={() => handleContinuePayment(order)}
                >
                  {t('order.continue_payment')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={s.filters}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            className={`${s.filterBtn}${filter === f ? ' ' + s.filterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {t(`order.status.${f}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📦</div>
          <h3>{filter === 'all' ? t('order.no_orders') : `${t('order.no_orders')} "${t(`order.status.${filter}`)}"`}</h3>
          <p>{filter === 'all' ? t('order.no_orders_sub') : t('order.no_status_orders_sub')}</p>
          {filter === 'all' && <Button onClick={() => navigate('/')}>{t('order.discover')}</Button>}
        </div>
      ) : (
        visible.map(order => {
          const preview = order.items?.slice(0, 4) ?? [];
          const extra   = (order.items?.length ?? 0) - 4;
          const canPay  = order.paymentReservationStatus === 'active';
          const expired = order.paymentReservationStatus === 'expired';
          return (
            <div key={order._id} className={`${s.card}${canPay ? ' ' + s.cardPending : ''}`}>
              <div className={s.cardHeader}>
                <div>
                  <div className={s.orderNum}>#{order.orderNumber}</div>
                  <div className={s.orderDate}>{fmt(order.createdAt)}</div>
                </div>
                <div className={s.headerRight}>
                  <Badge variant={statusVariant(order.status)}>{t(`order.status.${order.status}`) || order.status}</Badge>
                  {order.paymentStatus === 'unpaid' && !expired && (
                    <Badge variant="warning">⚠ {t('order.unpaid')}</Badge>
                  )}
                  {expired && (
                    <Badge variant="error">{t('order.payment_expired')}</Badge>
                  )}
                  <span className={s.orderTotal}>${(order.total ?? 0).toFixed(2)}</span>
                  {canPay && order.expiresAt && (
                    <PaymentCountdown expiresAt={order.expiresAt} />
                  )}
                </div>
              </div>

              <div className={s.cardBody}>
                <div className={s.itemsRow}>
                  {preview.map((item, i) => (
                    <img
                      key={i}
                      className={s.thumb}
                      src={item.imageAtAdd || item.image || 'https://picsum.photos/56/56'}
                      alt={item.nameAtAdd ?? item.name}
                    />
                  ))}
                  {extra > 0 && <div className={s.moreThumb}>+{extra}</div>}
                </div>

                <div className={s.meta}>
                  <div className={s.metaItem}>
                    <span className={s.metaLabel}>{t('order.items')}</span>
                    <span className={s.metaValue}>{order.items?.length ?? 0}</span>
                  </div>
                  {order.shippingAddress && (
                    <div className={s.metaItem}>
                      <span className={s.metaLabel}>{t('order.shipping_to')}</span>
                      <span className={s.metaValue}>
                        {order.shippingAddress.city}, {order.shippingAddress.country}
                      </span>
                    </div>
                  )}
                  <div className={s.metaItem}>
                    <span className={s.metaLabel}>{t('order.payment')}</span>
                    <span className={s.metaValue}>{order.paymentMethod || t('order.card')}</span>
                  </div>
                </div>
              </div>

              <div className={s.cardFooter}>
                {canPay && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleContinuePayment(order)}
                  >
                    <CreditCard size={13} style={{ marginLeft: 4 }} />
                    {t('order.continue_payment')}
                  </Button>
                )}
                {['pending_payment', 'pending', 'confirmed'].includes(order.status) && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleCancel(order._id)}
                    disabled={cancelling === order._id}
                  >
                    {cancelling === order._id ? t('order.cancelling') : t('order.cancel_btn')}
                  </Button>
                )}
                {order.status === 'shipped' && (
                  <Button variant="secondary" size="sm" onClick={() => {}}>
                    <Truck size={13} style={{ marginLeft: 4 }} />
                    {t('order.track_order') || 'Track Order'}
                  </Button>
                )}
                {order.status === 'delivered' && (
                  <Button variant="secondary" size="sm" onClick={() => navigate('/products')}>
                    {t('order.write_review')}
                  </Button>
                )}
                {canRequestReturn(order) && (
                  <Button variant="secondary" size="sm" onClick={() => openReturnModal(order)}>
                    <RotateCcw size={13} style={{ marginLeft: 4 }} />
                    {order._hasReturn ? t('order.return_status') : t('order.request_return')}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setSelected(order)}>
                  <Eye size={13} style={{ marginLeft: 4 }} />
                  {t('order.details')}
                </Button>
              </div>
            </div>
          );
        })
      )}

      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onCancel={handleCancel}
        />
      )}

      {returnModal && (
        <ReturnRequestModal
          order={returnModal.order}
          existingReturn={returnModal.existingReturn}
          onClose={() => setReturnModal(null)}
          onSubmit={handleReturnSubmit}
        />
      )}
    </div>
  );
}
