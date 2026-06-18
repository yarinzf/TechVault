import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { orderService } from '../../features/orders/api/order.service';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import Button from '../../components/ui/Button/Button';
import { useTranslation } from '../../context/LanguageContext';
import s from './OrderSuccessPage.module.css';

function addBusinessDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

const fmtDate = (d) =>
  d.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' });

const fmtMoney = (n) =>
  `$${Number(n ?? 0).toFixed(2)}`;

function parsePayment(notes, t) {
  if (!notes) return t('order.payment_card');
  const part = notes.split(' | ').find(p => p.startsWith('Payment:'));
  const raw  = part ? part.slice('Payment: '.length) : '';
  if (raw === 'כרטיס אשראי' || raw === 'Credit Card') return t('checkout.payment_credit');
  if (raw === 'תשלום במזומן' || raw === 'Cash on Delivery') return t('order.payment_cash');
  return raw || t('order.payment_card');
}

function buildDeliveryRange(createdAt) {
  const base = createdAt ? new Date(createdAt) : new Date();
  const earliest = addBusinessDays(base, 3);
  const latest   = addBusinessDays(base, 5);
  return `${fmtDate(earliest)} – ${fmtDate(latest)}`;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 72 72"
      className={s.checkCircle}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="36" cy="36" r="33" className={s.circleRing} />
      <polyline points="20,38 31,50 53,26" className={s.checkMark} />
    </svg>
  );
}

export default function OrderSuccessPage() {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const t = useTranslation();

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!orderId) { setError(true); setLoading(false); return; }
    orderService.getById(orderId)
      .then(data => {
        if (!data) { setError(true); } else { setOrder(data); }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <PageSpinner />;

  if (error || !order) {
    return (
      <div className="page">
        <div className={s.container}>
          <div className={s.errorState}>
            <div className={s.errorIcon} aria-hidden="true">✕</div>
            <h2 className={s.errorHeading}>{t('order.not_found')}</h2>
            <p className={s.errorBody}>{t('order.not_found_body')}</p>
            <Button onClick={() => navigate('/orders')}>{t('order.my_orders_btn')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const addr          = order.shippingAddress;
  const paymentLabel  = parsePayment(order.notes, t);
  const deliveryRange = buildDeliveryRange(order.createdAt);
  const statusLabel   = t(`order.status.${order.status}`) || order.status;

  return (
    <div className="page">
      <div className={s.container}>

        <div className={s.iconWrap}>
          <CheckIcon />
        </div>

        <h1 className={s.heading}>{t('order.success_heading')}</h1>
        <p className={s.orderNum}>
          {t('order.number_prefix')}&nbsp;<strong>#{order.orderNumber}</strong>
        </p>

        {/* Items */}
        <div className={s.card}>
          <div className={s.cardTitle}>{t('order.items_ordered')}</div>
          <div className={s.itemList}>
            {(order.items ?? []).map((item, i) => {
              const name  = item.nameAtAdd  ?? item.name  ?? t('cart.product_fallback');
              const price = item.priceAtAdd ?? item.unitPrice ?? 0;
              const img   = item.imageAtAdd || item.image || '';
              return (
                <div key={i} className={s.item}>
                  {img
                    ? <img src={img} alt={name} className={s.thumb} />
                    : <div className={s.thumbPlaceholder} />
                  }
                  <div className={s.itemName}>{name}</div>
                  <div className={s.itemQty}>×{item.quantity}</div>
                  <div className={s.itemPrice}>
                    {fmtMoney(price * item.quantity)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={s.totalRow}>
            <span>{t('order.total')}</span>
            <span className={s.totalAmount}>{fmtMoney(order.total)}</span>
          </div>
        </div>

        {/* Info grid */}
        <div className={s.infoGrid}>
          {addr && (
            <div className={s.infoCard}>
              <div className={s.infoLabel}>{t('order.shipping_address')}</div>
              <div className={s.infoValue}>
                {addr.street}<br />
                {addr.city}{addr.zip ? `, ${addr.zip}` : ''}<br />
                {addr.country}
              </div>
            </div>
          )}
          <div className={s.infoCard}>
            <div className={s.infoLabel}>{t('order.payment_method')}</div>
            <div className={s.infoValue}>{paymentLabel}</div>
          </div>
          <div className={s.infoCard}>
            <div className={s.infoLabel}>{t('order.delivery_date')}</div>
            <div className={s.infoValue}>{deliveryRange}</div>
          </div>
          <div className={s.infoCard}>
            <div className={s.infoLabel}>{t('order.status_label')}</div>
            <div className={`${s.infoValue} ${s.statusPending}`}>
              {statusLabel}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className={s.actions}>
          <Button full size="lg" onClick={() => navigate('/products')}>
            {t('order.continue_shopping')}
          </Button>
          <Button full size="lg" variant="secondary" onClick={() => navigate('/orders')}>
            {t('order.all_orders')}
          </Button>
        </div>

      </div>
    </div>
  );
}
