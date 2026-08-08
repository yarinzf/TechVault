import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';
import CategoriesModal from './CategoriesModal';
import s from './CategoryNavBar.module.css';

/* Sapir's content-oriented nav row: real filtered/sorted product views for
   deals, new arrivals, bestsellers, and — now that /club is a real
   dedicated page — the club item too. Markers are the reference's own
   emoji (not SVG icons) for these four items only — "All Categories" keeps
   its real SVG grid icon. */
const NAV_ITEMS = [
  { key: 'nav.deals',        emoji: '🔥', to: '/deals' },
  { key: 'nav.new_arrivals', emoji: '🆕', to: '/new' },
  { key: 'nav.bestsellers',  emoji: '🏆', to: '/best-sellers' },
  { key: 'nav.club',         emoji: '⭐', to: '/club' },
];

export default function CategoryNavBar() {
  const t = useTranslation();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const allCategoriesBtnRef = useRef(null);

  // Manual dismissal (Escape / X / outside click) returns focus to the
  // trigger button — standard dialog-close behavior. A close caused by
  // navigating somewhere (clicking a category) skips that: focus should
  // land on the destination page, not jump back to a button the user just
  // navigated away from.
  const closeModal = ({ navigated = false } = {}) => {
    setModalOpen(false);
    if (!navigated) allCategoriesBtnRef.current?.focus();
  };

  return (
    <>
      <nav className={s.bar} aria-label={t('nav.categories_arialabel')}>
        <div className={s.inner}>

          {/* "All categories" — opens the real category modal */}
          <button
            type="button"
            ref={allCategoriesBtnRef}
            className={s.catNavAll}
            onClick={() => setModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={modalOpen}
          >
            <LayoutGrid size={14} aria-hidden="true" />
            {t('nav.all_categories')}
          </button>

          {/* Divider */}
          <div className={s.divider} aria-hidden="true" />

          {/* Content-oriented row (Sapir: deals / new / bestsellers / club) */}
          {NAV_ITEMS.map(({ key, emoji, to }) => (
            <Link
              key={key}
              to={to}
              className={`${s.item}${location.pathname === to ? ' ' + s.active : ''}`}
              aria-current={location.pathname === to ? 'page' : undefined}
            >
              <span className={s.itemEmoji} aria-hidden="true">{emoji}</span>
              {t(key)}
            </Link>
          ))}

        </div>
      </nav>

      <CategoriesModal open={modalOpen} onClose={closeModal} />
    </>
  );
}
