import s from './Badge.module.css';

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`${s.badge} ${s[variant]} ${className}`}>
      {children}
    </span>
  );
}

// Convenience: map order/alert status to badge variant
export const statusVariant = (status) => ({
  pending_payment: 'warning',
  pending:         'warning',
  confirmed:       'info',
  processing: 'info',
  shipped:    'primary',
  delivered:  'success',
  cancelled:  'error',
  refunded:   'error',
  paid:       'success',
  unpaid:     'warning',
  // alert severities
  critical:   'error',
  warning:    'warning',
  info:       'default',
}[status] ?? 'default');
