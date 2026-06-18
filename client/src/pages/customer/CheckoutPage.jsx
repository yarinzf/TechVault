import { useState, useEffect } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useNavigate }          from 'react-router-dom';
import { useCart }              from '../../hooks/useCart';
import { useToast }             from '../../hooks/useToast';
import { useTranslation }       from '../../context/LanguageContext';
import { orderService }         from '../../features/orders/api/order.service';
import { paymentService }       from '../../features/payments/api/payment.service';
import { couponService }        from '../../features/coupons/api/coupon.service';
import { locationService }      from '../../features/locations/api/location.service';
import { useCurrency }          from '../../features/currency/hooks/useCurrency';
import Button                   from '../../components/ui/Button/Button';
import SearchableSelect         from '../../components/ui/SearchableSelect/SearchableSelect';
import PendingPaymentBanner     from '../../components/checkout/PendingPaymentBanner';
import DeliverySelector         from '../../components/checkout/DeliverySelector';
import PaymentForm              from '../../components/checkout/PaymentForm';
import CheckoutSummary          from '../../components/checkout/CheckoutSummary';
import s from './CheckoutPage.module.css';

// ── Draft persistence ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'techvault_checkout';
const loadDraft   = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
const saveDraft   = (form, payment, delivery, pendingOrderId, pendingOrderNum, expiresAt) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, payment, delivery, pendingOrderId, pendingOrderNum, expiresAt })); } catch {}
};
const clearDraft  = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };

