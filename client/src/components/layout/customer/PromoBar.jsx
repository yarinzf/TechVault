import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../context/LanguageContext';
import s from './PromoBar.module.css';

// Honest, generic store messages only — no invented discounts, delivery
// promises, membership pricing, or blanket warranty claims. The shipping
// slide is the one exception: server/services/order.service.js sets
// shippingCost = 0 unconditionally, so "free shipping" here is a real,
// verified fact rather than marketing copy.
const SLIDE_KEYS = [
  { tagKey: 'promo.shipping_tag', textKey: 'promo.shipping_text', ctaKey: 'promo.shipping_cta' },
  { tagKey: 'promo.new_tag',      textKey: 'promo.new_text',      ctaKey: 'promo.new_cta'      },
  { tagKey: 'promo.stock_tag',    textKey: 'promo.stock_text',    ctaKey: 'promo.stock_cta'     },
];

export default function PromoBar() {
  const t = useTranslation();
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

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
              onClick={() => navigate('/products')}
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
