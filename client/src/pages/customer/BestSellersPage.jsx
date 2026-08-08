import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, RefreshCw, Crown, AlertTriangle } from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import ProductCard from '../../features/products/components/ProductCard';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import Button from '../../components/ui/Button/Button';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import { useTranslation } from '../../context/LanguageContext';
import s from './BestSellersPage.module.css';

const TOP_LIMIT = 5;

// Deterministic context badge — never a subjective/random label. Rank #1
// always wins the slot (Sapir's own reference always tags its rank-1 demo
// item this way); a lower-ranked category leader is flagged only when it
// is genuinely the #1 real seller within its own category (isCategoryLeader
// is computed server-side against the FULL real sales ranking, not just
// this page's top 5 — see recommendation.service.js#getBestSellers).
function contextBadgeFor(product, t) {
  if (product.rank === 1) return t('product.badge_top_seller');
  if (product.isCategoryLeader) return t('product.badge_category_leader');
  return null;
}

export default function BestSellersPage() {
  const t = useTranslation();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const loadBestSellers = useCallback(() => {
    setLoading(true);
    setError(null);
    productService.getBestSellers(TOP_LIMIT)
      .then(setProducts)
      .catch((err) => setError(err.message || t('bestsellers.page.empty_sub')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { loadBestSellers(); }, [loadBestSellers]);

  const crumbs = [
    { label: t('newArrivals.breadcrumb_home'), href: '/' },
    { label: t('bestsellers.page.breadcrumb') },
  ];

  if (loading) return <PageSpinner />;

  return (
    <div className={s.page}>
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Breadcrumb items={crumbs} className={s.breadcrumbNav} />
        </div>
      </div>

      <div className={s.hero}>
        <div className={s.heroBadge}><Trophy size={12} /> {t('bestsellers.page.hero_badge')}</div>
        <h1 className={s.heroTitle}>
          {t('bestsellers.page.hero_title_base')} <span>{t('bestsellers.page.hero_title_em')}</span>
        </h1>
        <p className={s.heroSub}>{t('bestsellers.page.hero_sub')}</p>
        <div className={s.heroTag}><RefreshCw size={12} /> {t('bestsellers.page.hero_tag')}</div>
      </div>

      <div className={s.pageInner}>
        {error ? (
          <div className={s.errorState}>
            <AlertTriangle size={32} />
            <p>{error}</p>
            <Button onClick={loadBestSellers}>{t('wishlist.retry')}</Button>
          </div>
        ) : products.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><Trophy size={32} /></div>
            <h3>{t('bestsellers.page.empty_title')}</h3>
            <p>{t('bestsellers.page.empty_sub')}</p>
            <Button onClick={() => navigate('/products')}>{t('newArrivals.empty_cta')}</Button>
          </div>
        ) : (
          <div className={s.section}>
            <div className={s.sectionTitle}><Crown size={20} /> {t('bestsellers.page.section_title')}</div>
            <p className={s.sectionSub}>{t('bestsellers.page.section_sub')}</p>
            <div className={s.grid}>
              {products.map((p) => (
                <ProductCard
                  key={p._id}
                  product={p}
                  rank={p.rank}
                  rankLabel
                  showViewButton
                  salesCount={p.unitsSold}
                  contextBadge={contextBadgeFor(p, t)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
