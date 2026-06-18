import s from './ProgressBar.module.css';

export default function ProgressBar({
  value = 0,
  color = 'primary',
  height = 6,
  label,
  className = '',
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={`${s.wrap} ${className}`}>
      {label && <span className={s.label}>{label}</span>}
      <div className={s.track} style={{ height }}>
        <div
          className={`${s.fill} ${s[color] || s.primary}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
