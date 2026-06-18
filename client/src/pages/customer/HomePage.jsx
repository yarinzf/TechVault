import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Monitor, Cpu, Keyboard, ShoppingCart,
  Truck, RotateCcw, ShieldCheck, Headphones,
  Zap, ArrowLeft, Star, UserPlus,
  ChevronLeft, Twitter, Instagram, Youtube, Linkedin,
  Trophy,
} from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useTranslation } from '../../context/LanguageContext';
import ProductCard from '../../features/products/components/ProductCard';
import { BRANDS } from '../../constants/brands';
import { HOMEPAGE_REVIEWS } from '../../constants/reviews';
import s from './HomePage.module.css';

/* ── Hero slides ──────────────────────────────────────────────────────────── */
const HERO_SLIDES = [
  {
    eyebrow: 'חדש — מסך גיימינג OLED זמין עכשיו',
    label: 'NEW', labelColor: 'var(--sv-blue)',
    brand: 'ASUS ROG',
    name: 'Swift PG27AQDM 27" OLED 240Hz',
    desc: 'מסך OLED עם זמן תגובה 0.03ms וכיסוי 99% DCI-P3',
    price: '₪3,299', oldPrice: '₪4,199', discount: '-22%',
    Icon: Monitor,
    badge1: { lbl: 'זמן תגובה', val: '⚡ 0.03ms' },
    badge2: { lbl: 'כיסוי צבע', val: '★ 99% DCI-P3' },
  },
  {
    eyebrow: 'חדש — מקלדת מכנית אופטית',
    label: 'NEW', labelColor: 'var(--sv-blue)',
    brand: 'Razer',
    name: 'BlackWidow V4 Pro Optical Green',
    desc: 'מתגים אופטיים Gen-3, תאורת Chroma RGB, חיבור כפול',
    price: '₪699', oldPrice: '', discount: '',
    Icon: Keyboard,
    badge1: { lbl: 'סוג מתג', val: '★ אופטי Gen-3' },
    badge2: { lbl: 'תאורה', val: '🌈 Chroma RGB' },
  },
  {
    eyebrow: 'מבצע — כרטיס מסך RTX 4070 Ti',
    label: 'SALE', labelColor: 'var(--sv-red)',
    brand: 'NVIDIA',
    name: 'GeForce RTX 4070 Ti Super 16GB',
    desc: 'ביצועי 4K עם DLSS 3 ו-Ray Tracing מתקדם',
    price: '₪2,999', oldPrice: '₪3,649', discount: '-18%',
    Icon: Cpu,
    badge1: { lbl: 'זיכרון', val: '💾 16GB GDDR6X' },
    badge2: { lbl: 'פלט', val: '🎮 4K 60fps+' },
  },
];

/* ── Static data ──────────────────────────────────────────────────────────── */
const POLICY_ITEMS = [
  { Icon: Truck,       title: 'משלוח חינם מ-₪299', desc: 'עד 48 שעות לכל הארץ'  },
  { Icon: RotateCcw,   title: 'החזרה ב-30 ימים',   desc: 'ללא שאלות, החזר מלא'  },
  { Icon: ShieldCheck, title: 'אחריות יצרן',        desc: 'על כל המוצרים בחנות'  },
  { Icon: Headphones,  title: 'תמיכה 24/7',         desc: "צ'אט, טלפון ואימייל" },
];

const CLUB_STATS = [
  { num: '50K',  accent: '+',  lbl: 'חברים פעילים' },
  { num: '₪150', accent: '',   lbl: 'חיסכון ממוצע' },
  { num: '4.9',  accent: '★',  lbl: 'שביעות רצון'  },
  { num: '24',   accent: '/7', lbl: 'תמיכה VIP'    },
];

