import { Monitor } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import s from './AuthBackground.module.css';

/* Static replica of the TechVault storefront — rendered behind the blur overlay.
   No live data, no interactions, purely decorative and aria-hidden from the
   parent auth pages. Visible text is still localized (see useTranslation calls
   below) since it remains on-screen in both languages. */

function StaticPromoBar() {
  const t = useTranslation();
  return (
    <div className={s.promo}>
      <span>🚀 {t('authbg.promo_shipping')}</span>
      <span className={s.promoDivider}>|</span>
      <span>⚡ {t('authbg.promo_deals')}</span>
      <span className={s.promoDivider}>|</span>
      <span>🆕 {t('authbg.promo_new')}</span>
    </div>
  );
}

function StaticNavbar() {
  const t = useTranslation();
  return (
    <div className={s.nav}>
      <div className={s.navInner}>
        {/* Logo */}
        <div className={s.navLogo}>
          <svg width="18" height="20" viewBox="0 0 133 142" fill="none" aria-hidden="true">
            <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
            <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
          </svg>
          <span>Tech<span className={s.navLogoAccent}>Vault</span></span>
        </div>

        {/* Search */}
        <div className={s.navSearch}>
          <input
            className={s.navSearchInput}
            placeholder={t('authbg.search_placeholder')}
            readOnly
            tabIndex={-1}
          />
          <div className={s.navSearchBtn} />
        </div>

        {/* Icon buttons */}
        <div className={s.navIcons}>
          <div className={s.iconBtn} />
          <div className={s.iconBtn} />
          <div className={s.iconBtn} />
          <div className={s.cartBtn} />
        </div>
      </div>
    </div>
  );
}

function StaticCategoryBar() {
  const t = useTranslation();
  const CATS = [
    t('nav.all_products'), t('cat.laptops'), t('cat.smartphones'), t('cat.tablets'),
    t('cat.gaming'), t('cat.monitors'), t('cat.keyboards'), t('cat.mice'), t('cat.headphones'),
    t('cat.speakers'), t('cat.storage'), t('cat.components'), t('cat.networking'), t('cat.accessories'),
  ];
  return (
    <div className={s.catBar}>
      <div className={s.catInner}>
        <div className={`${s.catItem} ${s.catAll}`}>{CATS[0]}</div>
        {CATS.slice(1).map(c => (
          <div key={c} className={s.catItem}>{c}</div>
        ))}
      </div>
    </div>
  );
}

function StaticHero() {
  const t = useTranslation();
  const stats = [
    ['12,000+', t('authbg.stat_products')],
    ['200+', t('authbg.stat_brands')],
    ['4.9★', t('authbg.stat_rating')],
    ['30', t('authbg.stat_day_returns')],
  ];
  return (
    <section className={s.hero}>
      <div className={s.heroBg} aria-hidden="true" />
      <div className={s.heroGlow} aria-hidden="true" />
      <div className={s.heroInner}>

        {/* Left — text */}
        <div className={s.heroLeft}>
          <div className={s.eyebrow}>
            <span className={s.eyebrowDot} aria-hidden="true" />
            <span style={{ color: 'var(--sv-blue)' }}>NEW</span>
            {' ASUS ROG'}
          </div>
          <h1 className={s.heroTitle}>Swift PG27AQDM 27" OLED 240Hz</h1>
          <p className={s.heroDesc}>{t('authbg.hero_desc')}</p>
          <div className={s.priceRow}>
            <span className={s.heroPrice}>₪3,299</span>
            <span className={s.heroOldPrice}>₪4,199</span>
            <span className={s.discBadge}>-22%</span>
          </div>
          <div className={s.heroActions}>
            <div className={s.btnPrimary}>{t('authbg.browse_catalog_btn')}</div>
            <div className={s.btnSecondary}>{t('authbg.deals_btn')}</div>
          </div>
          <div className={s.heroStats}>
            {stats.map(([n, l]) => (
              <div key={l} className={s.stat}>
                <div className={s.statNum}>{n}</div>
                <div className={s.statLabel}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — product card */}
        <div className={s.heroRight}>
          <div className={s.pCard}>
            <div className={s.pImg}>
              <Monitor size={72} strokeWidth={1} className={s.pIcon} />
            </div>
            <div className={s.pBrand}>ASUS ROG</div>
            <div className={s.pName}>Swift PG27AQDM 27" OLED 240Hz</div>
            <div className={s.pPrice}>₪3,299</div>
            <div className={s.pOldPrice}>₪4,199</div>
            <div className={s.pAddBtn}>🛒 {t('authbg.add_to_cart_btn')}</div>
            <div className={s.floatBadge1}><span>⚡</span><span>{t('authbg.badge_fast')}</span></div>
            <div className={s.floatBadge2}><span>🏆</span><span>{t('authbg.badge_bestseller')}</span></div>
          </div>
        </div>

      </div>
    </section>
  );
}

function SkeletonSection({ title, badge }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div className={s.sectionLeft}>
          <span className={s.sectionTitle}>{title}</span>
          {badge && <span className={s.sectionBadge}>{badge}</span>}
        </div>
      </div>
      <div className={s.cardRow}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className={s.skeletonCard}>
            <div className={s.skeletonImg} />
            <div className={s.skeletonLine} style={{ width: '60%' }} />
            <div className={s.skeletonLine} style={{ width: '85%' }} />
            <div className={s.skeletonLine} style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AuthBackground() {
  const t = useTranslation();
  return (
    <div className={s.root}>
      <StaticPromoBar />
      <StaticNavbar />
      <StaticCategoryBar />
      <StaticHero />
      <div className={s.main}>
        <SkeletonSection title={t('authbg.section_bestsellers')} badge="HOT 🔥" />
        <SkeletonSection title={t('authbg.section_recommended')} badge={`★ ${t('authbg.badge_featured')}`} />
      </div>
    </div>
  );
}
