import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, RefreshCw, Star, ThumbsUp, BadgeCheck, AlertTriangle } from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import ProductCard from '../../features/products/components/ProductCard';
import { arrivalLabelText } from '../../features/products/utils/arrivalLabel';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import Button from '../../components/ui/Button/Button';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import { useTranslation } from '../../context/LanguageContext';
import s from './NewArrivalsPage.module.css';

const WEEK_LIMIT        = 3;
const RECOMMENDED_LIMIT = 8;
// "Arrived this week" is a narrower view of the same canonical New window
// (see server NEW_PRODUCT_DAYS) — never a second, independently-defined
// day threshold.
const WEEK_WINDOW_DAYS  = 7;

export default function NewArrivalsPage() {
  const t = useTranslation();
  const navigate = useNavigate();

  const [weekProducts, setWeekProducts]     = useState([]);
  const [recommended, setRecommended]       = useState([]);
  const [newBrands, setNewBrands]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);

  const loadNewArrivals = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      // "Arrived this week" — real newest products within a narrower 7-day
      // sub-window, sorted newest first.
      productService.listNew({ newDays: WEEK_WINDOW_DAYS, sort: 'newest', limit: WEEK_LIMIT }),
      // "New & recommended" — new products ranked by a real signal
      // (salesCount-backed popularity, the same sort Best Sellers uses).
      // No fabricated "isRecommended" field.
      productService.listNew({ sort: 'popularity', limit: RECOMMENDED_LIMIT }),
      productService.getNewBrands(),
    ])
      .then(([weekRes, recRes, brands]) => {
        setWeekProducts(weekRes.products);
        setRecommended(recRes.products);
        setNewBrands(brands);
      })
      .catch((err) => setError(err.message || t('newArrivals.load_error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { loadNewArrivals(); }, [loadNewArrivals]);

  const crumbs = [
    { label: t('newArrivals.breadcrumb_home'), href: '/' },
    { label: t('newArrivals.breadcrumb_current') },
  ];

  if (loading) return <PageSpinner />;

  const hasAnyNew = weekProducts.length > 0 || recommended.length > 0 || newBrands.length > 0;

  return (
    <div className={s.page}>
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Breadcrumb items={crumbs} className={s.breadcrumbNav} />
        </div>
      </div>

      <div className={s.pageInner}>
        <div className={s.hero}>
          <div className={s.heroBadge}><Sparkles size={12} /> {t('newArrivals.hero_badge')}</div>
          <h1 className={s.heroTitle}>
            {t('newArrivals.hero_title')} <span className={s.heroHighlight}>{t('newArrivals.hero_title_highlight')}</span>
          </h1>
          <p className={s.heroSub}>{t('newArrivals.hero_sub')}</p>
          <div className={s.heroTag}><RefreshCw size={12} /> {t('newArrivals.hero_tag')}</div>
        </div>

        {error ? (
          <div className={s.errorState}>
            <AlertTriangle size={32} />
            <p>{error}</p>
            <Button onClick={loadNewArrivals}>{t('wishlist.retry')}</Button>
          </div>
        ) : !hasAnyNew ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><Sparkles size={32} /></div>
            <h3>{t('newArrivals.empty_title')}</h3>
            <p>{t('newArrivals.empty_sub')}</p>
            <Button onClick={() => navigate('/products')}>{t('newArrivals.empty_cta')}</Button>
          </div>
        ) : (
          <>
            {weekProducts.length > 0 && (
              <div className={s.section}>
                <div className={s.sectionTitle}><Star size={20} /> {t('newArrivals.section_week')}</div>
                <p className={s.sectionSub}>{t('newArrivals.section_week_sub')}</p>
                <div className={s.grid}>
                  {weekProducts.map((p) => (
                    <ProductCard key={p._id} product={p} arrivalLabel={arrivalLabelText(p.createdAt, t)} />
                  ))}
                </div>
              </div>
            )}

            {recommended.length > 0 && (
              <div className={s.section}>
                <div className={s.sectionTitle}><ThumbsUp size={20} /> {t('newArrivals.section_recommended')}</div>
                <div className={s.grid}>
                  {recommended.map((p) => (
                    <ProductCard key={p._id} product={p} arrivalLabel={arrivalLabelText(p.createdAt, t)} />
                  ))}
                </div>
              </div>
            )}

            {newBrands.length > 0 && (
              <div className={s.section}>
                <div className={s.sectionTitle}><BadgeCheck size={20} /> {t('newArrivals.section_brands')}</div>
                <div className={s.brands}>
                  {newBrands.map(({ brand }) => (
                    <div key={brand} className={s.brandChip}>
                      <div className={s.brandIcon}><BadgeCheck size={16} /></div>
                      <div className={s.brandName}>{brand}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
