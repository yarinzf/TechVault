import { Home, MapPin, Store } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import s from './checkout.module.css';

const OPTIONS = [
  { id: 'home_delivery', Icon: Home,   labelKey: 'checkout.delivery.home',   descKey: 'checkout.delivery.home_desc'   },
  { id: 'pickup_point',  Icon: MapPin, labelKey: 'checkout.delivery.pickup', descKey: 'checkout.delivery.pickup_desc' },
  { id: 'store_pickup',  Icon: Store,  labelKey: 'checkout.delivery.store',  descKey: 'checkout.delivery.store_desc'  },
];

export default function DeliverySelector({ value, error, disabled, onChange, submitted }) {
  const t = useTranslation();

  return (
    <section className={s.card}>
      <h2 className={s.sectionTitle}>{t('checkout.delivery_title')}</h2>
      <div className={s.optionList}>
        {OPTIONS.map(({ id, Icon, labelKey, descKey }) => (
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
              className={s.radio}
            />
            <span className={s.deliveryIcon}><Icon size={18} /></span>
            <div style={{ flex: 1 }}>
              <div className={s.optionLabel}>{t(labelKey)}</div>
              <div className={s.optionDesc}>{t(descKey)}</div>
            </div>
            <span className={s.deliveryFree}>{t('checkout.free')}</span>
          </label>
        ))}
      </div>
      {submitted && error && (
        <p className={s.errMsg} role="alert" style={{ marginTop: 8 }}>{error}</p>
      )}
    </section>
  );
}