// ── Validation helpers ────────────────────────────────────────────────────────
const PHONE_IL   = /^(\+972-?|0)5[0-9]-?\d{7}$/;
const PHONE_INTL = /^\+?[0-9\s\-]{7,20}$/;
const NAME_RE    = /^[\p{L}\s'-]+$/u;

const formatCardNumber = v =>
  v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

const CARD_PATTERNS = {
  visa: /^4/, mastercard: /^5[1-5]/, amex: /^3[47]/, discover: /^6(?:011|5)/,
};
const detectCard = num => {
  const raw = num.replace(/\s/g, '');
  for (const [brand, re] of Object.entries(CARD_PATTERNS)) {
    if (re.test(raw)) return brand;
  }
  return null;
};

const EMPTY_FORM = {
  firstName: '', lastName: '', phone: '',
  country: 'Israel', city: '', street: '', houseNumber: '', zip: '',
};
const EMPTY_CARD = { cardHolder: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' };
const CURRENT_YEAR = new Date().getFullYear();

// ── Inline Field wrapper (shipping section only) ──────────────────────────────
function Field({ id, label, required, error, className, children }) {
  return (
    <div className={`${s.field}${className ? ' ' + className : ''}`}>
      <label className={s.label} htmlFor={id}>
        {label}{required && <span className={s.req}> *</span>}
      </label>
      {children}
      {error && <span className={s.errMsg} id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

export default function CheckoutPage() {
  const { items, totalPrice, resetCart } = useCart();
  const { toast }  = useToast();
  const t          = useTranslation();
  const navigate   = useNavigate();

  const draft = loadDraft();

  // ── Form state ───────────────────────────────────────────────────────────
  const [form,     setForm]     = useState(() => draft?.form ? { ...EMPTY_FORM, ...draft.form } : EMPTY_FORM);
  const [card,     setCard]     = useState(EMPTY_CARD);
  const [payment,  setPayment]  = useState(() => draft?.payment  ?? 'credit_card');
  const [delivery, setDelivery] = useState(() => draft?.delivery ?? '');

  // ── Validation state ─────────────────────────────────────────────────────
  const [errors,     setErrors]     = useState({});
  const [cardErrors, setCardErrors] = useState({});
  const [submitted,  setSubmitted]  = useState(false);
  const [placing,    setPlacing]    = useState(false);
  const [payError,   setPayError]   = useState('');

  // ── Coupon state ─────────────────────────────────────────────────────────
  const [couponInput,   setCouponInput]   = useState('');
  const [couponApplied, setCouponApplied] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError,   setCouponError]   = useState('');

  // ── Pending order state ──────────────────────────────────────────────────
  const [pendingOrderId,  setPendingOrderId]  = useState(() => draft?.pendingOrderId  ?? null);
  const [pendingOrderNum, setPendingOrderNum] = useState(() => draft?.pendingOrderNum ?? null);
  const [expiresAt,       setExpiresAt]       = useState(() => draft?.expiresAt       ?? null);
  const [orderExpired,    setOrderExpired]     = useState(false);

  // ── Installments ─────────────────────────────────────────────────────────
  const [installments, setInstallments] = useState(1);

  // ── Location data ────────────────────────────────────────────────────────
  const [countries,        setCountries]        = useState([]);
  const [cities,           setCities]           = useState([]);
  const [streets,          setStreets]          = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingCities,    setLoadingCities]    = useState(false);
  const [loadingStreets,   setLoadingStreets]   = useState(false);

  const { currencyCode, loading: loadingCurrency, fallback: currencyFallback, setCountry, formatPrice } =
    useCurrency(form.country);

  const isIsrael    = form.country === 'Israel';
  const displayTotal = couponApplied ? couponApplied.finalTotal : totalPrice;
  const cardBrand    = detectCard(card.cardNumber);
  const isRetry      = !!pendingOrderId;

  // ── Backend-first pending order recovery ──────────────────────────────────
  // localStorage gives an instant fast-path; the backend fetch is authoritative.
  // If the server has no active pending order, any stale localStorage context
  // is cleared so the user starts fresh.
  useEffect(() => {
    orderService.listMine({ status: 'pending_payment', paymentStatus: 'unpaid', limit: 1 })
      .then(({ orders }) => {
        const serverOrder = orders?.[0];
        if (serverOrder?._id) {
          setPendingOrderId(String(serverOrder._id));
          setPendingOrderNum(serverOrder.orderNumber ?? null);
          const exp = serverOrder.expiresAt ?? null;
          setExpiresAt(exp);
          if (exp && new Date(exp) <= new Date()) setOrderExpired(true);
        } else if (draft?.pendingOrderId) {
          // Server has nothing — stale draft: clear it
          setPendingOrderId(null);
          setPendingOrderNum(null);
          setExpiresAt(null);
        }
      })
      .catch(() => {
        // Network error: keep draft state; detect local expiry
        if (draft?.expiresAt && new Date(draft.expiresAt) <= new Date()) {
          setOrderExpired(true);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catch already-expired draft on first render (before backend responds)
  useEffect(() => {
    if (expiresAt && new Date(expiresAt) <= new Date()) setOrderExpired(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft
  useEffect(() => {
    saveDraft(form, payment, delivery, pendingOrderId, pendingOrderNum, expiresAt);
  }, [form, payment, delivery, pendingOrderId, pendingOrderNum, expiresAt]);

  // Location data
  useEffect(() => {
    setLoadingCountries(true);
    locationService.getCountries().then(setCountries).finally(() => setLoadingCountries(false));
  }, []);
  useEffect(() => {
    if (form.country !== 'Israel') { setCities([]); setStreets([]); return; }
    setLoadingCities(true);
    locationService.getCities('Israel').then(setCities).finally(() => setLoadingCities(false));
  }, [form.country]);
  useEffect(() => {
    if (form.country !== 'Israel' || !form.city) { setStreets([]); return; }
    setLoadingStreets(true);
    locationService.getStreets('Israel', form.city).then(setStreets).finally(() => setLoadingStreets(false));
  }, [form.country, form.city]);

  // ── Form handlers ────────────────────────────────────────────────────────
  const setField = field => e => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(err => ({ ...err, [field]: undefined }));
  };
  const onCountryChange = val => {
    setForm(f => ({ ...f, country: val, city: '', street: '' }));
    setErrors(err => ({ ...err, country: undefined, city: undefined, street: undefined }));
    setCountry(val);
  };
  const onCityChange   = val => {
    setForm(f => ({ ...f, city: val, street: '' }));
    setErrors(err => ({ ...err, city: undefined, street: undefined }));
  };
  const onStreetChange = val => {
    setForm(f => ({ ...f, street: val }));
    if (errors.street) setErrors(err => ({ ...err, street: undefined }));
  };

  const onCardChange = (field, rawValue) => {
    let val = rawValue;
    if (field === 'cardNumber') val = formatCardNumber(val);
    if (field === 'cvv')        val = val.replace(/\D/g, '').slice(0, 4);
    if (field === 'cardHolder') val = val.replace(/[^a-zA-Zא-ת\s'-]/g, '');
    setCard(c => ({ ...c, [field]: val }));
    if (cardErrors[field]) setCardErrors(ce => ({ ...ce, [field]: undefined }));
    if (payError) setPayError('');
  };

  const fillTestCard = num => {
    setCard({ cardHolder: 'Test User', cardNumber: num, expiryMonth: '12', expiryYear: String(CURRENT_YEAR + 3), cvv: '123' });
    setCardErrors({});
    setPayError('');
  };

  // ── Coupon handlers ──────────────────────────────────────────────────────
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) { setCouponError(t('checkout.err.coupon_enter')); return; }
    setCouponLoading(true);
    setCouponError('');
    try {
      const result = await couponService.validate(code, totalPrice);
      setCouponApplied({
        code:       result.coupon?.code  ?? code,
        type:       result.coupon?.type,
        value:      result.coupon?.value,
        discount:   result.discount,
        finalTotal: result.finalTotal,
      });
      setCouponInput('');
    } catch (err) {
      const CODE_MESSAGES = {
        COUPON_NOT_FOUND:     t('checkout.err.coupon_not_found'),
        COUPON_EXPIRED:       t('checkout.err.coupon_expired'),
        COUPON_NOT_YET_VALID: t('checkout.err.coupon_not_yet'),
        COUPON_LIMIT_REACHED: t('checkout.err.coupon_limit'),
        COUPON_USER_LIMIT:    t('checkout.err.coupon_user_limit'),
        COUPON_MIN_ORDER:     err.message,
      };
      setCouponError(CODE_MESSAGES[err.code] ?? err.message ?? t('checkout.err.coupon_enter'));
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => { setCouponApplied(null); setCouponInput(''); setCouponError(''); };

  // ── Validation ───────────────────────────────────────────────────────────
  const validateShipping = () => {
    const e = {};
    const fn = form.firstName.trim();
    if (!fn || fn.length < 2)    e.firstName = t('checkout.err.min2');
    else if (!NAME_RE.test(fn))  e.firstName = t('checkout.err.letters');
    const ln = form.lastName.trim();
    if (!ln || ln.length < 2)    e.lastName = t('checkout.err.min2');
    else if (!NAME_RE.test(ln))  e.lastName = t('checkout.err.letters');
    const ph = form.phone.trim().replace(/\s/g, '');
    if (!ph)                                   e.phone = t('checkout.err.required');
    else if (isIsrael && !PHONE_IL.test(ph))   e.phone = t('checkout.err.phone_il');
    else if (!isIsrael && !PHONE_INTL.test(ph)) e.phone = t('checkout.err.phone_intl');
    if (!form.country) e.country = t('checkout.err.required');
    if (isIsrael) {
      if (!form.city)   e.city   = t('checkout.err.select_city');
      if (!form.street) e.street = t('checkout.err.select_street');
    } else {
      if (!form.city.trim() || form.city.trim().length < 2)     e.city   = t('checkout.err.min2');
      if (!form.street.trim() || form.street.trim().length < 3) e.street = t('checkout.err.min3');
    }
    const hn = form.houseNumber.trim();
    if (!hn)                               e.houseNumber = t('checkout.err.required');
    else if (!/^\d+[a-zA-Z]?$/.test(hn))  e.houseNumber = t('checkout.err.numbers');
    const zip = form.zip.trim();
    if (zip && !/^\d{5,7}$/.test(zip))    e.zip = t('checkout.err.zip');
    return e;
  };

  const validateCard = () => {
    const ce = {};
    if (!card.cardHolder.trim()) ce.cardHolder = t('checkout.err.required');
    const num = card.cardNumber.replace(/\s/g, '');
    if (!num)                              ce.cardNumber = t('checkout.err.required');
    else if (num.length < 13 || num.length > 19) ce.cardNumber = t('checkout.err.card_number');
    if (!card.expiryMonth || !card.expiryYear) {
      ce.expiry = t('checkout.err.required');
    } else {
      const month = parseInt(card.expiryMonth, 10);
      const year  = parseInt(card.expiryYear, 10);
      const now   = new Date();
      if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
        ce.expiry = t('checkout.err.expiry_expired');
      }
    }
    if (!card.cvv)              ce.cvv = t('checkout.err.required');
    else if (card.cvv.length < 3) ce.cvv = t('checkout.err.cvv');
    return ce;
  };

  const validate = () => {
    setSubmitted(true);
    const shippingErrs = validateShipping();
    const cardErrs     = payment === 'credit_card' ? validateCard() : {};
    const deliveryErr  = !delivery ? { delivery: t('checkout.err.delivery') } : {};
    setErrors({ ...shippingErrs, ...deliveryErr });
    setCardErrors(cardErrs);
    return (
      Object.keys(shippingErrs).length === 0 &&
      Object.keys(cardErrs).length === 0 &&
      !deliveryErr.delivery
    );
  };

  // ── Place order / retry payment ──────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (orderExpired) return;
    if (!validate()) return;
    setPlacing(true);
    setPayError('');

    try {
      const shippingAddress = {
        street:  `${form.street} ${form.houseNumber.trim()}`,
        city:    form.city,
        zip:     form.zip.trim(),
        country: form.country,
      };
      const notesParts = [
        `Name: ${form.firstName.trim()} ${form.lastName.trim()}`,
        form.phone.trim() && `Phone: ${form.phone.trim()}`,
        delivery         && `Delivery: ${delivery}`,
        installments > 1 && `Installments: ${installments}`,
      ].filter(Boolean);

      let orderId;
      if (pendingOrderId) {
        orderId = pendingOrderId;
      } else {
        const orderObj = await orderService.create(
          shippingAddress,
          notesParts.join(' | '),
          couponApplied?.code ?? null,
        );
        orderId = orderObj._id;
        setPendingOrderId(String(orderId));
        setPendingOrderNum(orderObj.orderNumber ?? null);
        setExpiresAt(orderObj.expiresAt ?? null);
      }

      const expiryCard = card.expiryMonth && card.expiryYear
        ? `${card.expiryMonth}/${card.expiryYear.slice(-2)}`
        : '';

      const { paymentIntentId } = await paymentService.createIntent(orderId, {
        cardNumber: card.cardNumber,
        cardHolder: card.cardHolder,
        expiry:     expiryCard,
        cvv:        card.cvv,
      });

      await paymentService.confirmPayment(orderId, paymentIntentId);

      setPendingOrderId(null);
      setPendingOrderNum(null);
      setExpiresAt(null);
      setCouponApplied(null);
      clearDraft();
      resetCart();
      navigate(`/order-success/${orderId}`, { replace: true });
    } catch (err) {
      const msg = err.message || t('checkout.err.order_failed');
      setPayError(msg);
      toast.error(msg);
    } finally {
      setPlacing(false);
    }
  };

  // ── Input prop helpers ───────────────────────────────────────────────────
  const inp = (field, extra = {}) => ({
    id:           field,
    className:    errors[field]
      ? `input ${s.inputErr}`
      : submitted && String(form[field] ?? '').trim()
        ? `input ${s.inputOk}`
        : 'input',
    value:        form[field],
    onChange:     setField(field),
    autoComplete: 'off',
    disabled:     placing,
    'aria-invalid':    !!errors[field],
    'aria-describedby': errors[field] ? `${field}-err` : undefined,
    ...extra,
  });

  const phonePlaceholder = isIsrael ? '050-1234567' : '+1 555 000 0000';

  // ── Empty cart guard ─────────────────────────────────────────────────────
  if (items.length === 0 && !pendingOrderId) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🛒</div>
          <h3>{t('checkout.cart_empty')}</h3>
          <p>{t('checkout.cart_empty_sub')}</p>
          <Button onClick={() => navigate('/products')}>{t('checkout.discover')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <button className={s.back} onClick={() => navigate('/cart')} disabled={placing}>
        {t('checkout.back')}
      </button>
      <h1 className={s.heading}>{t('checkout.heading')}</h1>

      {/* Progress indicator */}
      <div className={s.progressWrap} aria-label={t('checkout.progress_label')}>
        <div className={`${s.progressStep} ${s.progressDone}`}>
          <div className={s.progressDot}><CheckCircle size={13} /></div>
          <span className={s.progressLabel}>{t('checkout.progress_cart')}</span>
        </div>
        <div className={s.progressLine} />
        <div className={`${s.progressStep} ${s.progressCurrent}`}>
          <div className={s.progressDot}>
            {placing ? <Loader2 size={13} className={s.spinIcon} /> : <span>2</span>}
          </div>
          <span className={s.progressLabel}>{t('checkout.progress_payment')}</span>
        </div>
        <div className={s.progressLine} />
        <div className={s.progressStep}>
          <div className={s.progressDot}><span>3</span></div>
          <span className={s.progressLabel}>{t('checkout.progress_confirm')}</span>
        </div>
      </div>

      {/* Pending payment banner (retry or expired) */}
      <PendingPaymentBanner
        pendingOrderNum={pendingOrderNum}
        expiresAt={expiresAt}
        expired={orderExpired}
        onExpired={() => setOrderExpired(true)}
      />

      <div className={s.layout}>
        {/* ── Left column ── */}
        <div className={s.left}>

          {/* Shipping details */}
          <section className={s.card}>
            <h2 className={s.sectionTitle}>{t('checkout.shipping_title')}</h2>
            <div className={s.grid}>
              <Field id="firstName" label={t('checkout.first_name')} required error={errors.firstName}>
                <input {...inp('firstName')} placeholder={t('checkout.ph.first_name')} />
              </Field>
              <Field id="lastName" label={t('checkout.last_name')} required error={errors.lastName}>
                <input {...inp('lastName')} placeholder={t('checkout.ph.last_name')} />
              </Field>
              <Field id="phone" label={t('checkout.phone')} required error={errors.phone}>
                <input {...inp('phone')} placeholder={phonePlaceholder} type="tel" />
              </Field>
              <Field id="country" label={t('checkout.country')} required error={errors.country}>
                <SearchableSelect
                  id="country" options={countries} value={form.country}
                  onChange={onCountryChange} placeholder={t('checkout.ph.select_country')}
                  loading={loadingCountries} disabled={placing}
                  error={!!errors.country} ok={submitted && !!form.country && !errors.country}
                  describedBy={errors.country ? 'country-err' : undefined}
                />
              </Field>
              <Field id="city" label={t('checkout.city')} required error={errors.city}>
                {isIsrael ? (
                  <SearchableSelect
                    id="city" options={cities} value={form.city}
                    onChange={onCityChange}
                    placeholder={loadingCities ? t('checkout.ph.loading_cities') : t('checkout.ph.select_city')}
                    loading={loadingCities} disabled={placing}
                    error={!!errors.city} ok={submitted && !!form.city && !errors.city}
                    describedBy={errors.city ? 'city-err' : undefined}
                  />
                ) : (
                  <input {...inp('city')} placeholder={t('checkout.ph.city')} />
                )}
              </Field>
              <Field id="zip" label={t('checkout.zip')} error={errors.zip}>
                <input {...inp('zip')} placeholder={t('checkout.ph.zip')} />
              </Field>
              {!isIsrael && form.country && (
                <p className={`${s.manualNote} ${s.span2}`}>{t('checkout.manual_note')}</p>
              )}
              <Field
                id="street"
                label={isIsrael ? t('checkout.street_il') : t('checkout.street_intl')}
                required
                error={errors.street || errors.houseNumber}
                className={s.span2}
              >
                <div className={s.streetRow}>
                  <div className={s.streetSelect}>
                    {isIsrael ? (
                      <SearchableSelect
                        id="street" options={streets} value={form.street}
                        onChange={onStreetChange}
                        placeholder={
                          loadingStreets ? t('checkout.ph.loading_streets')
                          : form.city    ? t('checkout.ph.select_street')
                          :                t('checkout.ph.select_city_first')
                        }
                        loading={loadingStreets} disabled={placing || !form.city}
                        error={!!errors.street} ok={submitted && !!form.street && !errors.street}
                        describedBy={errors.street || errors.houseNumber ? 'street-err' : undefined}
                      />
                    ) : (
                      <input
                        {...inp('street', { 'aria-describedby': errors.street || errors.houseNumber ? 'street-err' : undefined })}
                        placeholder={t('checkout.ph.street')}
                      />
                    )}
                  </div>
                  <div className={s.houseWrap}>
                    <input
                      {...inp('houseNumber', { 'aria-describedby': errors.houseNumber ? 'street-err' : undefined })}
                      placeholder={t('checkout.ph.house_number')}
                    />
                  </div>
                </div>
              </Field>
            </div>
          </section>

          <DeliverySelector
            value={delivery}
            error={errors.delivery}
            disabled={placing}
            onChange={val => {
              setDelivery(val);
              if (errors.delivery) setErrors(e => ({ ...e, delivery: undefined }));
            }}
            submitted={submitted}
          />

          <PaymentForm
            payment={payment}       onPaymentChange={val => { setPayment(val); setPayError(''); }}
            card={card}             onCardChange={onCardChange}
            cardErrors={cardErrors} payError={payError}
            placing={placing}
            installments={installments} onInstallmentsChange={setInstallments}
            displayTotal={displayTotal} formatPrice={formatPrice}
            cardBrand={cardBrand}   onFillTest={fillTestCard}
          />
        </div>

        {/* ── Right column: order summary ── */}
        <aside className={s.summary}>
          <CheckoutSummary
            items={items}
            coupon={{
              input:    couponInput,
              applied:  couponApplied,
              loading:  couponLoading,
              error:    couponError,
              onInput:  val => { setCouponInput(val); if (couponError) setCouponError(''); },
              onApply:  applyCoupon,
              onRemove: removeCoupon,
            }}
            totals={{ totalPrice, displayTotal, installments }}
            currency={{ formatPrice, loading: loadingCurrency, fallback: currencyFallback, code: currencyCode }}
            delivery={delivery}
            placing={placing}
            orderExpired={orderExpired}
            isRetry={isRetry}
            onPlaceOrder={handlePlaceOrder}
          />
        </aside>
      </div>
    </div>
  );
}