const FOOTER_COLS = [
  {
    title: 'קטגוריות',
    links: [
      { label: 'מסכי גיימינג',   to: '/products?category=monitors'   },
      { label: 'כרטיסי מסך',     to: '/products?category=components'  },
      { label: 'מקלדות ועכברים', to: '/products?category=keyboards'   },
      { label: 'אוזניות',        to: '/products?category=headphones'  },
      { label: 'מחשבים ניידים',  to: '/products?category=laptops'     },
      { label: 'אחסון',          to: '/products?category=storage'     },
    ],
  },
  {
    title: 'שירות ללקוחות',
    links: [
      { label: 'צור קשר',           to: '#' },
      { label: 'מדיניות החזרות',    to: '#' },
      { label: 'אחריויות ותיקונים', to: '#' },
      { label: 'שאלות נפוצות',      to: '#' },
      { label: 'עמדות שירות',       to: '#' },
    ],
  },
  {
    title: 'החשבון שלי',
    links: [
      { label: 'התחברות',          to: '/login'    },
      { label: 'הרשמה',            to: '/register' },
      { label: 'הזמנות שלי',       to: '/orders'   },
      { label: 'מועדפים',          to: '/wishlist' },
      { label: 'מועדון TechVault', to: '#'         },
    ],
  },
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

/* ── RecentlyViewedSection ────────────────────────────────────────────────── */
function RecentlyViewedSection() {
  const { items } = useRecentlyViewed();
  const t         = useTranslation();
  const navigate  = useNavigate();
  if (items.length === 0) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>{t('home.recently_viewed')}</h2>
        </div>
      </div>
      <div className={s.recentRow}>
        {items.slice(0, 6).map(p => (
          <button
            key={p.productId}
            className={s.recentCard}
            onClick={() => navigate(`/products/${p.slug}`)}
          >
            <div className={s.recentImg}>
              {p.image
                ? <img src={p.image} alt={p.name} />
                : <span className={s.recentPlaceholder}>📦</span>
              }
            </div>
            <div className={s.recentName}>{p.name}</div>
            <div className={s.recentPrice}>₪{Number(p.price).toFixed(2)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── GamerClubSection ─────────────────────────────────────────────────────── */
function GamerClubSection() {
  const navigate = useNavigate();
  return (
    <section className={s.section}>
      <div className={s.clubBanner}>
        {/* Visual panel (right in RTL) */}
        <div className={s.clubVisual}>
          <div className={s.clubVisualBg} aria-hidden="true" />
          <div className={s.clubVisualContent}>
            <Trophy size={52} className={s.clubIcon} />
            <div className={s.clubStatsGrid}>
              {CLUB_STATS.map(({ num, accent, lbl }) => (
                <div key={lbl} className={s.clubStat}>
                  <div className={s.clubStatNum}>
                    {num}<span className={s.clubStatAccent}>{accent}</span>
                  </div>
                  <div className={s.clubStatLbl}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content panel (left in RTL) */}
        <div className={s.clubContent}>
          <div className={s.clubBadge}>
            <Star size={13} /> מועדון TechVault
          </div>
          <h2 className={s.clubTitle}>
            הצטרפו ל<span className={s.clubTitleAccent}>מועדון</span><br />הגיימרים שלנו
          </h2>
          <p className={s.clubDesc}>
            קבלו הנחות בלעדיות, גישה מוקדמת למוצרים חדשים, ניקוד על כל קנייה ועוד הטבות מפתיעות.
          </p>
          <div className={s.clubCta}>
            <button className={s.clubBtnPrimary} onClick={() => navigate('/register')}>
              <UserPlus size={16} /> הצטרפו בחינם
            </button>
            <button className={s.clubBtnSec}>קרא עוד</button>
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
        <div className={s.policyHeadline}>
          <h3 className={s.policyTitle}>למה לקנות אצלנו?</h3>
          <p className={s.policySub}>אלפי לקוחות מרוצים כבר בחרו ב-TechVault</p>
        </div>
        <div className={s.policyGrid}>
          {POLICY_ITEMS.map(({ Icon, title, desc }) => (
            <div key={title} className={s.policyItem}>
              <div className={s.policyIconWrap}>
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <div>
                <div className={s.policyItemTitle}>{title}</div>
                <div className={s.policyItemDesc}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── ReviewsSection ───────────────────────────────────────────────────────── */
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
              <div className={s.reviewAvatar}>{r.initials}</div>
              <div className={s.reviewMeta}>
                <div className={s.reviewAuthor}>{r.author}</div>
                <div className={s.reviewDate}>{r.date}</div>
              </div>
              <div className={s.reviewStars}>
                {[...Array(r.rating)].map((_, i) => (
                  <Star key={i} size={13} className={s.starFilled} />
                ))}
              </div>
            </div>
            {r.product && (
              <div className={s.reviewProduct}>✓ רכישה מאומתת · {r.product}</div>
            )}
            <p className={s.reviewText}>{r.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── SiteFooter ───────────────────────────────────────────────────────────── */
function SiteFooter() {
  return (
    <footer className={s.siteFooter}>
      <div className={s.footerInner}>
        <div className={s.footerGrid}>
          <div className={s.footerBrand}>
            <div className={s.footerBrandWrap}>
              <svg width="28" height="30" viewBox="0 0 133 142" fill="none" aria-hidden="true">
                <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
                <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
              </svg>
              <span className={s.footerBrandName}>
                Tech<span className={s.footerBrandAccent}>Vault</span>
              </span>
            </div>
            <p className={s.footerDesc}>
              החנות המובילה לציוד גיימינג ותשתיות טכנולוגיות. אלפי מוצרים, מחירים תחרותיים, שירות מהיר.
            </p>
          </div>

          {FOOTER_COLS.map(col => (
            <div key={col.title} className={s.footerCol}>
              <div className={s.footerColTitle}>{col.title}</div>
              {col.links.map(link => (
                <Link key={link.label} to={link.to} className={s.footerLink}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className={s.footerBottom}>
          <div className={s.footerCopy}>© 2025 TechVault. כל הזכויות שמורות.</div>
          <div className={s.footerSocials}>
            {[
              { Icon: Twitter,   href: '#', label: 'Twitter'   },
              { Icon: Instagram, href: '#', label: 'Instagram'  },
              { Icon: Youtube,   href: '#', label: 'YouTube'    },
              { Icon: Linkedin,  href: '#', label: 'LinkedIn'   },
            ].map(({ Icon, href, label }) => (
              <a key={label} href={href} className={s.socialBtn} aria-label={label}>
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── HomePage ─────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const navigate = useNavigate();
  const t        = useTranslation();

  /* Hero */
  const [heroIdx,     setHeroIdx]     = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const heroTimerRef = useRef(null);

  const goToSlide = (idx) => {
    if (idx === heroIdx) return;
    setHeroVisible(false);
    setTimeout(() => { setHeroIdx(idx); setHeroVisible(true); }, 340);
  };

  useEffect(() => {
    heroTimerRef.current = setInterval(() => {
      setHeroVisible(false);
      setTimeout(() => {
        setHeroIdx(i => (i + 1) % HERO_SLIDES.length);
        setHeroVisible(true);
      }, 340);
    }, 5000);
    return () => clearInterval(heroTimerRef.current);
  }, []);

  /* Best sellers API */
  const [bestSellers,        setBestSellers]        = useState([]);
  const [loadingBestSellers, setLoadingBestSellers] = useState(true);
  const [errBestSellers,     setErrBestSellers]     = useState(false);

  useEffect(() => {
    productService.getBestSellers(8)
      .then(p => setBestSellers(p))
      .catch(() => setErrBestSellers(true))
      .finally(() => setLoadingBestSellers(false));
  }, []);

  const slide    = HERO_SLIDES[heroIdx];
  const HeroIcon = slide.Icon;

  return (
    <div className={s.page}>

      {/* ── Hero ── */}
      <section className={s.hero}>
        <div className={s.heroBg} aria-hidden="true" />
        <div className={s.heroGlow} aria-hidden="true" />

        <div className={s.heroInner}>
          <div className={`${s.heroLeft} ${heroVisible ? s.heroVisible : s.heroHidden}`}>
            <div className={s.heroEyebrow}>
              <span className={s.eyebrowDot} aria-hidden="true" />
              {slide.eyebrow}
            </div>

            <h1 className={s.heroTitle}>{slide.name}</h1>
            <p className={s.heroDesc}>{slide.desc}</p>

            <div className={s.heroActions}>
              <button className={s.heroBtnPrimary} onClick={() => navigate('/products')}>
                {t('home.catalog_cta')}
              </button>
              <button className={s.heroBtnSecondary} onClick={() => navigate('/products?onSale=true')}>
                {t('home.sales_cta')}
              </button>
            </div>

            <div className={s.heroStats}>
              <div className={s.stat}><div className={s.statNum}>12,000<span className={s.statAccent}>+</span></div><div className={s.statLabel}>מוצרים</div></div>
              <div className={s.stat}><div className={s.statNum}>200<span className={s.statAccent}>+</span></div><div className={s.statLabel}>מותגים</div></div>
              <div className={s.stat}><div className={s.statNum}>4.9<span className={s.statAccent}>★</span></div><div className={s.statLabel}>דירוג</div></div>
              <div className={s.stat}><div className={s.statNum}>30 <span className={s.statLabel}>יום</span></div><div className={s.statLabel}>החזרה</div></div>
            </div>

            <div className={s.heroDots} role="tablist" aria-label="מצגת גיבורים">
              {HERO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  className={`${s.heroDot} ${i === heroIdx ? s.heroDotActive : ''}`}
                  onClick={() => goToSlide(i)}
                  role="tab"
                  aria-selected={i === heroIdx}
                  aria-label={`מצגת ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div className={`${s.heroRight} ${heroVisible ? s.heroVisible : s.heroHidden}`}>
            <div className={s.heroPCard}>
              <div className={s.heroPImg}>
                <HeroIcon size={72} strokeWidth={1} className={s.heroPIcon} />
                <span className={s.heroPImgLabel} style={{ background: slide.labelColor }}>
                  {slide.label}
                </span>
              </div>
              <div className={s.heroPBrand}>{slide.brand}</div>
              <div className={s.heroPName}>{slide.name}</div>
              <div className={s.heroPRating}>
                <span className={s.heroPStars}>★★★★★</span>
                <span className={s.heroPRcount}>(128)</span>
              </div>
              <div className={s.heroPPriceRow}>
                <span className={s.heroPPrice}>{slide.price}</span>
                {slide.oldPrice && <span className={s.heroPOld}>{slide.oldPrice}</span>}
                {slide.discount && <span className={s.heroPDiscount}>{slide.discount}</span>}
              </div>
              <button className={s.heroPAddBtn} onClick={() => navigate('/products')} aria-label="עבור לחנות">
                <ShoppingCart size={15} />
                הוסף לעגלה
              </button>
              <div className={s.floatBadge1} aria-hidden="true">
                <span className={s.floatLbl}>{slide.badge1.lbl}</span>
                <span className={s.floatVal}>{slide.badge1.val}</span>
              </div>
              <div className={s.floatBadge2} aria-hidden="true">
                <span className={s.floatLbl}>{slide.badge2.lbl}</span>
                <span className={s.floatVal}>{slide.badge2.val}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Brands + Best Sellers ── */}
      <div className={s.main}>
        <BrandsSection />
        <ProductSection
          titleBase="הנמכרים"
          titleEm="ביותר"
          badge="HOT 🔥"
          products={bestSellers}
          loading={loadingBestSellers}
          error={errBestSellers}
          viewAllHref="/products?sort=popularity"
          showRanks
        />
      </div>

      {/* ── Deal banner (full width) ── */}
      <DealBanner />

      {/* ── Recently Viewed + Gamer Club ── */}
      <div className={s.main}>
        <RecentlyViewedSection />
        <GamerClubSection />
      </div>

      {/* ── Policy bar (full width) ── */}
      <PolicyBar />

      {/* ── Reviews ── */}
      <div className={s.main}>
        <ReviewsSection />
      </div>

      {/* ── Footer ── */}
      <SiteFooter />

    </div>
  );
}
