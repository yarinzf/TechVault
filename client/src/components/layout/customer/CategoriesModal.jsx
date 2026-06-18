import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, X } from 'lucide-react';
import { MODAL_SECTIONS } from '../../../constants/categories';
import s from './CategoriesModal.module.css';

export default function CategoriesModal({ open, onClose }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else       document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on route change
  useEffect(() => { onClose(); }, [location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const goTo = (slug) => {
    onClose();
    navigate(`/category/${slug}`);
  };

  const activeSlug = location.pathname.startsWith('/category/')
    ? location.pathname.split('/category/')[1]
    : null;

  return (
    <div
      className={`${s.overlay} ${open ? s.open : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-label="כל הקטגוריות"
    >
      <div className={s.modal}>
        {/* Top gradient line (Sapir's ::before) */}
        <div className={s.topLine} aria-hidden="true" />

        {/* Header */}
        <div className={s.header}>
          <div className={s.title}>
            <LayoutGrid size={20} aria-hidden="true" />
            כל הקטגוריות
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="סגור">
            <X size={16} />
          </button>
        </div>

        {/* Sections */}
        {MODAL_SECTIONS.map((section) => (
          <div key={section.title} className={s.section}>
            <div className={s.sectionTitle}>{section.title}</div>
            <div className={s.grid}>
              {section.items.map((item, i) => {
                const Icon    = item.Icon;
                const isActive = activeSlug === item.slug;
                return (
                  <button
                    key={i}
                    className={`${s.item} ${isActive ? s.itemActive : ''}`}
                    onClick={() => goTo(item.slug)}
                  >
                    <div className={`${s.iconWrap} ${isActive ? s.iconWrapActive : ''}`}>
                      <Icon size={18} strokeWidth={1.7} />
                    </div>
                    <div className={s.info}>
                      <div className={`${s.name} ${isActive ? s.nameActive : ''}`}>
                        {item.heLabel}
                      </div>
                    </div>
                    {isActive && (
                      <span className={s.activeArrow} aria-hidden="true">←</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
