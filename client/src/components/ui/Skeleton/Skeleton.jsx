import s from './Skeleton.module.css';

export default function Skeleton({
  width,
  height,
  radius,
  count = 1,
  circle = false,
  className = '',
}) {
  const style = {
    width:        circle ? height || width || '40px' : (width  || '100%'),
    height:       height || (circle ? width || '40px' : '1em'),
    borderRadius: circle ? '50%' : (radius || undefined),
    flexShrink:   0,
  };

  if (count === 1) {
    return <div className={`skeleton ${s.item} ${className}`} style={style} />;
  }

  return (
    <div className={`${s.group} ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton ${s.item}`} style={style} />
      ))}
    </div>
  );
}

/* ── Preset: card skeleton ── */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`${s.card} ${className}`}>
      <Skeleton height="180px" radius="var(--radius-md) var(--radius-md) 0 0" />
      <div className={s.cardBody}>
        <Skeleton height="10px" width="40%" />
        <Skeleton height="14px" />
        <Skeleton height="12px" width="60%" />
        <div className={s.cardFooter}>
          <Skeleton height="18px" width="80px" />
          <Skeleton height="32px" width="32px" radius="var(--radius-md)" />
        </div>
      </div>
    </div>
  );
}

/* ── Preset: text skeleton ── */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`${s.text} ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="12px"
          width={i === lines - 1 ? '65%' : '100%'}
        />
      ))}
    </div>
  );
}
