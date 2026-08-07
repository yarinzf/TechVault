import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { productService } from '../../../features/products/api/product.service';
import { getCategoryLabel } from '../../../features/products/utils/categoryLabels';
import { CATEGORY_META, DEFAULT_CATEGORY_ICON, buildCategoryTree } from '../../../constants/categories';
import { useLanguage } from '../../../context/LanguageContext';
import s from './CategoriesModal.module.css';

const TITLE_ID = 'categoriesModalTitle';
const iconFor = (slug) => CATEGORY_META[slug] || DEFAULT_CATEGORY_ICON;

export default function CategoriesModal({ open, onClose }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Real category list — fetched once (categories rarely change mid-session)
  // from the same endpoint the rest of the app already uses. Never a
  // hardcoded/static array.
  const [categories, setCategories] = useState(null); // null = not yet loaded
  const [activeId, setActiveId] = useState(null);

  const modalRef = useRef(null);

  useEffect(() => {
    if (!open || categories) return;
    let alive = true;
    productService.getCategories().then((list) => { if (alive) setCategories(list); });
    return () => { alive = false; };
  }, [open, categories]);

  // Close on Escape — manual dismissal, so focus returns to the trigger button.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open; always restore on close/unmount.
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else       document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on route change (a navigation happened — nothing left to show).
  // Skips focus-return: the user is heading to a new page, not dismissing
  // the dialog to stay put.
  useEffect(() => { onClose({ navigated: true }); }, [location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus into the dialog when it opens, for screen-reader/keyboard users.
  useEffect(() => {
    if (open) modalRef.current?.focus();
  }, [open]);

  // The real main→children tree, built from the flat API response. This is
  // the ONLY hierarchy source — no manually-maintained grouping of unrelated
  // leaf categories. A brand-new main category the backend returns appears
  // automatically; nothing is ever hidden.
  const mains = useMemo(() => buildCategoryTree(categories || []), [categories]);

  // Default active main on open: the URL's current category (main OR one of
  // its children) if it's represented in the modal, otherwise the first
  // main. Re-evaluated every time the modal opens, and once when the real
  // category data finishes loading.
  useEffect(() => {
    if (!open || mains.length === 0) return;
    const urlSlug = location.pathname.startsWith('/category/')
      ? decodeURIComponent(location.pathname.split('/category/')[1] || '')
      : null;
    const matchByUrl = urlSlug && mains.find((m) => m.slug === urlSlug || m.children.some((ch) => ch.slug === urlSlug));
    setActiveId((matchByUrl ?? mains[0])._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mains.length]);

  if (!open) return null;

  const goTo = (slug) => {
    onClose({ navigated: true });
    navigate(`/category/${slug}`);
  };

  const activeMain = mains.find((m) => m._id === activeId) ?? mains[0] ?? null;
  const DirArrow = language === 'en' ? ChevronRight : ChevronLeft;

  return (
    <div
      className={`${s.overlay} ${open ? s.open : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={s.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={modalRef}
        tabIndex={-1}
      >
        {/* Top gradient line (Sapir's ::before) */}
        <div className={s.topLine} aria-hidden="true" />

        {/* Header */}
        <div className={s.header}>
          <div className={s.title} id={TITLE_ID}>
            <LayoutGrid size={20} aria-hidden="true" />
            {t('nav.all_categories')}
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label={t('btn.close')}>
            <X size={16} />
          </button>
        </div>

        {/* Two-column body — right: main categories, left: sub-panel (RTL-native via flex + dir) */}
        {categories && categories.length === 0 ? (
          <div className={s.cmmEmpty}>{t('modal.no_categories')}</div>
        ) : (
        <div className={s.cmmBody}>
          <nav className={s.cmmMainList} aria-label={t('nav.all_categories')}>
            {mains.map((main) => {
              const Icon = iconFor(main.slug);
              const isActive = main._id === activeMain?._id;
              const isLeaf = main.children.length === 0;
              return (
                <button
                  key={main._id}
                  type="button"
                  className={`${s.cmmMainItem} ${isActive ? s.cmmMainItemActive : ''}`}
                  onMouseEnter={() => setActiveId(main._id)}
                  onClick={() => (isLeaf ? goTo(main.slug) : setActiveId(main._id))}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{getCategoryLabel(main, language)}</span>
                  {/* Leaf category = this row IS the destination (click navigates
                      directly) — no chevron, since there's no secondary panel to
                      imply. Parent categories keep the panel-reveal chevron. */}
                  {!isLeaf && <DirArrow size={14} className={s.cmmMainItemArrow} aria-hidden="true" />}
                </button>
              );
            })}
          </nav>

          <div className={s.cmmSubPanel}>
            {!categories ? (
              <div className={s.cmmLoading} aria-hidden="true">…</div>
            ) : activeMain && activeMain.children.length === 0 ? (
              // Direct main category (e.g. Monitors, Smartphones) — no real
              // subcategories. Never fabricate child entries; show a single
              // focused "view all" card for the main category itself.
              (() => {
                const Icon = iconFor(activeMain.slug);
                return (
                  <div className={s.cmmSingleWrap}>
                    <button
                      type="button"
                      className={s.cmmSingleCard}
                      onClick={() => goTo(activeMain.slug)}
                    >
                      <span className={s.cmmSingleIcon}><Icon size={22} aria-hidden="true" /></span>
                      <span className={s.cmmSingleText}>
                        <span className={s.cmmSingleName}>{getCategoryLabel(activeMain, language)}</span>
                        <span className={s.cmmSingleAction}>{t('modal.view_all_products')}</span>
                      </span>
                      <DirArrow size={16} className={s.cmmSingleArrow} aria-hidden="true" />
                    </button>
                  </div>
                );
              })()
            ) : activeMain ? (
              <>
                <div className={s.cmmSubTitle}>
                  {(() => { const MainIcon = iconFor(activeMain.slug); return <MainIcon size={15} aria-hidden="true" />; })()}
                  {getCategoryLabel(activeMain, language)}
                </div>
                <div className={s.cmmSubList}>
                  {activeMain.children.map((cat) => {
                    const Icon = iconFor(cat.slug);
                    return (
                      <button
                        key={cat._id}
                        type="button"
                        className={s.cmmSubLink}
                        onClick={() => goTo(cat.slug)}
                      >
                        <span className={s.cmmSubLinkName}>
                          <Icon size={16} className={s.cmmSubLinkIcon} aria-hidden="true" />
                          {getCategoryLabel(cat, language)}
                        </span>
                        <DirArrow size={13} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
