import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flame, Zap, CalendarDays, ShoppingCart, TrendingDown, Star, Hourglass,
  Award, ArrowLeft, Plus, Loader, Crown, ShieldCheck, UserPlus,
  Gift, Truck, Undo2, CreditCard, AlertTriangle, Check, Tag,
} from 'lucide-react';
import { campaignService } from '../../features/campaigns/api/campaign.service';
import { useCart } from '../../hooks/useCart';
import { useToast } from '../../hooks/useToast';
import { useMembership } from '../../hooks/useMembership';
import DealProductCard from '../../features/deals/components/DealProductCard';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import Button from '../../components/ui/Button/Button';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import { useTranslation } from '../../context/LanguageContext';
import s from './DealsPage.module.css';

const HOT_LIMIT       = 8;
const LIMITED_LIMIT   = 8;
const CLEARANCE_LIMIT = 8;

// Same proven algorithm as HomePage's weekly-deal countdown: derives purely
// from the real endDate, ticks every second, never resets on refresh, never
// goes negative, cleans up its interval on unmount.
function useCountdown(endDate) {
  const targetRef = useRef(endDate ? Date.parse(endDate) : null);
  const [secs, setSecs] = useState(() =>
    targetRef.current ? Math.max(0, Math.floor((targetRef.current - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    if (!endDate) { setSecs(null); return; }
    targetRef.current = Date.parse(endDate);
    const tick = () => {
      const remaining = Math.max(0, Math.floor((targetRef.current - Date.now()) / 1000));
      setSecs(remaining);
      if (remaining <= 0) clearInterval(id);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  return secs;
}

function CountdownBlocks({ secs, size = 'lg' }) {
  const t = useTranslation();
  if (secs == null) return null;
  const d  = String(Math.floor(secs / 86400)).padStart(2, '0');
  const h  = String(Math.floor((secs % 86400) / 3600)).padStart(2, '0');
  const m  = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const sc = String(secs % 60).padStart(2, '0');
  return (
    <div className={`${s.countdown} ${size === 'sm' ? s.countdownSm : ''}`} dir="ltr" aria-live="off">
      {Number(d) > 0 && (
        <>
          <div className={s.cblock}><span className={s.cnum}>{d}</span><span className={s.clbl}>{t('deals.days_full')}</span></div>
          <span className={s.csep}>:</span>
        </>
      )}
      <div className={s.cblock}><span className={s.cnum}>{h}</span><span className={s.clbl}>{t('deals.hours_full')}</span></div>
      <span className={s.csep}>:</span>
      <div className={s.cblock}><span className={s.cnum}>{m}</span><span className={s.clbl}>{t('deals.mins_full')}</span></div>
      <span className={s.csep}>:</span>
      <div className={s.cblock}><span className={s.cnum}>{sc}</span><span className={s.clbl}>{t('deals.secs_full')}</span></div>
    </div>
  );
}

// One-time production storefront curation (server/scripts/curateProductionStorefront.js)
// tags every campaign it creates with this fixed prefix so a second run can
// detect existing curated campaigns (idempotency) — it's an internal marker,
// never meant to reach a shopper. Strips it (and the optional " — <tag>"
// segment right after it) so the Hero only ever shows the real, friendly
// deal name that was always the last segment of the tagged string.
const CURATION_NAME_PREFIX = /^Production Curation 2026\s*—\s*/;
function displayCampaignName(rawName) {
  if (!rawName || !CURATION_NAME_PREFIX.test(rawName)) return rawName;
  const segments = rawName.split(' — ');
  return segments[segments.length - 1];
}

// ── Hero — the single featured active campaign ──────────────────────────────
function DealsHero({ campaign, product }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const secs = useCountdown(campaign.endDate);
  const expired = secs != null && secs <= 0;

  const price    = Math.round(product.price * 100) / 100;
  const sale     = Math.round(product.discountedPrice * 100) / 100;
  const savings  = Math.max(0, Math.round((price - sale) * 100) / 100);

  const ctaHref = useMemo(() => {
    if (campaign.products.length === 1) return `/products/${product.slug}`;
    const categories = new Set(campaign.products.map((p) => p.category?.slug).filter(Boolean));
    if (categories.size === 1) return `/category/${[...categories][0]}`;
    return '/products?onSale=true';
  }, [campaign, product]);

  if (expired) return null;

  return (
    <div className={s.hero}>
      <div className={s.heroInner}>
        <div>
          <div className={s.heroBadges}>
            <div className={s.heroBadge}><Zap size={13} /> {t('deals.hero_badge_big')}</div>
            {campaign.placement === 'homepage_weekly_deal' && (
              <div className={`${s.heroBadge} ${s.heroBadgeAlt}`}><CalendarDays size={13} /> {t('deals.hero_badge_weekly')}</div>
            )}
          </div>
          <h2 className={s.heroTitle}>
            {t('deals.hero_up_to')} <span>{campaign.discountPercent}% {t('deals.hero_off')}</span>
            <br />{displayCampaignName(campaign.name)}
          </h2>
          {product.category?.name && <p className={s.heroSub}>{product.category.name}</p>}
          <button className={s.heroCta} onClick={() => navigate(ctaHref)}>
            <ShoppingCart size={16} /> {t('deals.hero_cta')}
          </button>
        </div>

        <div className={s.heroFeature}>
          <div className={s.heroFeatureVisual}>
            <div className={s.heroFeatureGlow} aria-hidden="true" />
            {product.image
              ? <img src={product.image} alt={product.name} className={s.heroFeatureImg} />
              : <ShoppingCart size={72} strokeWidth={1.2} className={s.heroFeatureIcon} aria-hidden="true" />}
          </div>
          <div className={s.heroFeaturePrices}>
            <div className={s.hfpRow}><span className={s.hfpLabel}>{t('deals.regular_price')}</span><span className={s.hfpOld}>₪{price.toLocaleString()}</span></div>
            <div className={s.hfpRow}><span className={s.hfpLabel}>{t('deals.sale_price')}</span><span className={s.hfpNew}>₪{sale.toLocaleString()}</span></div>
            {savings > 0 && (
              <div className={s.hfpSave}><TrendingDown size={12} /> {t('deals.savings_prefix')} ₪{savings.toLocaleString()}</div>
            )}
          </div>
          <CountdownBlocks secs={secs} />
        </div>
      </div>
    </div>
  );
}

// Three real, meaningful spec VALUES (no "label: " prefix — Sapir's reference
// shows bare values like "34"" / "QD-OLED" / "175Hz"), never the category
// name. Priority list mirrors ProductCard's own spec-chip picker so the same
// product would show the same highlights everywhere.
const WEEKLY_SPEC_PRIORITY = [
  'Screen Size', 'Panel Type', 'Refresh Rate', 'Resolution',
  'Switch Type', 'Driver Size', 'Connectivity', 'Sensor', 'DPI', 'Noise Cancellation',
];
function pickWeeklySpecs(specs) {
  if (!specs || typeof specs !== 'object') return [];
  const entries = specs instanceof Map ? [...specs.entries()] : Object.entries(specs);
  const SKIP = new Set(['true', 'false', 'n/a', 'none', '']);
  const picked = [];
  for (const key of WEEKLY_SPEC_PRIORITY) {
    if (picked.length >= 3) break;
    const match = entries.find(([k]) => k === key);
    if (!match) continue;
    const val = String(match[1]).trim();
    if (SKIP.has(val.toLowerCase()) || picked.includes(val)) continue;
    picked.push(val);
  }
  return picked;
}

// ── Weekly Deal spotlight — reuses the SAME public endpoint/data shape as
// HomePage's weekly-deal section; a compact editorial strip matching Sapir's
// `.dl-weekly` exactly (design-reference/techvault-deals.html). No countdown
// here by design — the campaign Hero above already owns the primary
// countdown; expiry is still tracked (silently) so an expired Weekly Deal
// never lingers on screen. ─────────────────────────────────────────────────
function WeeklySpotlight({ deal, onExpire }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [imgError, setImgError] = useState(false);
  const secs = useCountdown(deal.endDate); // expiry tracking only — not rendered

  const { product } = deal;
  const hasImage = !imgError && !!product.image;
  const outOfStock = !(product.stock > 0);
  const specs = pickWeeklySpecs(product.specs);

  const price = Math.round(product.price * 100) / 100;
  const sale  = Math.round(product.discountedPrice * 100) / 100;
  const savings = Math.max(0, Math.round((price - sale) * 100) / 100);

  const handleAddToCart = async (e) => {
    e.stopPropagation();
    if (outOfStock || adding) return;
    setAdding(true);
    try {
      await addItem(product.id, 1, { name: product.name, price: sale, image: product.image ?? '', originalPrice: price });
      toast.success(`${product.name} ${t('product.added_to_cart_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    if (secs === 0) onExpire?.();
  }, [secs, onExpire]);

  if (secs != null && secs <= 0) return null;

  return (
    <div className={s.weekly}>
      <div className={s.weeklyVisual}>
        <div className={s.weeklyGlow} aria-hidden="true" />
        {hasImage
          ? <img src={product.image} alt={product.name} className={s.weeklyImg} onError={() => setImgError(true)} />
          : <ShoppingCart size={56} strokeWidth={1} className={s.weeklyIcon} aria-hidden="true" />}
      </div>
      <div className={s.weeklyBody}>
        <div className={s.weeklyEyebrow}><Award size={12} /> {t('deals.weekly_eyebrow')}</div>
        {product.brand && <div className={s.weeklyBrand}>{product.brand}</div>}
        <div className={s.weeklyName}>{product.name}</div>
        {specs.length > 0 && (
          <div className={s.weeklySpecs}>
            {specs.map((sp) => <span key={sp}><Check size={12} /> {sp}</span>)}
          </div>
        )}
        <div className={s.weeklyPrices}>
          <span className={s.weeklyNew}>₪{sale.toLocaleString()}</span>
          <span className={s.weeklyOld}>₪{price.toLocaleString()}</span>
          {savings > 0 && <span className={s.weeklySave}><TrendingDown size={11} /> {t('deals.savings_prefix')} ₪{savings.toLocaleString()}</span>}
        </div>
        <div className={s.weeklyActions}>
          <button className={s.weeklyAddBtn} onClick={handleAddToCart} disabled={outOfStock || adding}>
            {adding ? <Loader size={14} className={s.spin} /> : <Plus size={14} />}
            {outOfStock ? t('product.out_of_stock') : t('weeklyDeal.add_to_cart')}
          </button>
          <button className={s.weeklyViewBtn} onClick={() => navigate(`/products/${product.slug}`)}>
            <ArrowLeft size={14} /> {t('weeklyDeal.view_product')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Club / membership banner — real membership status only, no fabricated
// VIP pricing/points multipliers (see CLUB_JOIN_FACTS precedent on Home). ──
function ClubBanner() {
  const t = useTranslation();
  const navigate = useNavigate();
  const { isMember, points } = useMembership();

  if (isMember) {
    return (
      <div className={s.vipBanner}>
        <div className={`${s.vipIcon} ${s.vipIconActive}`}><ShieldCheck size={22} /></div>
        <div className={s.vipText}>
          <div className={s.vipEyebrow}>{t('deals.club_eyebrow')}</div>
          <div className={s.vipTitle}>{t('deals.club_member_title')}</div>
          <div className={s.vipSub}>{t('deals.club_member_sub')} {t('deals.club_points_label')}: {points.toLocaleString()}</div>
        </div>
        <button className={`${s.vipCta} ${s.vipCtaMember}`} onClick={() => navigate('/club')}>
          <Gift size={16} /> {t('deals.club_member_cta')}
        </button>
      </div>
    );
  }

  return (
    <div className={s.vipBanner}>
      <div className={s.vipIcon}><Crown size={22} /></div>
      <div className={s.vipText}>
        <div className={s.vipEyebrow}>{t('deals.club_eyebrow')}</div>
        <div className={s.vipTitle}>{t('deals.club_join_title')}</div>
        <div className={s.vipSub}>{t('deals.club_join_sub')}</div>
      </div>
      <button className={s.vipCta} onClick={() => navigate('/club/join')}>
        <UserPlus size={16} /> {t('deals.club_join_cta')}
      </button>
    </div>
  );
}

// ── Trust badges (same real, non-numeric-promise facts as Home's PolicyBar) ─
function TrustBadges() {
  const t = useTranslation();
  const items = [
    { Icon: Truck,      title: t('deals.trust_shipping_title'),  desc: t('deals.trust_shipping_desc')  },
    { Icon: Undo2,      title: t('deals.trust_returns_title'),   desc: t('deals.trust_returns_desc')   },
    { Icon: ShieldCheck, title: t('deals.trust_warranty_title'), desc: t('deals.trust_warranty_desc')  },
    { Icon: CreditCard, title: t('deals.trust_payments_title'),  desc: t('deals.trust_payments_desc')  },
  ];
  return (
    <div className={s.whyGrid}>
      {items.map(({ Icon, title, desc }) => (
        <div key={title} className={s.whyItem}>
          <div className={s.whyIcon}><Icon size={20} /></div>
          <div className={s.whyTitle}>{title}</div>
          <div className={s.whyDesc}>{desc}</div>
        </div>
      ))}
    </div>
  );
}

export default function DealsPage() {
  const t = useTranslation();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);
  const [weeklyDeal, setWeeklyDeal] = useState(null);
  const [loading, setLoading]      = useState(true);
  const [error, setError]          = useState(null);
  const [filter, setFilter]        = useState('all');

  const loadDeals = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      campaignService.getActiveCampaigns(),
      campaignService.getWeeklyDeal().catch(() => null),
    ])
      .then(([campaignsRes, weeklyRes]) => {
        setCampaigns(campaignsRes);
        setWeeklyDeal(weeklyRes);
      })
      .catch((err) => setError(err.message || t('deals.load_error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  // One product can belong to more than one active campaign — keep the
  // highest discount for it, exactly like the same-product-different-page
  // consistency rule getActiveDiscountMap() already enforces everywhere else.
  const dealProducts = useMemo(() => {
    const map = new Map();
    campaigns.forEach((c) => {
      c.products.forEach((p) => {
        const existing = map.get(p.id);
        if (!existing || p.discountPercent > existing.discountPercent) {
          map.set(p.id, { ...p, campaignId: c.id, campaignName: c.name, campaignEndDate: c.endDate });
        }
      });
    });
    return [...map.values()];
  }, [campaigns]);

  // Featured Hero campaign: `homepage_weekly_deal` means "belongs to the
  // Weekly Deal spotlight below," not "is the primary campaign for this
  // page" — so a non-weekly campaign is always preferred for the Hero
  // (highest discount, then most recently started) and the Weekly Deal
  // campaign is only ever used as a Hero fallback when it's the sole active
  // campaign. This keeps the Hero and the Weekly Deal section from ever
  // showing the exact same campaign at once.
  const heroCampaign = useMemo(() => {
    if (campaigns.length === 0) return null;
    const byDiscountThenRecency = (a, b) => {
      if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
      return new Date(b.startDate) - new Date(a.startDate);
    };
    const nonWeekly = campaigns.filter((c) => c.placement !== 'homepage_weekly_deal');
    if (nonWeekly.length > 0) return [...nonWeekly].sort(byDiscountThenRecency)[0];
    return [...campaigns].sort(byDiscountThenRecency)[0];
  }, [campaigns]);

  const heroProduct = useMemo(() => {
    if (!heroCampaign) return null;
    return [...heroCampaign.products].sort((a, b) =>
      (b.price - b.discountedPrice) - (a.price - a.discountedPrice)
    )[0];
  }, [heroCampaign]);

  // Clearance is its own dedicated section (see clearanceDeals below) — a
  // product whose winning campaign is a clearance campaign is excluded from
  // Hottest Deals so the same card never appears in two sections at once.
  // Mega Deal selection (heroCampaign/heroProduct) is untouched by this —
  // if a clearance campaign happens to carry the single highest discount,
  // it can still legitimately win the Hero slot exactly as before.
  const eligibleForHot = useMemo(
    () => dealProducts.filter((p) => p.id !== heroProduct?.id && !p.isClearance),
    [dealProducts, heroProduct]
  );

  const availableCategories = useMemo(() => {
    const map = new Map();
    eligibleForHot.forEach((p) => { if (p.category?.slug) map.set(p.category.slug, p.category.name); });
    return [...map.entries()].map(([slug, name]) => ({ slug, name }));
  }, [eligibleForHot]);

  const hotDeals = useMemo(() => {
    let list = eligibleForHot;
    if (filter === 'under20') list = list.filter((p) => p.discountPercent <= 20);
    else if (filter === '20to40') list = list.filter((p) => p.discountPercent > 20 && p.discountPercent <= 40);
    else if (filter === 'over40') list = list.filter((p) => p.discountPercent > 40);
    else if (filter.startsWith('category:')) {
      const slug = filter.slice('category:'.length);
      list = list.filter((p) => p.category?.slug === slug);
    }
    return [...list].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, HOT_LIMIT);
  }, [eligibleForHot, filter]);

  const limitedDeals = useMemo(() => (
    dealProducts
      .filter((p) => !p.isClearance)
      .sort((a, b) => new Date(a.campaignEndDate) - new Date(b.campaignEndDate))
      .slice(0, LIMITED_LIMIT)
  ), [dealProducts]);

  // Clearance section — ONLY products whose winning campaign is a real,
  // active/date-valid clearance campaign (isClearance already resolved
  // server-side in getActiveCampaigns; dealProducts already keeps, per
  // product, whichever active campaign currently has the highest discount —
  // see the dedup comment above). Sorted by discount, same precedent as
  // hotDeals, since clearance has no separate priority/ordering field.
  const clearanceDeals = useMemo(() => (
    dealProducts
      .filter((p) => p.isClearance)
      .sort((a, b) => b.discountPercent - a.discountPercent)
      .slice(0, CLEARANCE_LIMIT)
  ), [dealProducts]);

  const handleWeeklyExpire = useCallback(() => setWeeklyDeal(null), []);

  const crumbs = [
    { label: t('deals.breadcrumb_home'), href: '/' },
    { label: t('deals.breadcrumb_current') },
  ];

  if (loading) return <PageSpinner />;

  const hasAnyDeals = campaigns.length > 0 || !!weeklyDeal;

  return (
    <div className={s.page}>
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Breadcrumb items={crumbs} className={s.breadcrumbNav} />
        </div>
      </div>

      <div className={s.pageInner}>
        <div className={s.header}>
          <h1 className={s.title}><span className={s.titleFlame} aria-hidden="true">🔥</span> {t('deals.page_title')}</h1>
          <p className={s.subtitle}>{t('deals.page_subtitle')}</p>
        </div>

        {error ? (
          <div className={s.errorState}>
            <AlertTriangle size={32} />
            <p>{error}</p>
            <Button onClick={loadDeals}>{t('wishlist.retry')}</Button>
          </div>
        ) : !hasAnyDeals ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><Flame size={32} /></div>
            <h3>{t('deals.empty_title')}</h3>
            <p>{t('deals.empty_sub')}</p>
            <Button onClick={() => navigate('/products')}>{t('deals.empty_cta')}</Button>
          </div>
        ) : (
          <>
            {heroCampaign && heroProduct && <DealsHero campaign={heroCampaign} product={heroProduct} />}

            {availableCategories.length > 0 && (
              <div className={s.filters}>
                <button className={`${s.filterChip} ${filter === 'all' ? s.filterChipActive : ''}`} onClick={() => setFilter('all')}>
                  {t('deals.filter_all')}
                </button>
                <button className={`${s.filterChip} ${filter === 'under20' ? s.filterChipActive : ''}`} onClick={() => setFilter('under20')}>
                  {t('deals.filter_under20')}
                </button>
                <button className={`${s.filterChip} ${filter === '20to40' ? s.filterChipActive : ''}`} onClick={() => setFilter('20to40')}>
                  {t('deals.filter_20to40')}
                </button>
                <button className={`${s.filterChip} ${filter === 'over40' ? s.filterChipActive : ''}`} onClick={() => setFilter('over40')}>
                  {t('deals.filter_over40')}
                </button>
                {availableCategories.map(({ slug, name }) => (
                  <button
                    key={slug}
                    className={`${s.filterChip} ${filter === `category:${slug}` ? s.filterChipActive : ''}`}
                    onClick={() => setFilter(`category:${slug}`)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {eligibleForHot.length > 0 && (
              <div className={s.section}>
                <div className={`${s.sectionTitle} ${s.sectionTitleHot}`}><Star size={20} /> {t('deals.section_hot')}</div>
                {hotDeals.length === 0 ? (
                  <p className={s.sectionEmpty}>{t('deals.filter_empty')}</p>
                ) : (
                  <div className={s.grid}>
                    {hotDeals.map((p) => <DealProductCard key={p.id} product={p} />)}
                  </div>
                )}
              </div>
            )}

            {weeklyDeal && <WeeklySpotlight deal={weeklyDeal} onExpire={handleWeeklyExpire} />}

            {limitedDeals.length > 0 && (
              <div className={s.section}>
                <div className={`${s.sectionTitle} ${s.sectionTitleUrgent}`}><Hourglass size={20} /> {t('deals.section_limited')}</div>
                <div className={s.grid}>
                  {limitedDeals.map((p) => (
                    <DealProductCard key={p.id} product={p} endDate={p.campaignEndDate} showCountdown />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <ClubBanner />

        {clearanceDeals.length > 0 && (
          <div className={s.section}>
            <div className={`${s.sectionTitle} ${s.sectionTitleClearance}`}><Tag size={20} /> {t('deals.section_clearance')}</div>
            <div className={s.grid}>
              {clearanceDeals.map((p) => (
                <DealProductCard
                  key={p.id}
                  product={p}
                  isClearance
                  clearanceStartingStock={p.clearanceStartingStock}
                />
              ))}
            </div>
          </div>
        )}

        <TrustBadges />
      </div>

      <Footer />
    </div>
  );
}
