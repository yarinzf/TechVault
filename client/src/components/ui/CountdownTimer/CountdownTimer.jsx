import { useState, useEffect } from 'react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './CountdownTimer.module.css';

function getTimeLeft(targetDate) {
  const diff = Math.max(0, new Date(targetDate).getTime() - Date.now());
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000)  / 60_000),
    seconds: Math.floor((diff % 60_000)     / 1_000),
    expired: diff === 0,
  };
}

const pad = (n) => String(n).padStart(2, '0');

export default function CountdownTimer({
  targetDate,
  onExpire,
  showDays = true,
  compact = false,
  className = '',
}) {
  const [time, setTime] = useState(() => getTimeLeft(targetDate));
  const t = useTranslation();

  useEffect(() => {
    if (time.expired) return;
    const id = setInterval(() => {
      const next = getTimeLeft(targetDate);
      setTime(next);
      if (next.expired) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [targetDate, time.expired, onExpire]);

  if (time.expired) return null;

  if (compact) {
    return (
      <span className={`${s.compact} ${className}`}>
        {showDays && time.days > 0 && `${time.days}d `}
        {pad(time.hours)}:{pad(time.minutes)}:{pad(time.seconds)}
      </span>
    );
  }

  return (
    <div className={`${s.timer} ${className}`} aria-label={t('timer.label')}>
      {showDays && time.days > 0 && (
        <>
          <Unit digit={pad(time.days)} label={t('timer.days')} />
          <span className={s.sep} aria-hidden="true">:</span>
        </>
      )}
      <Unit digit={pad(time.hours)}   label={t('timer.hours')} />
      <span className={s.sep} aria-hidden="true">:</span>
      <Unit digit={pad(time.minutes)} label={t('timer.minutes')} />
      <span className={s.sep} aria-hidden="true">:</span>
      <Unit digit={pad(time.seconds)} label={t('timer.seconds')} />
    </div>
  );
}

function Unit({ digit, label }) {
  return (
    <div className={s.unit}>
      <span className={s.digit}>{digit}</span>
      <span className={s.label}>{label}</span>
    </div>
  );
}
