import s from './Spinner.module.css';

export default function Spinner({ size = 'md', className = '' }) {
  return <span className={`${s.spinner} ${s[size]} ${className}`} aria-label="Loading" />;
}

export function PageSpinner() {
  return (
    <div className={s.page}>
      <Spinner size="lg" />
    </div>
  );
}
