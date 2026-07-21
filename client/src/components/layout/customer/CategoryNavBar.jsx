import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { NAV_CATEGORIES } from '../../../constants/categories';
import { useLanguage, useTranslation } from '../../../context/LanguageContext';
import CategoriesModal from './CategoriesModal';
import s from './CategoryNavBar.module.css';

export default function CategoryNavBar() {
  const t = useTranslation();
  const { language } = useLanguage();
  const location = useLocation();
  const { categorySlug } = useParams();
  const [modalOpen, setModalOpen] = useState(false);
  const allBtnRef = useRef(null);

  const searchParams = new URLSearchParams(location.search);
  const activeSlug   = categorySlug || searchParams.get('category');

  // At narrow viewports the row's natural (unscrolled) scroll position does
  // not land on the "all categories" control in RTL — the browser's default
  // scrollLeft=0 rest state can leave it scrolled just past the visible edge
  // when content overflows by more than the viewport can show at once.
  // scrollIntoView is direction-aware per spec, so use it to guarantee the
  // control is actually visible on mount and on language switch.
  useEffect(() => {
    allBtnRef.current?.scrollIntoView({ inline: 'start', block: 'nearest' });
  }, [language]);

  return (
    <>
      <nav className={s.bar} aria-label={t('nav.categories_arialabel')}>
        <div className={s.inner}>

          {/* "All categories" — opens modal */}
          <button
            ref={allBtnRef}
            type="button"
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

          {/* Primary category links */}
          {NAV_CATEGORIES.map(cat => (
            <Link
              key={cat.slug}
              to={`/category/${cat.slug}`}
              className={`${s.item} ${activeSlug === cat.slug ? s.active : ''}`}
            >
              {t(cat.labelKey)}
            </Link>
          ))}

        </div>
      </nav>

      <CategoriesModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
