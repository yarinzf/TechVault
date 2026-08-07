import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../context/LanguageContext';
import { useMembership } from '../../../hooks/useMembership';
import s from './PromoBar.module.css';

const NON_MEMBER_CLUB_SLIDE = {
  tagKey: 'promo.club_tag', textKey: 'promo.club_text', ctaKey: 'promo.club_cta',
  action: (navigate) => navigate('/club'),
};

// An active member has already joined — showing a "join the club" CTA again
// makes no sense, so this slide swaps to a benefits-oriented message instead.
const MEMBER_CLUB_SLIDE = {
  tagKey: 'promo.club_member_tag', textKey: 'promo.club_member_text', ctaKey: 'promo.club_member_cta',
  action: (navigate) => navigate('/club'),
};

const OTHER_SLIDES = [
  { tagKey: 'promo.shipping_tag', textKey: 'promo.shipping_text', ctaKey: 'promo.shipping_cta', action: (navigate) => navigate('/category/monitors') },
  { tagKey: 'promo.warranty_tag', textKey: 'promo.warranty_text', ctaKey: 'promo.warranty_cta', action: () => document.getElementById('policyBar')?.scrollIntoView({ behavior: 'smooth' }) },
];

export default function PromoBar() {
  const t = useTranslation();
  const navigate = useNavigate();
  const { isMember } = useMembership();
  const [idx, setIdx] = useState(0);
  const timer         = useRef(null);

  const clubSlide = isMember ? MEMBER_CLUB_SLIDE : NON_MEMBER_CLUB_SLIDE;
  const slides = [OTHER_SLIDES[0], clubSlide, OTHER_SLIDES[1]];

  useEffect(() => {
    timer.current = setInterval(() => {
      setIdx(i => (i + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer.current);
  }, [slides.length]);

  return (
    <div className={s.bar} role="status" aria-live="polite" aria-atomic="true">
      <div className={s.inner}>
        {slides.map((slide, i) => (
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
