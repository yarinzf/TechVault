import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';
import s from './ThemeToggle.module.css';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === 'dark';

  return (
    <button
      className={`${s.btn} ${className}`}
      onClick={toggle}
      aria-label={isDark ? t('theme.light') : t('theme.dark')}
      title={isDark ? t('theme.light') : t('theme.dark')}
      type="button"
    >
      {isDark
        ? <Sun  size={17} aria-hidden="true" />
        : <Moon size={17} aria-hidden="true" />
      }
    </button>
  );
}
