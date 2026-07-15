import { Minus, Plus } from 'lucide-react';
import s from './QuantitySelector.module.css';

/**
 * Shared stepper control, extracted from the duplicated qty markup that used
 * to live separately in ProductDetailsPage and CartDrawer.
 */
export default function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = Infinity,
  disabled = false,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
  className = '',
}) {
  return (
    <div className={`${s.ctrl} ${className}`}>
      <button
        type="button"
        className={s.btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
      >
        <Minus size={14} />
      </button>
      <span className={s.val}>{value}</span>
      <button
        type="button"
        className={s.btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={increaseLabel}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
