import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './Modal.module.css';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
}) {
  const contentRef = useRef(null);
  const t = useTranslation();

  /* Escape to close */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  /* Body scroll lock */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  /* Focus the content panel when opened */
  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => contentRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={s.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={`${s.content} ${s[size]} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className={s.header}>
            <h2 className={s.title}>{title}</h2>
            <button
              className={s.closeBtn}
              onClick={onClose}
              aria-label={t('btn.close')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className={s.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
