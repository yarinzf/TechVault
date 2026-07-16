import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { NAV_CATEGORIES } from '../../../constants/categories';
import { useTranslation } from '../../../context/LanguageContext';
import CategoriesModal from './CategoriesModal';
import s from './CategoryNavBar.module.css';

export default function CategoryNavBar() {
  const t = useTranslation();
  const location = useLocation();
  const { categorySlug } = useParams();
  const [modalOpen, setModalOpen] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const activeSlug   = categorySlug || searchParams.get('category');

  return (
    <>
      <nav className={s.bar} aria-label={t('nav.categories_arialabel')}>
        <div className={s.inner}>

          {/* "All categories" — opens modal */}
          <button
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
