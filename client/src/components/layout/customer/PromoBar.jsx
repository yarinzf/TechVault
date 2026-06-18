import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import s from './PromoBar.module.css';

const SLIDES = [
  { tag: 'משלוח חינם',    text: 'משלוח חינם לכל הארץ בהזמנות מעל ₪299',                          cta: 'לקנייה עכשיו ←' },
  { tag: 'מועדון גיימרים', text: 'הצטרפו למועדון TechVault — ₪50 בלבד לכל החיים. הטבות, נקודות ועוד', cta: 'הצטרפו עכשיו ←' },
  { tag: 'אחריות יצרן',   text: 'אחריות יצרן מלאה על כל המוצרים באתר — ללא תנאים',                cta: 'למדיניות שלנו ←' },
];

export default function PromoBar() {
  const [idx,    setIdx]    = useState(0);
  const [closed, setClosed] = useState(false);
  const timer               = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setIdx(i => (i + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(timer.current);
  }, []);

  if (closed) return null;

  return (
    <div className={s.bar} role="status" aria-live="polite" aria-atomic="true">
      <div className={s.inner}>
        {SLIDES.map((slide, i) => (
          <div
            key={i}
            className={`${s.slide} ${i === idx ? s.active : ''}`}
            aria-hidden={i !== idx}
          >
            <span className={s.tag}>{slide.tag}</span>
            <span className={s.text}>{slide.text}</span>
            <span className={s.cta}>{slide.cta}</span>
          </div>
        ))}
      </div>
      <button
        className={s.close}
        onClick={() => setClosed(true)}
        aria-label="סגור פס הכרזות"
      >
        <X size={13} />
      </button>
    </div>
  );
}
