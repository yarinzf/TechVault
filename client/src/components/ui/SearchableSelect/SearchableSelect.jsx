import { useState, useRef, useId, useCallback, useEffect } from 'react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './SearchableSelect.module.css';

function normalize(options) {
  if (!options?.length) return [];
  return typeof options[0] === 'string'
    ? options.map(o => ({ value: o, label: o }))
    : options;
}

export default function SearchableSelect({
  id,
  options = [],
  value = '',
  onChange,
  placeholder = null,
  loading = false,
  disabled = false,
  error = false,
  ok = false,
  describedBy,
  emptyText = null,
  // Plain (non-CSS-module) class applied to every part of the component
  // (control input, dropdown list, options) so a consuming page can style
  // this instance from its own stylesheet via :global(...) — CSS-module
  // class names are hashed per-file at build time and can't be targeted
  // reliably from outside, so this is the supported styling hook instead.
  variant = null,
}) {
  const uid       = useId();
  const listId    = `${uid}-list`;
  const inputId   = id ?? `${uid}-input`;
  const t = useTranslation();

  const resolvedPlaceholder = placeholder ?? t('select.placeholder');
  const resolvedEmptyText   = emptyText   ?? t('select.empty');

  const [open,     setOpen]     = useState(false);
  const [query,    setQuery]    = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);

  const containerRef = useRef(null);
  const inputRef     = useRef(null);
  const listRef      = useRef(null);

  const normalized = normalize(options);
  const currentLabel = normalized.find(o => o.value === value)?.label ?? '';

  const filtered = query.trim()
    ? normalized.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.value.toLowerCase().includes(query.toLowerCase())
      )
    : normalized;

  const visible = filtered;

  const openList = useCallback(() => {
    if (disabled || loading) return;
    setOpen(true);
    setQuery('');
    setActiveIdx(-1);
  }, [disabled, loading]);

  const closeList = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
  }, []);

  const selectOption = useCallback((opt) => {
    onChange?.(opt.value);
    closeList();
  }, [onChange, closeList]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeList();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeList]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, visible.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIdx >= 0 && visible[activeIdx]) selectOption(visible[activeIdx]);
        break;
      case 'Escape':
        e.preventDefault();
        closeList();
        inputRef.current?.blur();
        break;
      case 'Tab':
        closeList();
        break;
    }
  };

  const variantCls = variant ? `sv-select--${variant}` : '';

  const inputCls = [
    s.input,
    error   ? s.inputError   : '',
    ok      ? s.inputOk      : '',
    open    ? s.inputOpen     : '',
    disabled || loading ? s.inputDisabled : '',
    variantCls,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={[s.wrap, variantCls].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
    >
      <div className={s.control} onClick={() => open ? closeList() : openList()}>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-activedescendant={activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={error || undefined}
          data-ok={ok || undefined}
          autoComplete="off"
          readOnly={!open}
          value={open ? query : currentLabel}
          placeholder={open ? t('select.type_to_filter') : resolvedPlaceholder}
          disabled={disabled || loading}
          className={inputCls}
          onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
          onFocus={() => { if (!open) openList(); }}
          onClick={e => e.stopPropagation()}
        />
        <span className={s.chevron} aria-hidden="true">
          {loading ? '⟳' : open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={[s.list, variantCls].filter(Boolean).join(' ')}
        >
          {visible.length === 0 ? (
            <li className={s.empty}>{resolvedEmptyText}</li>
          ) : (
            <>
              {visible.map((opt, i) => (
                <li
                  key={opt.value}
                  id={`${listId}-opt-${i}`}
                  data-idx={i}
                  data-active={i === activeIdx || undefined}
                  role="option"
                  aria-selected={opt.value === value}
                  className={[
                    s.option,
                    opt.value === value ? s.optionSelected : '',
                    i === activeIdx    ? s.optionActive   : '',
                    variantCls,
                  ].filter(Boolean).join(' ')}
                  onMouseDown={e => { e.preventDefault(); selectOption(opt); }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  {opt.label}
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
