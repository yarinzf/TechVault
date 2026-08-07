import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Loader2, Crown, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMembership } from '../../hooks/useMembership';
import { useToast } from '../../hooks/useToast';
import { membershipService } from '../../features/membership/api/membership.service';
import { paymentService } from '../../features/payments/api/payment.service';
import PaymentForm from '../../components/checkout/PaymentForm';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import s from './MembershipCheckoutPage.module.css';

const EMPTY_CARD = { cardHolder: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' };
const CURRENT_YEAR = new Date().getFullYear();

const formatCardNumber = v => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

const CARD_PATTERNS = { visa: /^4/, mastercard: /^5[1-5]/, amex: /^3[47]/, discover: /^6(?:011|5)/ };
const detectCard = num => {
  const raw = num.replace(/\s/g, '');
  for (const [brand, re] of Object.entries(CARD_PATTERNS)) {
    if (re.test(raw)) return brand;
  }
  return null;
};

const formatPrice = (n) => `₪${n}`;

export default function MembershipCheckoutPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { isMember, loading: membershipLoading } = useMembership();
  const { toast } = useToast();

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [card, setCard] = useState(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState({});
  const [payError, setPayError] = useState('');
  const [placing, setPlacing] = useState(false);

  // Active members must never be able to buy membership again — guard both
  // the render and any deep-linked/stale URL to this page.
  useEffect(() => {
    if (!membershipLoading && isMember) {
      navigate('/club', { replace: true });
    }
  }, [membershipLoading, isMember, navigate]);

  useEffect(() => {
    if (membershipLoading || isMember) return;
    membershipService.checkout()
      .then(setOrder)
      .catch(err => {
        if (err.code === 'ALREADY_MEMBER') {
          navigate('/club', { replace: true });
          return;
        }
        setError(err.message || 'שגיאה ביצירת הזמנת המועדון');
      })
      .finally(() => setLoading(false));
  }, [membershipLoading, isMember, navigate]);

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

  const validateCard = () => {
    const ce = {};
    if (!card.cardHolder.trim()) ce.cardHolder = 'שדה חובה';
    const num = card.cardNumber.replace(/\s/g, '');
    if (!num) ce.cardNumber = 'שדה חובה';
    else if (num.length < 13 || num.length > 19) ce.cardNumber = 'מספר כרטיס לא תקין';
    if (!card.expiryMonth || !card.expiryYear) {
      ce.expiry = 'שדה חובה';
    } else {
      const month = parseInt(card.expiryMonth, 10);
      const year  = parseInt(card.expiryYear, 10);
      const now   = new Date();
      if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
        ce.expiry = 'הכרטיס פג תוקף';
      }
    }
    if (!card.cvv) ce.cvv = 'שדה חובה';
    else if (card.cvv.length < 3) ce.cvv = 'CVV לא תקין';
    return ce;
  };

  const handlePay = async () => {
    if (!order) return;
    const errs = validateCard();
    setCardErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setPlacing(true);
    setPayError('');
    try {
      const expiryCard = card.expiryMonth && card.expiryYear
        ? `${card.expiryMonth}/${card.expiryYear.slice(-2)}`
        : '';

      const { paymentIntentId } = await paymentService.createIntent(order._id, {
        cardNumber: card.cardNumber,
        cardHolder: card.cardHolder,
        expiry:     expiryCard,
        cvv:        card.cvv,
      });

      await paymentService.confirmPayment(order._id, paymentIntentId);

      // Single source of truth: refresh the authenticated user so
      // membership.status flips to 'active' everywhere (Home, PromoBar, Club
      // page) without needing to manually patch multiple components.
      await refreshProfile();

      navigate(`/order-success/${order._id}`, { replace: true });
    } catch (err) {
      const msg = err.message || 'אירעה שגיאה בתשלום';
      setPayError(msg);
      toast.error(msg);
    } finally {
      setPlacing(false);
    }
  };

  if (membershipLoading || loading) return <PageSpinner />;

  if (error) {
    return (
      <div className={s.page}>
        <div className={s.centerState}>
          <ShieldCheck size={40} className={s.centerIcon} />
          <div className={s.centerTitle}>לא ניתן להשלים את ההצטרפות</div>
          <p className={s.centerBody}>{error}</p>
        </div>
      </div>
    );
  }

  const cardBrand = detectCard(card.cardNumber);

  return (
    <div className={s.page}>
      <div className={s.breadcrumb}>
        <Link to="/club"><ArrowRight size={13} /> מועדון TechVault</Link>
        <span>›</span>
        <span className={s.breadcrumbCurrent}>הצטרפות למועדון</span>
      </div>

      <div className={s.header}>
        <h1 className={s.heading}>הצטרפות למועדון TechVault</h1>
        <p className={s.subtitle}>תשלום חד-פעמי — חברות לכל החיים</p>
      </div>

      <div className={s.orderCard}>
        <div className={s.orderIcon}><Crown size={20} /></div>
        <div className={s.orderInfo}>
          <div className={s.orderTitle}>חברות מועדון TechVault — לכל החיים</div>
          <div className={s.orderSub}>הזמנה #{order?.orderNumber}</div>
        </div>
        <div className={s.orderPrice}>{formatPrice(order?.total ?? 50)}</div>
      </div>

      <PaymentForm
        payment="credit_card"
        onPaymentChange={() => {}}
        card={card}
        onCardChange={onCardChange}
        cardErrors={cardErrors}
        payError={payError}
        placing={placing}
        installments={1}
        onInstallmentsChange={() => {}}
        displayTotal={order?.total ?? 50}
        formatPrice={formatPrice}
        cardBrand={cardBrand}
        onFillTest={fillTestCard}
      />

      <div className={s.payBar}>
        <button className={s.payBtn} onClick={handlePay} disabled={placing || !order}>
          {placing
            ? <><Loader2 size={16} className={s.spinIcon} /> מעבד תשלום…</>
            : <><ShieldCheck size={16} /> הצטרפות ותשלום · {formatPrice(order?.total ?? 50)}</>}
        </button>
      </div>
    </div>
  );
}
