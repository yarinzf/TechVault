import { useState } from 'react';
import { Monitor } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import s from './ReturnRequestModal.module.css';

// Shared by OrdersPage (list cards) and OrderDetailsPage — the real,
// working return-request flow (see server/services/return.service.js).
export default function ReturnRequestModal({ order, existingReturn, onClose, onSubmit, formatPrice }) {
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
