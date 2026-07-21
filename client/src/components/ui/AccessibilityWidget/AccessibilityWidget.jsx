import { useRef, useEffect } from 'react';
import { Accessibility, X, Plus, Minus, RotateCcw, Type } from 'lucide-react';
import { useAccessibility } from '../../../context/AccessibilityContext';
import { useLanguage } from '../../../context/LanguageContext';
import s from './AccessibilityWidget.module.css';

const TOGGLES = [
  { key: 'highContrast',   labelKey: 'a11y.high_contrast'   },
  { key: 'grayscale',      labelKey: 'a11y.grayscale'       },
  { key: 'underlineLinks', labelKey: 'a11y.underline_links' },
  { key: 'reduceMotion',   labelKey: 'a11y.reduce_motion'   },
];

export default function AccessibilityWidget() {
  const { settings, update, increaseFontSize, decreaseFontSize, reset, FONT_STEP, isOpen: open, toggle, close } =
    useAccessibility();
  const { t } = useLanguage();
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        panelRef.current   && !panelRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  const fontPx = 16 + settings.fontScale * FONT_STEP;

  return (
    <div className={s.root}>
      <button
        ref={triggerRef}
        className={s.trigger}
        onClick={toggle}
        aria-label={open ? t('a11y.close') : t('a11y.open')}
        aria-expanded={open}
        aria-controls="a11y-panel"
        type="button"
      >
        <Accessibility size={21} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id="a11y-panel"
          className={s.panel}
          role="dialog"
          aria-label={t('a11y.title')}
          aria-modal="false"
        >
          {/* Header */}
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>{t('a11y.title')}</span>
            <button
              className={s.closeBtn}
              onClick={close}
              aria-label={t('a11y.close')}
              type="button"
            >
              <X size={14} />
            </button>
          </div>

          {/* Font size */}
          <div className={s.row}>
            <div className={s.rowLabel}>
              <Type size={14} aria-hidden="true" />
              <span>{t('a11y.font_size')}</span>
            </div>
            <div className={s.fontControls}>
              <button
                className={s.stepBtn}
                onClick={decreaseFontSize}
                disabled={settings.fontScale === 0}
                aria-label={t('a11y.decrease_font')}
                type="button"
              >
                <Minus size={12} />
              </button>
              <span className={s.fontPx} aria-live="polite">{fontPx}px</span>
              <button
                className={s.stepBtn}
                onClick={increaseFontSize}
                disabled={settings.fontScale >= 4}
                aria-label={t('a11y.increase_font')}
                type="button"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Toggle rows */}
          {TOGGLES.map(({ key, labelKey }) => (
            <div key={key} className={s.row}>
              <span className={s.rowLabel}>{t(labelKey)}</span>
              <button
                role="switch"
                aria-checked={settings[key]}
                className={`${s.toggleTrack} ${settings[key] ? s.on : ''}`}
                onClick={() => update(key, !settings[key])}
                type="button"
              >
                <span className={s.toggleThumb} />
                <span className="sr-only">{t(labelKey)}</span>
              </button>
            </div>
          ))}

          {/* Reset */}
          <button className={s.resetBtn} onClick={reset} type="button">
            <RotateCcw size={12} aria-hidden="true" />
            {t('a11y.reset')}
          </button>
        </div>
      )}
    </div>
  );
}
