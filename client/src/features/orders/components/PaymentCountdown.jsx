import { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

// Shared by OrdersPage (list cards) and OrderDetailsPage — live mm:ss
// countdown to a pending order's real payment-reservation expiry.
export default function PaymentCountdown({ expiresAt, s }) {
  const { t } = useLanguage();
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
    return <span className={s.expiredBadge}>{t('order.payment_expired')}</span>;
  }

  return (
    <span className={`${s.timerBadge}${urgent ? ' ' + s.timerUrgent : ''}`}>
      <Clock size={11} />
      {t('order.expires_in')} {mm}:{ss}
    </span>
  );
}
