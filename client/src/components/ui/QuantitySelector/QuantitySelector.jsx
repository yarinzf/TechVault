import { Minus, Plus } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';
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
  decreaseLabel,
  increaseLabel,
  className = '',
}) {
  const t = useTranslation();
  const decLabel = decreaseLabel ?? t('product.decrease_qty');
  const incLabel = increaseLabel ?? t('product.increase_qty');
  return (
    <div className={`${s.ctrl} ${className}`}>
      <button
        type="button"
        className={s.btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={decLabel}
      >
        <Minus size={12} />
      </button>
      <span className={s.val}>{value}</span>
      <button
        type="button"
        className={s.btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={incLabel}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
