import { useLanguage } from '../../../context/LanguageContext';
import s from './LanguageToggle.module.css';

export default function LanguageToggle({ className = '' }) {
  const { language, setLanguage, t } = useLanguage();
  const next = language === 'he' ? 'en' : 'he';

  return (
    <button
      className={`${s.btn} ${className}`}
      onClick={() => setLanguage(next)}
      aria-label={`${t('lang.toggle')}: ${t(`lang.${next}`)}`}
      title={t(`lang.${next}`)}
      type="button"
    >
      {language === 'he' ? 'EN' : 'HE'}
    </button>
  );
}
