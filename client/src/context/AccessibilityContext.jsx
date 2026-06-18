import { createContext, useContext, useEffect, useState } from 'react';

const AccessibilityContext = createContext(null);
const STORAGE_KEY = 'techvault_a11y';

const FONT_STEP = 2;
const MAX_SCALE = 4;

export const A11Y_DEFAULTS = {
  fontScale: 0,
  highContrast: false,
  grayscale: false,
  underlineLinks: false,
  reduceMotion: false,
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...A11Y_DEFAULTS, ...saved } : { ...A11Y_DEFAULTS };
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

function applyToDOM(s) {
  const el = document.documentElement;
  el.style.fontSize = `${16 + s.fontScale * FONT_STEP}px`;
  el.classList.toggle('a11y-high-contrast', s.highContrast);
  el.classList.toggle('a11y-grayscale', s.grayscale);
  el.classList.toggle('a11y-underline-links', s.underlineLinks);
  el.classList.toggle('a11y-reduce-motion', s.reduceMotion);
}

export function AccessibilityProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    applyToDOM(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = (key, value) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const increaseFontSize = () =>
    setSettings(prev => ({
      ...prev,
      fontScale: Math.min(prev.fontScale + 1, MAX_SCALE),
    }));

  const decreaseFontSize = () =>
    setSettings(prev => ({
      ...prev,
      fontScale: Math.max(prev.fontScale - 1, 0),
    }));

  const reset = () => setSettings({ ...A11Y_DEFAULTS });

  return (
    <AccessibilityContext.Provider
      value={{ settings, update, increaseFontSize, decreaseFontSize, reset, FONT_STEP }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used inside AccessibilityProvider');
  return ctx;
}
