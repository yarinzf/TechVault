import { useState } from 'react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './StarRating.module.css';

const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function StarSvg({ size = 18, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path d={STAR_PATH} />
    </svg>
  );
}

/* ── Display mode (readonly, supports fractional value) ── */
function StarDisplay({ value, size, count }) {
  const t = useTranslation();
  const pct = Math.min(100, Math.max(0, (value / count) * 100));

  return (
    <div
      className={s.displayWrap}
      role="img"
      aria-label={t('product.rating_display_label').replace('{value}', value.toFixed(1)).replace('{count}', count)}
    >
      {/* Background — empty stars */}
      <div className={s.emptyLayer}>
        {Array.from({ length: count }).map((_, i) => (
          <StarSvg key={i} size={size} className={s.starEmpty} />
        ))}
      </div>
      {/* Foreground — filled stars, clipped to percentage */}
      <div className={s.filledLayer} style={{ width: `${pct}%` }}>
        {Array.from({ length: count }).map((_, i) => (
          <StarSvg key={i} size={size} className={s.starFilled} />
        ))}
      </div>
    </div>
  );
}

/* ── Interactive / picker mode (whole stars only) ── */
function StarPicker({ value, onChange, size, count, disabled }) {
  const t = useTranslation();
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div
      className={s.pickerWrap}
      role="radiogroup"
      aria-label={t('product.rating_picker_label')}
      onMouseLeave={() => setHovered(0)}
    >
      {Array.from({ length: count }).map((_, i) => {
        const star = i + 1;
        return (
          <button
            key={star}
            type="button"
            className={`${s.pickBtn} ${star <= active ? s.pickActive : ''}`}
            onClick={() => !disabled && onChange(star)}
            onMouseEnter={() => !disabled && setHovered(star)}
            aria-label={t('product.rating_star_label').replace('{star}', star).replace('{count}', count)}
            aria-pressed={star === value}
            disabled={disabled}
          >
            <StarSvg size={size} />
          </button>
        );
      })}
    </div>
  );
}

/* ── Public component ── */
export default function StarRating({
  value = 0,
  onChange,
  count = 5,
  size = 18,
  disabled = false,
  className = '',
}) {
  const interactive = typeof onChange === 'function';

  return (
    <span className={`${s.root} ${className}`}>
      {interactive ? (
        <StarPicker
          value={value}
          onChange={onChange}
          size={size}
          count={count}
          disabled={disabled}
        />
      ) : (
        <StarDisplay value={value} size={size} count={count} />
      )}
    </span>
  );
}
