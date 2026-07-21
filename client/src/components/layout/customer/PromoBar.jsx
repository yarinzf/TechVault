import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../context/LanguageContext';
import s from './PromoBar.module.css';

const SLIDE_KEYS = [
  { tagKey: 'promo.shipping_tag', textKey: 'promo.shipping_text', ctaKey: 'promo.shipping_cta', action: (navigate) => navigate('/category/monitors') },
  { tagKey: 'promo.club_tag',     textKey: 'promo.club_text',     ctaKey: 'promo.club_cta',     action: (navigate) => navigate('/register') },
  { tagKey: 'promo.warranty_tag', textKey: 'promo.warranty_text', ctaKey: 'promo.warranty_cta', action: () => document.getElementById('policyBar')?.scrollIntoView({ behavior: 'smooth' }) },
];

export default function PromoBar() {
  const t = useTranslation();
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const timer         = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setIdx(i => (i + 1) % SLIDE_KEYS.length);
    }, 4000);
    return () => clearInterval(timer.current);
  }, []);

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
            <button
              type="button"
              className={s.cta}
              onClick={() => slide.action(navigate)}
              tabIndex={i === idx ? 0 : -1}
            >
              {t(slide.ctaKey)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
