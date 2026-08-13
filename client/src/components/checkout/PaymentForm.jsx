import { ShieldCheck, CreditCard, Wallet, Apple, Chrome, Smartphone, Box, Check, Info } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import s from './checkout.module.css';

const CURRENT_YEAR         = new Date().getFullYear();
const MONTH_OPTIONS        = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const YEAR_OPTIONS         = Array.from({ length: 21 }, (_, i) => String(CURRENT_YEAR + i));
const INSTALLMENTS_OPTIONS = [1, 2, 3, 4, 5, 6, 10, 12];
const INSTALLMENTS_THRESHOLD = 500;

const CARD_ICONS = { visa: '💳 Visa', mastercard: '💳 MC', amex: '💳 Amex', discover: '💳 Disc' };

// All six methods are Sapir's exact reference set (icon/color per her
// design) — visual parity only. credit_card is the only one wired to a
// real payment flow (Stripe test-mode PaymentIntent below); the others are
// fully selectable/visible like Sapir's design, but attempting to place an
// order through one is blocked (see CheckoutPage.jsx's handlePlaceOrder)
// rather than silently faking a successful charge. No "coming soon" badge
// is shown — Sapir's reference doesn't have one.
const PAYMENT_METHODS = [
  { id: 'credit_card', label: 'checkout.payment_credit', Icon: CreditCard, iconBg: 'rgba(37,99,235,0.12)',   iconColor: 'var(--sv-blue-l)' },
  { id: 'apple_pay',   label: 'Apple Pay',                Icon: Apple,      iconBg: 'rgba(255,255,255,0.08)', iconColor: '#F9FAFB' },
  { id: 'google_pay',  label: 'Google Pay',                Icon: Chrome,     iconBg: 'rgba(16,185,129,0.12)',  iconColor: '#10B981' },
  { id: 'paypal',      label: 'PayPal',                    Icon: Wallet,     iconBg: 'rgba(37,99,235,0.12)',   iconColor: '#0070BA' },
  { id: 'bit',         label: 'Bit',                       Icon: Smartphone, iconBg: 'rgba(249,115,22,0.12)',  iconColor: '#F97316' },
  { id: 'paybox',      label: 'PayBox',                    Icon: Box,        iconBg: 'rgba(37,99,235,0.12)',   iconColor: 'var(--sv-blue-l)' },
];

function Field({ id, label, required, optional, error, children }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
        {required && <span className={s.req}> *</span>}
        {!required && optional && <span className={s.req}> {optional}</span>}
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

  const TEST_CARDS = [
    { num: '4242 4242 4242 4242', label: t('checkout.test_success') },
    { num: '4000 0000 0000 0002', label: t('checkout.test_decline') },
  ];

  const showInstall = displayTotal >= INSTALLMENTS_THRESHOLD;
  const isZeroCash  = displayTotal === 0;
  const showCardForm = payment === 'credit_card' && !isZeroCash;
  const showPlaceholder = payment !== 'credit_card' && !isZeroCash;

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
      <div className={s.sectionHeader}>
        <div className={s.sectionNum}>4</div>
        <h2 className={s.sectionTitle}>{t('checkout.payment_title')}</h2>
      </div>
      <div className={s.demoBanner}>{t('checkout.demo_banner')}</div>

      {isZeroCash && (
        <div className={s.demoBanner}>{t('checkout.zero_cash_paid')}</div>
      )}

      <div className={s.pmGrid}>
        {PAYMENT_METHODS.map(m => (
          <label
            key={m.id}
            className={[s.pmCard, payment === m.id ? s.pmCardSelected : ''].filter(Boolean).join(' ')}
          >
            <input
              type="radio" name="payment" value={m.id}
              checked={payment === m.id}
              onChange={() => onPaymentChange(m.id)}
              disabled={placing}
              style={{ display: 'none' }}
            />
            {payment === m.id && (
              <span className={s.pmCheck}><Check size={11} strokeWidth={3} /></span>
            )}
            <div className={s.pmIcon} style={{ background: m.iconBg }}>
              <m.Icon size={19} strokeWidth={1.6} style={{ color: m.iconColor }} />
            </div>
            <div className={s.pmName}>{m.label === 'checkout.payment_credit' ? t('checkout.payment_credit') : m.label}</div>
          </label>
        ))}
      </div>

      {showCardForm && (
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

          {/* Sapir's reference keeps expiry/CVV/installments in one
              three-column row (.co-form-row.triple); installments is only
              shown once real functionality requires it (displayTotal above
              the threshold), so this row is two columns when hidden and
              three when shown — never a separate row below. */}
          <div className={showInstall ? s.cardRowTriple : s.cardRow}>
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
          </div>

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

      {/* Sapir's own .co-pm-placeholder — shown for any selected method
          other than credit card. Real functionality boundary: the actual
          submit is blocked elsewhere (CheckoutPage.jsx) rather than faking
          a transaction through this method. */}
      {showPlaceholder && (
        <div className={s.pmPlaceholder}>
          <Info size={18} />
          <span>{t('checkout.payment_unavailable_note')}</span>
        </div>
      )}

      {payError && (
        <div className={s.payErrorBox} role="alert">✕ {payError}</div>
      )}
    </section>
  );
}
