import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Monitor, ShoppingCart,
  Truck, RotateCcw, ShieldCheck, Headphones,
  Zap, ArrowLeft, Star, UserPlus,
  ChevronLeft,
  Percent, Gift, Headset,
  LayoutGrid, Eye, Award, ImageOff,
} from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useTranslation } from '../../context/LanguageContext';
import ProductCard from '../../features/products/components/ProductCard';
import Footer from '../../components/layout/customer/Footer';
import { BRANDS } from '../../constants/brands';
import { CATEGORY_META } from '../../constants/categories';
import { HOMEPAGE_REVIEWS } from '../../constants/reviews';
import s from './HomePage.module.css';

/* ── Static data ──────────────────────────────────────────────────────────── */
const POLICY_ITEMS = [
  { Icon: Truck,       title: 'משלוח חינם',      desc: 'על כל הזמנה מעל ₪299\nעד 48 שעות לכל הארץ'  },
  { Icon: RotateCcw,   title: 'החזרה ב-30 ימים',  desc: 'לא מרוצים? מחזירים\nללא שאלות, החזר מלא'  },
  { Icon: ShieldCheck, title: 'אחריות יצרן',       desc: 'אחריות מלאה על כל המוצרים\nשירות מהיצרן'    },
  { Icon: Headphones,  title: 'תמיכה 24/7',        desc: "צוות מומחים זמין תמיד\nצ'אט, טלפון ואימייל" },
];

const CLUB_STATS = [
  { num: '50K',  accent: '+',  lbl: 'חברים פעילים' },
  { num: '₪150', accent: '',   lbl: 'חיסכון ממוצע' },
  { num: '4.9',  accent: '★',  lbl: 'שביעות רצון'  },
  { num: '24',   accent: '/7', lbl: 'תמיכה VIP'    },
];

