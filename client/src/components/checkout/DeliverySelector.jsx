import { Truck, Store, Zap } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import { estimateShipping } from '../../features/checkout/shippingEstimate';
import s from './checkout.module.css';

const OPTIONS = [
  { id: 'store_pickup', Icon: Store, labelKey: 'checkout.delivery.store',       descKey: 'checkout.delivery.store_desc'    },
  { id: 'standard',     Icon: Truck, labelKey: 'checkout.delivery.standard',    descKey: 'checkout.delivery.standard_desc' },
  { id: 'express',      Icon: Zap,   labelKey: 'checkout.delivery.express',     descKey: 'checkout.delivery.express_desc'  },
];

// merchandiseSubtotal/isMember: only used to show a truthful estimated price
// per method (e.g. "חינם" once Standard qualifies). The real charged amount
// is always recalculated server-side at order creation — see
// features/checkout/shippingEstimate.js.
export default function DeliverySelector({
  value, error, disabled, onChange, submitted, merchandiseSubtotal = 0, isMember = false, formatPrice,
}) {
  const t = useTranslation();

  return (
    <section className={s.card}>
      <div className={s.sectionHeader}>
        <div className={s.sectionNum}>3</div>
        <h2 className={s.sectionTitle}>{t('checkout.delivery_title')}</h2>
      </div>
      <div className={s.optionList}>
        {OPTIONS.map(({ id, Icon, labelKey, descKey }) => {
          const { cost, isFree } = estimateShipping(id, merchandiseSubtotal, isMember);
          return (
            <label
              key={id}
              className={[
                s.optionRow,
                value === id ? s.optionSelected : '',
                disabled     ? s.optionDisabled  : '',
              ].filter(Boolean).join(' ')}
            >
              <input
                type="radio"
                name="delivery"
                value={id}
                checked={value === id}
                onChange={() => onChange(id)}
                disabled={disabled}
                style={{ display: 'none' }}
              />
              <div className={s.radioDot}><div className={s.radioDotInner} /></div>
              <span className={s.deliveryIcon}><Icon size={18} /></span>
              <div style={{ flex: 1 }}>
                <div className={s.optionLabel}>{t(labelKey)}</div>
                <div className={s.optionDesc}>{t(descKey)}</div>
              </div>
              <span className={isFree ? s.deliveryFree : s.deliveryPrice}>
                {isFree ? t('checkout.free') : formatPrice ? formatPrice(cost) : `₪${cost.toFixed(2)}`}
              </span>
            </label>
          );
        })}
      </div>
      {submitted && error && (
        <p className={s.errMsg} role="alert" style={{ marginTop: 8 }}>{error}</p>
      )}
    </section>
  );
}
