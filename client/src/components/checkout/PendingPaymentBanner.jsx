import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import s from './checkout.module.css';

// ── Live countdown display ────────────────────────────────────────────────────
// expiresAt is always the server-authoritative ISO string from the backend.
// The client never fabricates or adjusts this value.
function CountdownBadge({ expiresAt, onExpired }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt) - Date.now()),
  );
  const cbRef = useRef(onExpired);
  cbRef.current = onExpired;

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, new Date(expiresAt) - Date.now());
      setRemaining(ms);
      if (ms === 0) cbRef.current?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const totalSec = Math.floor(remaining / 1000);
  const mm       = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss       = String(totalSec % 60).padStart(2, '0');
  const urgent   = totalSec > 0 && totalSec < 60;

  return (
    <span className={`${s.timerBadge}${urgent ? ' ' + s.timerUrgent : ''}`}>
      <Clock size={12} />
      {mm}:{ss}
    </span>
  );
}

// ── Banner component ──────────────────────────────────────────────────────────
// Shows either the "reserved" retry banner (with live timer) or the "expired"
// error banner. The parent decides which state is active and passes it in.
export default function PendingPaymentBanner({
  pendingOrderNum,
  expiresAt,
  expired,
  onExpired,
}) {
  const t = useTranslation();

  if (expired) {
    return (
      <div className={s.expiredBanner} role="alert">
        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
        <div>
          <strong>{t('checkout.timer_expired')}</strong>
          {' — '}
          {t('checkout.timer_expired_msg')}
        </div>
      </div>
    );
  }

  if (!pendingOrderNum) return null;

  return (
    <div className={s.retryBanner} role="alert">
      <ShieldCheck size={16} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 'var(--text-sm)' }}>
        {t('checkout.timer_title')}{' '}
        <strong>
          {t('checkout.retry_order')} {pendingOrderNum}
        </strong>
        {' '}
        {t('checkout.retry_suffix')}
      </div>
      {expiresAt && (
        <div className={s.timerWrap}>
          <span className={s.timerLabel}>{t('checkout.timer_expires')}</span>
          <CountdownBadge expiresAt={expiresAt} onExpired={onExpired} />
        </div>
      )}
    </div>
  );
}
