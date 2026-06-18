import { ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import s from './checkout.module.css';

const CURRENT_YEAR         = new Date().getFullYear();
const MONTH_OPTIONS        = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const YEAR_OPTIONS         = Array.from({ length: 21 }, (_, i) => String(CURRENT_YEAR + i));
const INSTALLMENTS_OPTIONS = [1, 2, 3, 4, 5, 6, 10, 12];
const INSTALLMENTS_THRESHOLD = 500;

const CARD_ICONS = { visa: '💳 Visa', mastercard: '💳 MC', amex: '💳 Amex', discover: '💳 Disc' };

function Field({ id, label, required, error, children }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}{required && <span className={s.req}> *</span>}
      </label>
      {children}
      {error && <span className={s.errMsg} id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

export default function PaymentForm({
  payment,      onPaymentChange,
  card,         onCardChange,
  cardErrors,   payError,
  placing,
  installments, onInstallmentsChange,
  displayTotal, formatPrice,
  cardBrand,    onFillTest,
}) {
  const t = useTranslation();

  const PAYMENT_METHODS = [
    { id: 'credit_card', label: t('checkout.payment_credit'), desc: 'Visa / Mastercard / Amex', disabled: false },
    { id: 'paypal',      label: 'PayPal',                      desc: t('checkout.coming_soon'),  disabled: true  },
    { id: 'apple_pay',   label: 'Apple Pay',                   desc: t('checkout.coming_soon'),  disabled: true  },
  ];

  const TEST_CARDS = [
    { num: '4242 4242 4242 4242', label: t('checkout.test_success') },
    { num: '4000 0000 0000 0002', label: t('checkout.test_decline') },
  ];

  const showInstall = displayTotal >= INSTALLMENTS_THRESHOLD;

  const cardInp = (field, extra = {}) => ({
    id:             `card_${field}`,
    className:      cardErrors[field] ? `input ${s.inputErr}` : 'input',
    value:          card[field],
    onChange:       e => onCardChange(field, e.target.value),
    autoComplete:   'off',
    disabled:       placing,
    'aria-invalid': !!cardErrors[field],
    ...extra,
  });

  return (
    <section className={s.card}>
      <h2 className={s.sectionTitle}>{t('checkout.payment_title')}</h2>
      <div className={s.demoBanner}>{t('checkout.demo_banner')}</div>

      <div className={s.optionList}>
        {PAYMENT_METHODS.map(m => (
          <label
            key={m.id}
            className={[
              s.optionRow,
              payment === m.id        ? s.optionSelected : '',
              placing || m.disabled   ? s.optionDisabled : '',
            ].filter(Boolean).join(' ')}
          >
            <input
              type="radio" name="payment" value={m.id}
              checked={payment === m.id}
              onChange={() => { if (!m.disabled) onPaymentChange(m.id); }}
              disabled={placing || m.disabled}
              className={s.radio}
            />
            <div style={{ flex: 1 }}>
              <div className={s.optionLabel}>{m.label}</div>
              <div className={s.optionDesc}>{m.desc}</div>
            </div>
            {m.disabled && <span className={s.comingSoon}>{t('checkout.coming_soon')}</span>}
          </label>
        ))}
      </div>

      {payment === 'credit_card' && (
        <div className={s.cardForm}>
          <Field id="card_cardHolder" label={t('checkout.card_holder')} required error={cardErrors.cardHolder}>
            <input {...cardInp('cardHolder')} placeholder="Israel Israelowitz" autoComplete="cc-name" />
          </Field>

          <Field id="card_cardNumber" label={t('checkout.card_number')} required error={cardErrors.cardNumber}>
            <div className={s.cardNumberWrap}>
              <input
                {...cardInp('cardNumber')}
                placeholder="1234 5678 9012 3456"
                autoComplete="cc-number"
                inputMode="numeric"
              />
              {cardBrand && <span className={s.cardBrand}>{CARD_ICONS[cardBrand]}</span>}
            </div>
          </Field>

          <div className={s.cardRow}>
            <Field id="card_expiry" label={t('checkout.expiry')} required error={cardErrors.expiry}>
              <div className={s.expiryRow}>
                <select
                  id="card_expiryMonth"
                  className={`input ${s.expirySelect}${cardErrors.expiry ? ' ' + s.inputErr : ''}`}
                  value={card.expiryMonth}
                  onChange={e => onCardChange('expiryMonth', e.target.value)}
                  disabled={placing}
                  autoComplete="cc-exp-month"
                >
                  <option value="">MM</option>
                  {MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <span className={s.expirySep}>/</span>
                <select
                  id="card_expiryYear"
                  className={`input ${s.expirySelect}${cardErrors.expiry ? ' ' + s.inputErr : ''}`}
                  value={card.expiryYear}
                  onChange={e => onCardChange('expiryYear', e.target.value)}
                  disabled={placing}
                  autoComplete="cc-exp-year"
                >
                  <option value="">YYYY</option>
                  {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </Field>

            <Field id="card_cvv" label="CVV" required error={cardErrors.cvv}>
              <div className={s.cvvWrap}>
                <input {...cardInp('cvv')} placeholder="123" autoComplete="cc-csc" inputMode="numeric" />
                <ShieldCheck size={14} className={s.cvvIcon} />
              </div>
            </Field>
          </div>

          {showInstall && (
            <Field id="installments" label={t('checkout.installments')}>
              <select
                id="installments"
                className={`input ${s.installSelect}`}
                value={installments}
                onChange={e => onInstallmentsChange(Number(e.target.value))}
                disabled={placing}
              >
                {INSTALLMENTS_OPTIONS.map(n => (
                  <option key={n} value={n}>
                    {n === 1
                      ? `1 ${t('checkout.installments_each')} — ${formatPrice(displayTotal)}`
                      : `${n} ${t('checkout.installments_each')} × ${formatPrice(displayTotal / n)}`
                    }
                  </option>
                ))}
              </select>
            </Field>
          )}

          {payError && (
            <div className={s.payErrorBox} role="alert">✕ {payError}</div>
          )}

          <p className={s.testCardsNote}>
            {t('checkout.test_cards')}{' '}
            {TEST_CARDS.map((tc, i) => (
              <span key={tc.num}>
                <button
                  type="button"
                  className={s.testCardBtn}
                  onClick={() => onFillTest(tc.num)}
                  disabled={placing}
                >
                  {tc.num}
                </button>
                {' '}({tc.label}){i < TEST_CARDS.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  );
}
