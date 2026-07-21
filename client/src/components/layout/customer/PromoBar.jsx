import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './PromoBar.module.css';

const SLIDE_KEYS = [
  { tagKey: 'promo.shipping_tag', textKey: 'promo.shipping_text', ctaKey: 'promo.shipping_cta' },
  { tagKey: 'promo.club_tag',     textKey: 'promo.club_text',     ctaKey: 'promo.club_cta'     },
  { tagKey: 'promo.warranty_tag', textKey: 'promo.warranty_text', ctaKey: 'promo.warranty_cta' },
];

export default function PromoBar() {
  const t = useTranslation();
  const [idx,    setIdx]    = useState(0);
  const [closed, setClosed] = useState(false);
  const timer               = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setIdx(i => (i + 1) % SLIDE_KEYS.length);
    }, 4000);
    return () => clearInterval(timer.current);
  }, []);

  if (closed) return null;

  return (
    <div className={s.bar} role="status" aria-live="polite" aria-atomic="true">
      <div className={s.inner}>
        {SLIDE_KEYS.map((slide, i) => (
          <div
            key={i}
            className={`${s.slide} ${i === idx ? s.active : ''}`}
            aria-hidden={i !== idx}
          >
            <span className={s.tag}>{t(slide.tagKey)}</span>
            <span className={s.text}>{t(slide.textKey)}</span>
            <span className={s.cta}>{t(slide.ctaKey)}</span>
          </div>
        ))}
      </div>
      <button
        className={s.close}
        onClick={() => setClosed(true)}
        aria-label={t('promo.close_arialabel')}
      >
        <X size={13} />
      </button>
    </div>
  );
}