/* ── Deal countdown ───────────────────────────────────────────────────────── */
function DealCountdown() {
  const [secs, setSecs] = useState(() => {
    const now = new Date();
    const end = new Date(now);
    const toSat = (6 - now.getDay() + 7) % 7 || 7;
    end.setDate(now.getDate() + toSat);
    end.setHours(23, 59, 59, 999);
    return Math.max(0, Math.floor((end - now) / 1000));
  });

  useEffect(() => {
    const id = setInterval(() => setSecs(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const d  = String(Math.floor(secs / 86400)).padStart(2, '0');
  const h  = String(Math.floor((secs % 86400) / 3600)).padStart(2, '0');
  const m  = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const sc = String(secs % 60).padStart(2, '0');

  return (
    <div className={s.countdown} dir="ltr">
      <div className={s.cblock}><span className={s.cnum}>{d}</span><div className={s.clbl}>ימים</div></div>
      <span className={s.csep}>:</span>
      <div className={s.cblock}><span className={s.cnum}>{h}</span><div className={s.clbl}>שעות</div></div>
      <span className={s.csep}>:</span>
      <div className={s.cblock}><span className={s.cnum}>{m}</span><div className={s.clbl}>דקות</div></div>
      <span className={s.csep}>:</span>
      <div className={s.cblock}><span className={s.cnum}>{sc}</span><div className={s.clbl}>שניות</div></div>
    </div>
  );
}

/* ── DealBanner (strip only) ──────────────────────────────────────────────── */
function DealBanner() {
  const navigate = useNavigate();
  return (
    <div className={s.dealStrip}>
      <div className={s.dealStripInner}>
        <span className={s.dealBadge}><Zap size={12} /> פלאש סייל</span>
        <div className={s.dealText}>
          <div className={s.dealTitle}>מבצע השבוע — ציוד גיימינג עד 30% הנחה</div>
          <div className={s.dealSub}>RTX 4090, RX 7900 XTX, ועוד · מלאי מוגבל</div>
        </div>
        <DealCountdown />
        <button className={s.dealCta} onClick={() => navigate('/products?onSale=true')}>
          <ArrowLeft size={15} /> ראו המבצעים
        </button>
      </div>
    </div>
  );
}

/* ── ProductSection ───────────────────────────────────────────────────────── */
function ProductSection({ titleBase, titleEm, badge, products, loading, error, viewAllHref, showRanks }) {
  if (loading) return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>
            {titleBase}{titleEm && <> <span className={s.sectionTitleEm}>{titleEm}</span></>}
          </h2>
          {badge && <span className={s.sectionBadge}>{badge}</span>}
        </div>
      </div>
      <div className={s.productRow}>
        {[...Array(5)].map((_, i) => <div key={i} className={`${s.skeletonCard} skeleton`} />)}
      </div>
    </section>
  );

  if (error || !products.length) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>
            {titleBase}{titleEm && <> <span className={s.sectionTitleEm}>{titleEm}</span></>}
          </h2>
          {badge && <span className={s.sectionBadge}>{badge}</span>}
        </div>
        {viewAllHref && (
          <Link to={viewAllHref} className={s.viewAll}>
            כל המוצרים <ChevronLeft size={14} />
          </Link>
        )}
      </div>
      <div className={s.productRow}>
        {products.slice(0, 5).map((p, i) => (
          <ProductCard key={p._id} product={p} rank={showRanks ? i + 1 : undefined} />
        ))}
      </div>
    </section>
  );
}

/* ── BrandsSection ────────────────────────────────────────────────────────── */
function BrandsSection() {
  const navigate = useNavigate();
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>
            מותגים <span className={s.sectionTitleEm}>מובילים</span>
          </h2>
        </div>
        <Link to="/products" className={s.viewAll}>
          כל המותגים <ChevronLeft size={14} />
        </Link>
      </div>
      <div className={s.brandsStrip}>
        {BRANDS.map(brand => (
          <button
            key={brand.id}
            className={s.brandCard}
            onClick={() => navigate(`/products?brand=${brand.slug}`)}
          >
            <div className={s.brandLogoWrap}>
              {brand.iconUrl
                ? <img src={brand.iconUrl} alt={brand.name} className={s.brandImg} />
                : <span className={s.brandText}>{brand.name}</span>
              }
            </div>
            <div className={s.brandName}>{brand.name}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── RecentlyViewedSection (Sapir: 5-col grid with full .pc cards) ────────── */
function RecentlyViewedSection() {
  const { items, clear } = useRecentlyViewed();
  const t = useTranslation();
  if (items.length === 0) return null;

  const recentProducts = items.slice(0, 5).map(p => ({
    _id: p.productId,
    slug: p.slug,
    name: p.name,
    price: p.price,
    images: p.image ? [p.image] : [],
    brand: p.brand || '',
    ratings: p.ratings || { average: 0, count: 0 },
    stock: 1,
  }));

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>צפית <span className={s.sectionTitleEm}>לאחרונה</span></h2>
        <button className={s.recentClear} onClick={clear}>נקה הכל</button>
      </div>
      <div className={s.recentGrid}>
        {recentProducts.map(p => (
          <ProductCard key={p._id} product={p} />
        ))}
      </div>
    </section>
  );
}

/* ── GamerClubSection (matches Sapir's .club-section) ────────────────────── */
function GamerClubSection() {
  const navigate = useNavigate();
  return (
    <section className={s.section}>
      <div className={s.clubBanner}>
        {/* Visual panel */}
        <div className={s.clubVisual}>
          <div className={s.clubVisualBg} aria-hidden="true" />
          <div className={s.clubDashboard}>
            {/* Yearly savings ring */}
            <div className={s.clubDashRingCard}>
              <div className={s.clubRingWrap}>
                <svg className={s.clubRingSvg} viewBox="0 0 72 72">
                  <defs>
                    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2563EB" />
                      <stop offset="100%" stopColor="#00FFCC" />
                    </linearGradient>
                  </defs>
                  <circle className={s.clubRingTrack} cx="36" cy="36" r="30" />
                  <circle className={s.clubRingFill} cx="36" cy="36" r="30" />
                </svg>
                <div className={s.clubRingCenter}>
                  <div className={s.clubRingPct}>75%</div>
                  <div className={s.clubRingLbl}>SAVED</div>
                </div>
              </div>
              <div>
                <div className={s.clubDashRingTitle}>חיסכון שנתי משוער</div>
                <div className={s.clubDashRingVal}>₪1,840</div>
                <div className={s.clubDashRingSub}>ממוצע חבר מועדון פעיל</div>
              </div>
            </div>

            {/* 4 mini stats */}
            <div className={s.clubDashRow}>
              <div className={`${s.clubDashMini} ${s.cdmBlue}`}>
                <div className={s.clubDashMiniIcon}><Percent size={15} strokeWidth={1.6} /></div>
                <div className={s.clubDashMiniVal}>10%</div>
                <div className={s.clubDashMiniLbl}>ניקוד חזרה</div>
              </div>
              <div className={`${s.clubDashMini} ${s.cdmGreen}`}>
                <div className={s.clubDashMiniIcon}><Truck size={15} strokeWidth={1.6} /></div>
                <div className={s.clubDashMiniVal}>חינם</div>
                <div className={s.clubDashMiniLbl}>משלוח תמיד</div>
              </div>
              <div className={`${s.clubDashMini} ${s.cdmViolet}`}>
                <div className={s.clubDashMiniIcon}><Zap size={15} strokeWidth={1.6} /></div>
                <div className={s.clubDashMiniVal}>24h</div>
                <div className={s.clubDashMiniLbl}>גישה מוקדמת</div>
              </div>
              <div className={`${s.clubDashMini} ${s.cdmGold}`}>
                <div className={s.clubDashMiniIcon}><Gift size={15} strokeWidth={1.6} /></div>
                <div className={s.clubDashMiniVal}>×2</div>
                <div className={s.clubDashMiniLbl}>נקודות ב-Sale</div>
              </div>
            </div>

            {/* Cashback progress */}
            <div className={s.clubDashProgress}>
              <div className={s.clubDashProgHead}>
                <div className={s.clubDashProgTitle}>התקדמות לפרס הבא</div>
                <div className={s.clubDashProgBadge}>PLATINUM</div>
              </div>
              <div className={s.clubDashProgTrack}>
                <div className={s.clubDashProgFill} />
              </div>
              <div className={s.clubDashProgFoot}>
                <span>740 נקודות</span>
                <span>נותרו 260 לפרס</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content panel */}
        <div className={s.clubContent}>
          <div className={s.clubBadge}>
            <Star size={13} /> מועדון TechVault
          </div>
          <h2 className={s.clubTitle}>
            הצטרפו ל<span className={s.clubTitleAccent}>מועדון</span><br />הגיימרים שלנו
          </h2>
          <p className={s.clubDesc}>
            הנחות בלעדיות, גישה מוקדמת למוצרים חדשים, ניקוד על כל קנייה — רק ₪50 לכל החיים.
          </p>
          <div className={s.clubPerks}>
            <div className={s.clubPerk}>
              <div className={s.clubPerkIcon}><Percent size={16} /></div>
              <div className={s.clubPerkText}>
                <div className={s.clubPerkTitle}>עד 10% ניקוד חזרה</div>
                <div className={s.clubPerkDesc}>על כל קנייה — הנקודות שלך, לנצח</div>
              </div>
            </div>
            <div className={s.clubPerk}>
              <div className={s.clubPerkIcon}><Truck size={16} /></div>
              <div className={s.clubPerkText}>
                <div className={s.clubPerkTitle}>משלוח חינם ללא מינימום</div>
                <div className={s.clubPerkDesc}>תמיד, על כל הזמנה, לכל הארץ</div>
              </div>
            </div>
            <div className={s.clubPerk}>
              <div className={s.clubPerkIcon}><Zap size={16} /></div>
              <div className={s.clubPerkText}>
                <div className={s.clubPerkTitle}>גישה מוקדמת לסיילים</div>
                <div className={s.clubPerkDesc}>24 שעות לפני כולם למוצרים חדשים</div>
              </div>
            </div>
            <div className={s.clubPerk}>
              <div className={s.clubPerkIcon}><Headset size={16} /></div>
              <div className={s.clubPerkText}>
                <div className={s.clubPerkTitle}>תמיכה VIP 24/7</div>
                <div className={s.clubPerkDesc}>קו ישיר לנציגים מועדפים בכל שעה</div>
              </div>
            </div>
          </div>
          <div className={s.clubCta}>
            <button className={s.clubBtnPrimary} onClick={() => navigate('/register')}>
              <UserPlus size={16} /> הצטרף עכשיו — ₪50 בלבד
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── PolicyBar ────────────────────────────────────────────────────────────── */
function PolicyBar() {
  return (
    <div className={s.policyBar}>
      <div className={s.policyInner}>
        <div className={s.policyHeadline}>למה לקנות אצלנו<span className={s.policyHeadlineAccent}>...</span></div>
        <div className={s.policyGrid}>
          {POLICY_ITEMS.map(({ Icon, title, desc }) => (
            <div key={title} className={s.policyItem}>
              <div className={s.policyIconWrap}>
                <Icon size={28} strokeWidth={1.5} />
              </div>
              <div className={s.policyItemTitle}>{title}</div>
              <div className={s.policyItemDesc}>{desc.split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── ReviewsSection (matches Sapir's .reviews-section) ───────────────────── */
function ReviewsSection() {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>
            מה הלקוחות <span className={s.sectionTitleEm}>אומרים</span>
          </h2>
        </div>
        <button className={s.viewAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          כל הביקורות <ChevronLeft size={14} />
        </button>
      </div>
      <div className={s.reviewsGrid}>
        {HOMEPAGE_REVIEWS.map(r => (
          <div key={r.id} className={s.reviewCard}>
            <div className={s.reviewHeader}>
              <div className={s.reviewAvatar} style={r.avatarBg ? { background: r.avatarBg } : undefined}>
                {r.initials}
              </div>
              <div className={s.reviewMeta}>
                <div className={s.reviewAuthor}>{r.author}</div>
                <div className={s.reviewDate}>{r.location} · {r.date}</div>
                <div className={s.reviewStarsText}>{'★'.repeat(r.rating)}</div>
              </div>
            </div>
            {r.product && (
              <div className={s.reviewProduct}>
                <Monitor size={12} /> מוצר: <strong>{r.product}</strong>
              </div>
            )}
            <p className={s.reviewText} dangerouslySetInnerHTML={{ __html: r.text }} />
          </div>
        ))}
      </div>
    </section>
  );
}


/* ── HomePage ─────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const navigate = useNavigate();
  const t = useTranslation();

  /* Best sellers API — real data, also used to drive the hero (no dedicated
     public "featured products" or "active campaigns" endpoint exists yet). */
  const [bestSellers,        setBestSellers]        = useState([]);
  const [loadingBestSellers, setLoadingBestSellers] = useState(true);
  const [errBestSellers,     setErrBestSellers]     = useState(false);

  useEffect(() => {
    productService.getBestSellers(8)
      .then(p => setBestSellers(p))
      .catch(() => setErrBestSellers(true))
      .finally(() => setLoadingBestSellers(false));
  }, []);

  /* Hero — up to 3 real best-selling products drive the slides; a single
     honest, non-numeric fallback slide covers the loading/empty case. */
  const heroProducts     = bestSellers.slice(0, 3);
  const hasHeroProducts  = heroProducts.length > 0;
  const heroSlideCount   = hasHeroProducts ? heroProducts.length : 1;

  const [heroIdx,     setHeroIdx]     = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const [heroImgError, setHeroImgError] = useState(false);
  const heroTimerRef = useRef(null);

  const goToSlide = (idx) => {
    if (idx === heroIdx) return;
    setHeroVisible(false);
    setTimeout(() => { setHeroIdx(idx); setHeroVisible(true); }, 340);
  };

  useEffect(() => { setHeroImgError(false); }, [heroIdx]);

  useEffect(() => {
    if (heroIdx >= heroSlideCount) setHeroIdx(0);
  }, [heroSlideCount, heroIdx]);

  useEffect(() => {
    if (heroSlideCount <= 1) return undefined;
    heroTimerRef.current = setInterval(() => {
      setHeroVisible(false);
      setTimeout(() => {
        setHeroIdx(i => (i + 1) % heroSlideCount);
        setHeroVisible(true);
      }, 340);
    }, 5000);
    return () => clearInterval(heroTimerRef.current);
  }, [heroSlideCount]);

  const currentProduct = hasHeroProducts ? heroProducts[heroIdx] : null;
  const categoryMeta    = currentProduct ? CATEGORY_META.find(c => c.slug === currentProduct.category) : null;
  const hasDiscount     = !!currentProduct && currentProduct.compareAtPrice != null && currentProduct.compareAtPrice > currentProduct.price;
  const discountPct     = hasDiscount ? Math.round((1 - currentProduct.price / currentProduct.compareAtPrice) * 100) : null;
  const hasRating       = !!currentProduct?.ratings?.count;
  const starCount       = currentProduct ? Math.round(currentProduct.ratings?.average || 0) : 0;
  const hasImage        = hasHeroProducts && !!currentProduct.images?.[0] && !heroImgError;

  return (
    <div className={s.page}>

      {/* ── Hero (matches Sapir's <section class="hero">) ── */}
      <section className={s.hero}>
        <div className={s.heroBg} aria-hidden="true" />
        <div className={s.heroGlow} aria-hidden="true" />

        <div className={s.heroInner}>

          {/* .hero-slides — slide content fades; dots are a static sibling */}
          <div className={s.heroSlides}>
            <div className={`${s.heroSlide} ${heroVisible ? s.heroSlideActive : ''}`}>
              {hasHeroProducts ? (
                <>
                  <div className={s.heroEyebrow}>
                    <span className={s.eyebrowDot} aria-hidden="true" />
                    {t('home.hero.bestsellers_eyebrow')}
                  </div>
                  <h1 className={s.heroTitle}>
                    {t('home.hero.bestsellers_line1')}<br />
                    <span className={s.heroTitleAccent}>{t('home.hero.bestsellers_line2')}</span>
                  </h1>
                  <p className={s.heroDesc}>
                    {t('home.hero.bestsellers_desc')}
                  </p>
                  <div className={s.heroCta}>
                    <button className={s.heroBtnPrimary} onClick={() => navigate(`/products/${currentProduct.slug}`)}>
                      <Eye size={16} /> {t('home.hero.cta_view_product')}
                    </button>
                    <button className={s.heroBtnSecondary} onClick={() => navigate('/products?sort=popularity')}>
                      <LayoutGrid size={16} /> {t('home.hero.cta_all_bestsellers')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={s.heroEyebrow}>
                    <span className={s.eyebrowDot} aria-hidden="true" />
                    {t('home.hero.fallback_eyebrow')}
                  </div>
                  <h1 className={s.heroTitle}>
                    {t('home.hero.fallback_line1')}<br />
                    <span className={s.heroTitleAccent}>{t('home.hero.fallback_line2')}</span>
                  </h1>
                  <p className={s.heroDesc}>
                    {t('home.hero.fallback_desc')}
                  </p>
                  <div className={s.heroCta}>
                    <button className={s.heroBtnPrimary} onClick={() => navigate('/products')}>
                      <ShoppingCart size={16} /> {t('home.hero.cta_catalog')}
                    </button>
                    <button className={s.heroBtnSecondary} onClick={() => navigate('/products')}>
                      <LayoutGrid size={16} /> {t('home.hero.cta_categories')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {heroSlideCount > 1 && (
              <div className={s.slideDots} role="tablist" aria-label={t('home.hero.slides_arialabel')}>
                {heroProducts.map((_, i) => (
                  <button
                    key={i}
                    className={`${s.slideDot} ${i === heroIdx ? s.slideDotActive : ''}`}
                    onClick={() => goToSlide(i)}
                    role="tab"
                    aria-selected={i === heroIdx}
                    aria-label={`${t('home.hero.slide_label')} ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right panel: real best-selling product, or a generic catalog panel */}
          <div className={`${s.heroProductPanel} ${heroVisible ? s.heroVisible : s.heroHidden}`}>
            <div className={s.heroPCard}>
              <div className={s.heroPImg}>
                {hasImage ? (
                  <img
                    src={currentProduct.images[0]}
                    alt={currentProduct.name}
                    className={s.heroPImgReal}
                    onError={() => setHeroImgError(true)}
                  />
                ) : hasHeroProducts ? (
                  <ImageOff size={56} strokeWidth={1.2} className={s.heroPIcon} />
                ) : (
                  <LayoutGrid size={72} strokeWidth={1.2} className={s.heroPIcon} />
                )}
                {hasHeroProducts && (
                  <span className={s.heroPImgLabel} style={{ background: '#2563EB' }}>
                    {t('home.hero.bestseller_tag')}
                  </span>
                )}
              </div>

              {hasHeroProducts ? (
                <>
                  <div className={s.heroPBrand}>{currentProduct.brand}</div>
                  <div className={s.heroPName}>{currentProduct.name}</div>
                  {hasRating && (
                    <div className={s.heroPRating}>
                      <span className={s.heroPStars}>
                        {'★'.repeat(Math.min(starCount, 5))}{'☆'.repeat(Math.max(0, 5 - starCount))}
                      </span>
                      <span className={s.heroPRcount}>({currentProduct.ratings.count})</span>
                    </div>
                  )}
                  <div className={s.heroPPriceRow}>
                    <span className={s.heroPPrice}>₪{Number(currentProduct.price).toLocaleString()}</span>
                    {hasDiscount && <span className={s.heroPOld}>₪{Number(currentProduct.compareAtPrice).toLocaleString()}</span>}
                    {hasDiscount && <span className={s.heroPDiscount}>-{discountPct}%</span>}
                  </div>
                  <button className={s.heroPAddBtn} onClick={() => navigate(`/products/${currentProduct.slug}`)}>
                    <Eye size={15} /> {t('home.hero.cta_view_product')}
                  </button>
                  <div className={s.floatBadge1} aria-hidden="true">
                    <span className={s.floatLbl}>{t('home.hero.rank_badge_label')}</span>
                    <span className={s.floatVal}>
                      <Award size={12} /> {t('home.hero.rank_badge_value').replace('{n}', heroIdx + 1)}
                    </span>
                  </div>
                  {categoryMeta && (
                    <div className={s.floatBadge2} aria-hidden="true">
                      <span className={s.floatLbl}>{t('home.hero.category_badge_label')}</span>
                      <span className={s.floatVal}>
                        <categoryMeta.Icon size={12} />
                        {t(categoryMeta.labelKey)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={s.heroPBrand}>TechVault</div>
                  <div className={s.heroPName}>{t('home.hero.fallback_panel_title')}</div>
                  <button className={s.heroPAddBtn} onClick={() => navigate('/products')}>
                    <LayoutGrid size={15} /> {t('home.hero.cta_categories')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Brands (bg: --bg) ── */}
      <div className={s.brandsWrap}>
        <div className={s.sectionInner}>
          <BrandsSection />
        </div>
      </div>

      {/* ── Best Sellers (bg: --surface) ── */}
      <div className={s.sellersWrap}>
        <div className={s.sectionInner}>
          <ProductSection
            titleBase="הנמכרים"
            titleEm="ביותר"
            products={bestSellers}
            loading={loadingBestSellers}
            error={errBestSellers}
            viewAllHref="/products?sort=popularity"
            showRanks
          />
        </div>
      </div>

      {/* ── Deal banner (full width) ── */}
      <DealBanner />

      {/* ── Recently Viewed (bg: --surface) ── */}
      <div className={s.recentWrap}>
        <div className={s.sectionInner}>
          <RecentlyViewedSection />
        </div>
      </div>

      {/* ── Gamer Club ── */}
      <div className={s.clubWrap}>
        <div className={s.clubWrapInner}>
          <GamerClubSection />
        </div>
      </div>

      {/* ── Policy bar (full width) ── */}
      <PolicyBar />

      {/* ── Reviews (bg: --bg) ── */}
      <div className={s.reviewsWrap}>
        <div className={s.sectionInner}>
          <ReviewsSection />
        </div>
      </div>

      {/* ── Footer ── */}
      <Footer />

    </div>
  );
}
