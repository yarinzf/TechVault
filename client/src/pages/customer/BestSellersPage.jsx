import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, RefreshCw, Crown, CalendarDays, AlertTriangle } from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import ProductCard from '../../features/products/components/ProductCard';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import Button from '../../components/ui/Button/Button';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import { useTranslation, useLanguage } from '../../context/LanguageContext';
import s from './BestSellersPage.module.css';

const TOP_LIMIT = 4;

// Real localized month name via Intl — never a duplicated hardcoded HE/EN
// month-name list to keep in sync.
function currentMonthName(language) {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date());
}

// Deterministic context badge — never a subjective/random label. Rank #1
// always wins the slot, but the WORDING must be truthful to which ranking
// produced it — "top seller this month" only makes sense in the monthly
// section; the overall section (lifetime-to-date) gets its own honest
// "top seller" wording instead. A lower-ranked category leader is flagged
// only when the backend confirms it's genuinely #1 in its own category FOR
// THAT SAME PERIOD (isCategoryLeader is computed per-period server-side —
// see recommendation.service.js#getBestSellers).
function contextBadgeFor(product, period, t) {
  if (product.rank === 1) {
    return period === 'month' ? t('product.badge_top_seller') : t('product.badge_top_seller_overall');
  }
  if (product.isCategoryLeader) return t('product.badge_category_leader');
  return null;
}

function salesLineFor(product, period, t) {
  const key = period === 'month' ? 'product.units_sold_label_month' : 'product.units_sold_label';
  return t(key).replace('{count}', product.unitsSold.toLocaleString());
}

function RankGrid({ products, period, t }) {
  return (
    <div className={s.grid}>
      {products.map((p) => (
        <ProductCard
          key={p._id}
          product={p}
          rank={p.rank}
          rankLabel
          showViewButton
          salesCount={p.unitsSold}
          salesCountLabel={salesLineFor(p, period, t)}
          contextBadge={contextBadgeFor(p, period, t)}
        />
      ))}
    </div>
  );
}

export default function BestSellersPage() {
  const t = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [overall, setOverall] = useState([]);
  const [month, setMonth]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const loadBestSellers = useCallback(() => {
    setLoading(true);
    setError(null);
    // Two independent rankings, fetched together — never a duplicate call
    // for the same period, and neither section blocks on the other since
    // both requests fire in parallel.
    Promise.all([
      productService.getBestSellersRanking({ period: 'overall', limit: TOP_LIMIT }),
      productService.getBestSellersRanking({ period: 'month',   limit: TOP_LIMIT }),
    ])
      .then(([overallRes, monthRes]) => {
        setOverall(overallRes.products);
        setMonth(monthRes.products);
      })
      .catch((err) => setError(err.message || t('bestsellers.page.empty_sub')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { loadBestSellers(); }, [loadBestSellers]);

  const crumbs = [
    { label: t('newArrivals.breadcrumb_home'), href: '/' },
    { label: t('bestsellers.page.breadcrumb') },
  ];

  if (loading) return <PageSpinner />;

  const hasAnyData = overall.length > 0 || month.length > 0;
  const monthSubtitle = t('bestsellers.page.section2_sub').replace('{month}', currentMonthName(language));

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
        ) : !hasAnyData ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><Trophy size={32} /></div>
            <h3>{t('bestsellers.page.empty_title')}</h3>
            <p>{t('bestsellers.page.empty_sub')}</p>
            <Button onClick={() => navigate('/products')}>{t('newArrivals.empty_cta')}</Button>
          </div>
        ) : (
          <>
            {overall.length > 0 && (
              <div className={s.section}>
                <div className={s.sectionTitle}><Crown size={20} /> {t('bestsellers.page.section1_title')}</div>
                <p className={s.sectionSub}>{t('bestsellers.page.section1_sub')}</p>
                <RankGrid products={overall} period="overall" t={t} />
              </div>
            )}

            {/* Monthly section is omitted entirely (not an empty grid) when
                the current month has no real qualifying sales yet — the
                overall section above still renders on its own. */}
            {month.length > 0 && (
              <div className={s.section}>
                <div className={s.sectionTitle}><CalendarDays size={20} /> {t('bestsellers.page.section2_title')}</div>
                <p className={s.sectionSub}>{monthSubtitle}</p>
                <RankGrid products={month} period="month" t={t} />
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
