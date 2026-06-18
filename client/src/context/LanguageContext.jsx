import { createContext, useContext, useEffect, useState } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'techvault_lang';

const LANG_META = {
  he: { dir: 'rtl', nativeName: 'עברית' },
  en: { dir: 'ltr', nativeName: 'English' },
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'he'
  );

  useEffect(() => {
    const meta = LANG_META[language] ?? LANG_META.he;
    document.documentElement.lang = language;
    document.documentElement.dir = meta.dir;
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const t = (key) =>
    translations[language]?.[key] ?? translations.he?.[key] ?? key;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, LANG_META }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

export function useTranslation() {
  return useLanguage().t;
}
