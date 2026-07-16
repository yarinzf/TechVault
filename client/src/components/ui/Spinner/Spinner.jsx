import { useTranslation } from '../../../context/LanguageContext';
import s from './Spinner.module.css';

export default function Spinner({ size = 'md', className = '' }) {
  const t = useTranslation();
  return <span className={`${s.spinner} ${s[size]} ${className}`} aria-label={t('product.loading')} />;
}

export function PageSpinner() {
  return (
    <div className={s.page}>
      <Spinner size="lg" />
    </div>
  );
}
