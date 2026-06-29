import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, useNavigate, Link }              from 'react-router-dom';
import {
  Heart, ShoppingCart, Loader, Minus, Plus,
  Truck, ShieldCheck, RotateCcw, Lock,
  CheckCircle, CreditCard, GitCompare,
} from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import { reviewService }  from '../../features/reviews/api/review.service';
import { useCart }            from '../../hooks/useCart';
import { useToast }           from '../../hooks/useToast';
import { useAuth }            from '../../hooks/useAuth';
import { useWishlist }        from '../../hooks/useWishlist';
import { useCompare }        from '../../features/compare/context/CompareProvider';
import { useRecentlyViewed }  from '../../hooks/useRecentlyViewed';
import { useTranslation }     from '../../context/LanguageContext';
import StarRating             from '../../components/ui/StarRating/StarRating';
import Breadcrumb             from '../../components/ui/Breadcrumb/Breadcrumb';
import Badge                  from '../../components/ui/Badge/Badge';
import Button                 from '../../components/ui/Button/Button';
import { PageSpinner }        from '../../components/ui/Spinner/Spinner';
import ProductCard            from '../../features/products/components/ProductCard';
import s from './ProductDetailsPage.module.css';

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });

const TRUST_ITEMS = [
  { Icon: Truck,       textKey: 'trust.pdp_shipping' },
  { Icon: RotateCcw,   textKey: 'trust.pdp_returns'  },
  { Icon: ShieldCheck, textKey: 'trust.pdp_warranty'  },
  { Icon: CreditCard,  textKey: 'trust.pdp_secure'   },
];

const KB_SPEC_GROUPS = [
  { titleKey: 'pdp.kbspec_core',     keys: ['Keyboard Type', 'Layout', 'Switch Type', 'Connection', 'Language'] },
  { titleKey: 'pdp.kbspec_lighting', keys: ['Backlight', 'RGB'] },
  { titleKey: 'pdp.kbspec_features', keys: ['Hot Swap', 'Wireless', 'Bluetooth', 'Numpad', 'USB Polling Rate'] },
  { titleKey: 'pdp.kbspec_physical', keys: ['Color', 'Size %', 'Usage', 'Release Year'] },
];

// ── FeatureHighlights ─────────────────────────────────────────────────────────
function FeatureHighlights({ product }) {
  const t     = useTranslation();
  const specs = product.specs || {};
  const tags  = product.tags  || [];

  const items = [
    { key: 'gaming',   icon: '🎮', label: t('pdp.hl_gaming'),   show: tags.includes('gaming')   || specs['Usage'] === 'Gaming' },
    { key: 'office',   icon: '💼', label: t('pdp.hl_office'),   show: tags.includes('office')   || specs['Usage'] === 'Office' },
    { key: 'creator',  icon: '✍️',  label: t('pdp.hl_creator'),  show: tags.includes('creator')  || specs['Usage'] === 'Programming' },
    { key: 'hotswap',  icon: '🔧', label: t('pdp.hl_hotswap'),  show: specs['Hot Swap'] === 'true' },
    { key: 'wireless', icon: '📡', label: t('pdp.hl_wireless'), show: specs['Wireless'] === 'true' || specs['Bluetooth'] === 'true' },
    { key: 'silent',   icon: '🤫', label: t('pdp.hl_silent'),   show: specs['Switch Type'] === 'Silent' },
    { key: 'rgb',      icon: '🌈', label: t('pdp.hl_rgb'),      show: specs['RGB'] === 'true' },
    { key: 'compact',  icon: '📦', label: t('pdp.hl_compact'),  show: ['60%', '65%', '75%'].includes(specs['Layout']) },
    { key: 'fullsize', icon: '⌨️',  label: t('pdp.hl_fullsize'), show: specs['Numpad'] === 'true' },
  ].filter(h => h.show);

  if (!items.length) return null;

  return (
    <div className={s.highlights}>
      {items.map(h => (
        <span key={h.key} className={s.highlight}>
          <span className={s.hlIcon} aria-hidden="true">{h.icon}</span>
          <span className={s.hlLabel}>{h.label}</span>
        </span>
      ))}
    </div>
  );
}

// ── KeyboardSpecsPanel ────────────────────────────────────────────────────────
function KeyboardSpecsPanel({ specs }) {
  const t    = useTranslation();
  const flat = Object.fromEntries(Object.entries(specs));
  const used = new Set();

  const grouped = KB_SPEC_GROUPS.map(g => {
    const rows = g.keys
      .filter(k => flat[k] !== undefined && flat[k] !== 'false' && flat[k] !== '')
      .map(k => [k, flat[k]]);
    rows.forEach(([k]) => used.add(k));
    return { titleKey: g.titleKey, rows };
  }).filter(g => g.rows.length > 0);

  const remaining = Object.entries(flat).filter(([k, v]) => !used.has(k) && v !== 'false' && v !== '');
  if (remaining.length) grouped.push({ titleKey: 'pdp.kbspec_other', rows: remaining });

  return (
    <div className={s.kbSpecGroups}>
      {grouped.map(g => (
        <div key={g.titleKey} className={s.kbSpecGroup}>
          <div className={s.kbSpecGroupTitle}>{t(g.titleKey)}</div>
          <div className={s.specsTable}>
            {g.rows.map(([k, v]) => (
              <div key={k} className={s.specRow}>
                <span className={s.specKey}>{k}</span>
                <span className={s.specVal}>{v === 'true' ? '✓' : v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── FrequentlyBoughtSection ───────────────────────────────────────────────────
function FrequentlyBoughtSection({ currentProduct, companions, onAddAll, adding }) {
  const t = useTranslation();
  if (!companions.length) return null;

  const dp = (p) => p.discountedPrice ?? p.price;
  const total = companions.reduce((sum, p) => sum + dp(p), 0);
  const all   = [currentProduct, ...companions];

  return (
    <section className={s.fbtSection}>
      <h2 className={s.fbtHeading}>{t('product.fbt_heading')}</h2>
      <div className={s.fbtWrap}>
        <div className={s.fbtStrip}>
          {all.map((p, i) => (
            <Fragment key={p._id}>
              <div className={`${s.fbtCard}${i === 0 ? ' ' + s.fbtCardCurrent : ''}`}>
                <div className={s.fbtImgWrap}>
                  <img
                    src={p.images?.[0] || ''}
                    alt={p.name}
                    className={s.fbtImg}
                    loading="lazy"
                  />
                  {i === 0 && <span className={s.fbtCurrentLabel}>{t('product.fbt_current')}</span>}
                </div>
                <div className={s.fbtInfo}>
                  <p className={s.fbtName}>{p.name}</p>
                  <p className={s.fbtPrice}>₪{dp(p).toFixed(2)}</p>
                </div>
              </div>
              {i < all.length - 1 && (
                <span className={s.fbtPlus} aria-hidden="true">+</span>
              )}
            </Fragment>
          ))}
        </div>

        <div className={s.fbtFooter}>
          <div className={s.fbtTotal}>
            <span className={s.fbtTotalLabel}>{t('product.fbt_total_label')}</span>
            <strong className={s.fbtTotalPrice}>₪{total.toFixed(2)}</strong>
          </div>
          <Button onClick={() => onAddAll(companions)} disabled={adding}>
            {adding
              ? <><Loader size={14} className={s.spin} /> {t('product.adding')}</>
              : <><ShoppingCart size={14} /> {t('product.fbt_add_all')}</>
            }
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────
function ReviewCard({ review, currentUserId, onEdit, onDelete }) {
  const t = useTranslation();
  const isOwner = currentUserId && review.user?._id === currentUserId;
  return (
    <div className={s.reviewCard}>
      <div className={s.reviewHeader}>
        <div className={s.reviewMeta}>
          <span className={s.reviewAuthor}>{review.user?.name ?? t('product.user_fallback')}</span>
          {review.isVerifiedPurchase && (
            <span className={s.verifiedBadge}>{t('product.verified_purchase')}</span>
          )}
          <span className={s.reviewDate}>{fmtDate(review.createdAt)}</span>
        </div>
        <StarRating value={review.rating} size={14} />
      </div>
      {review.title && <div className={s.reviewTitle}>{review.title}</div>}
      {review.body  && <div className={s.reviewBody}>{review.body}</div>}
      {isOwner && (
        <div className={s.reviewActions}>
          <button className={s.actionBtn} onClick={() => onEdit(review)}>{t('product.review_edit')}</button>
          <button className={`${s.actionBtn} ${s.actionBtnDanger}`} onClick={() => onDelete(review._id)}>{t('product.review_delete')}</button>
        </div>
      )}
    </div>
  );
}

// ── WriteReviewForm ───────────────────────────────────────────────────────────
function WriteReviewForm({ productId, initial, onSuccess, onCancel }) {
  const { toast } = useToast();
  const t         = useTranslation();
  const isEdit    = !!initial;

  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [title,  setTitle]  = useState(initial?.title  ?? '');
  const [body,   setBody]   = useState(initial?.body   ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!rating) { toast.error(t('product.toast_rate_required')); return; }
    setSaving(true);
    try {
      const dto    = { rating, ...(title.trim() && { title: title.trim() }), ...(body.trim() && { body: body.trim() }) };
      const review = isEdit
        ? await reviewService.update(initial._id, dto)
        : await reviewService.create(productId, dto);
      toast.success(isEdit ? t('product.toast_review_updated') : t('product.toast_review_saved'));
      onSuccess(review, isEdit);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.writeReviewBox}>
      <div className={s.writeReviewTitle}>{isEdit ? t('product.review_edit_title') : t('product.review_write')}</div>
      <StarRating value={rating} onChange={setRating} size={28} disabled={saving} />
      <div className={s.reviewFormField}>
        <label className={s.reviewFormLabel}>{t('product.review_title_label')}</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder={t('product.review_title_ph')}
          disabled={saving}
        />
      </div>
      <div className={s.reviewFormField}>
        <label className={s.reviewFormLabel}>{t('product.review_body_label')}</label>
        <textarea
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder={t('product.review_body_ph')}
          disabled={saving}
          style={{ resize: 'vertical' }}
        />
      </div>
      <div className={s.reviewFormRow}>
        {onCancel && <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>{t('btn.cancel')}</Button>}
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? t('product.review_saving') : isEdit ? t('product.review_update') : t('product.review_submit')}
        </Button>
      </div>
    </div>
  );
}

// ── ReviewsSection ────────────────────────────────────────────────────────────
function ReviewsSection({ productId, onReviewAction }) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const t         = useTranslation();

  const [reviews,     setReviews]     = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);

  const fetchReviews = useCallback(async (page = 1) => {
    const setter = page === 1 ? setLoadingList : setLoadingMore;
    setter(true);
    try {
      const res = await reviewService.list(productId, { page, limit: 10 });
      setMeta(res.meta);
      setReviews((prev) => page === 1 ? (res.data?.reviews ?? []) : [...prev, ...(res.data?.reviews ?? [])]);
    } catch {
      // non-fatal
    } finally {
      setter(false);
    }
  }, [productId]);

  useEffect(() => { fetchReviews(1); }, [fetchReviews]);

  useEffect(() => {
    if (authLoading || !user) { setEligibility(null); return; }
    reviewService.checkEligibility(productId)
      .then(setEligibility)
      .catch(() => setEligibility(null));
  }, [productId, user, authLoading]);

  const withUser = (review) => ({
    ...review,
    user: { _id: user._id, name: user.name },
  });

  const handleNewReview = (review) => {
    setReviews((prev) => [withUser(review), ...prev]);
    setEligibility((e) => ({ ...e, canReview: false, hasReviewed: true, userReview: review, reason: 'already_reviewed' }));
    onReviewAction?.();
  };

  const handleUpdatedReview = (review) => {
    setReviews((prev) => prev.map((r) => (r._id === review._id ? withUser(review) : r)));
    setEligibility((e) => ({ ...e, userReview: review }));
    setEditTarget(null);
    onReviewAction?.();
  };

  const handleDelete = async (reviewId) => {
    try {
      await reviewService.remove(reviewId);
      setReviews((prev) => prev.filter((r) => r._id !== reviewId));
      setEligibility((e) => ({ ...e, canReview: true, hasReviewed: false, userReview: null, reason: 'eligible' }));
      toast.info(t('product.toast_review_deleted'));
      onReviewAction?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const canLoadMore = meta && meta.page < meta.pages;

  return (
    <div className={s.reviewsInner}>
      {!authLoading && (
        <>
          {!user && (
            <div className={s.gateBox}>
              <Link to="/login">{t('product.review_login')}</Link> {t('product.review_login_prompt')}
            </div>
          )}

          {user && eligibility && (
            <>
              {eligibility.canReview && !editTarget && (
                <WriteReviewForm productId={productId} onSuccess={handleNewReview} />
              )}
              {eligibility.hasReviewed && eligibility.userReview && editTarget?._id === eligibility.userReview._id && (
                <WriteReviewForm
                  productId={productId}
                  initial={eligibility.userReview}
                  onSuccess={(r) => handleUpdatedReview(r)}
                  onCancel={() => setEditTarget(null)}
                />
              )}
              {eligibility.reason === 'not_purchased' && (
                <div className={s.gateBox}>{t('product.review_gate')}</div>
              )}
            </>
          )}
        </>
      )}

      {loadingList ? (
        <div className={s.emptyReviews}>{t('product.reviews_loading')}</div>
      ) : reviews.length === 0 ? (
        <div className={s.emptyReviews}>{t('product.reviews_empty')}</div>
      ) : (
        <>
          <div className={s.reviewsList}>
            {reviews.map((r) => (
              <ReviewCard
                key={r._id}
                review={r}
                currentUserId={user?._id}
                onEdit={(rev) => setEditTarget(rev)}
                onDelete={handleDelete}
              />
            ))}
          </div>
          {canLoadMore && (
            <div className={s.loadMore}>
              <Button variant="secondary" size="sm" onClick={() => fetchReviews(meta.page + 1)} disabled={loadingMore}>
                {loadingMore ? t('product.loading') : t('product.load_more_reviews')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── RecommendationsSection ────────────────────────────────────────────────────
function RecommendationsSection({ related, categoryName }) {
  const t = useTranslation();
  if (!related.length) return null;
  const heading = categoryName
    ? `${t('product.recs_similar')} ${categoryName}`
    : t('product.recs_heading');
  return (
    <div className={s.recsSection}>
      <h2 className={s.recsHeading}>{heading}</h2>
      <div className={s.recsGrid}>
        {related.slice(0, 4).map(p => <ProductCard key={p._id} product={p} />)}
      </div>
    </div>
  );
}

// ── ProductDetailsPage ────────────────────────────────────────────────────────
export default function ProductPage() {
  const { slug }                 = useParams();
  const { addItem }              = useCart();
  const { isInWishlist, toggle } = useWishlist();
  const { items: compareIds, addProduct: addToCompare } = useCompare();
  const { toast }                = useToast();
  const { track }                = useRecentlyViewed();
  const t                        = useTranslation();
  const navigate                 = useNavigate();

  const [product,    setProduct]    = useState(null);
  const [qty,        setQty]        = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [fbtAdding,  setFbtAdding]  = useState(false);
  const [imgIdx,     setImgIdx]     = useState(0);
  const [imgKey,     setImgKey]     = useState(0);
  const [activeTab,  setActiveTab]  = useState('description');
  const [recs,       setRecs]       = useState({ related: [], alsoBought: [] });

  useEffect(() => {
    setLoading(true);
    productService.getBySlug(slug)
      .then(p => { setProduct(p); setImgIdx(0); setImgKey(0); setRecs({ related: [], alsoBought: [] }); })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [slug, navigate]);

  const refreshProduct = useCallback(() => {
    productService.getBySlug(slug).then(setProduct).catch(() => {});
  }, [slug]);

  useEffect(() => { if (product) track(product); }, [product, track]);

  useEffect(() => {
    if (!product?._id) return;
    productService.getRecommendations(product._id)
      .then(setRecs)
      .catch(() => {});
  }, [product?._id]);

  useEffect(() => {
    if (window.location.hash === '#reviews') setActiveTab('reviews');
  }, []);

  const goToImg = (i) => { setImgIdx(i); setImgKey(k => k + 1); };

  const handleAddToCart = async () => {
    setAdding(true);
    try {
      await addItem(product._id, qty, {
        name:          product.name,
        price:         displayPrice,
        image:         images[imgIdx] ?? '',
        originalPrice: hasDiscount ? strikethroughPrice : null,
      });
      toast.success(`${qty} × ${product.name} ${t('product.added_to_cart_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setAdding(false);
    }
  };

  const handleAddFBT = useCallback(async (companions) => {
    setFbtAdding(true);
    try {
      for (const p of companions) {
        const dp = p.discountedPrice ?? p.price;
        await addItem(p._id, 1, {
          name:          p.name,
          price:         dp,
          image:         p.images?.[0] ?? '',
          originalPrice: p.discountedPrice ? p.price : null,
        });
      }
      toast.success(`${companions.length} ${t('product.items_added_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setFbtAdding(false);
    }
  }, [addItem, toast, t]);

  if (loading) return <PageSpinner />;
  if (!product) return null;

  const images              = product.images?.length ? product.images : [];
  const hasCampaignDiscount = product.discountedPrice != null && product.discountedPrice < product.price;
  const hasStaticDiscount   = !hasCampaignDiscount && product.compareAtPrice != null && product.compareAtPrice > product.price;
  const hasDiscount         = hasCampaignDiscount || hasStaticDiscount;
  const displayPrice        = hasCampaignDiscount ? product.discountedPrice : product.price;
  const strikethroughPrice  = hasCampaignDiscount ? product.price : product.compareAtPrice;
  const discount            = hasCampaignDiscount ? product.discountPercent : null;
  const savings             = hasDiscount ? (strikethroughPrice - displayPrice) : null;
  const hasSpecs            = product.specs && Object.keys(product.specs).length > 0;
  const isKbCategory        = product.category?.slug === 'keyboards';
  const wished              = isInWishlist(product._id);

  const isWireless   = product.specs?.['Wireless'] === 'true' || product.specs?.['Bluetooth'] === 'true';
  const isHotSwap    = product.specs?.['Hot Swap'] === 'true';
  const isTrending   = product.tags?.includes('trending');
  const isBestSeller = product.tags?.includes('best-seller');

  const crumbs = [
    { label: t('product.breadcrumb_home'),  href: '/' },
    { label: t('product.breadcrumb_store'), href: '/products' },
    ...(product.category ? [{ label: product.category.name, href: `/category/${product.category.slug}` }] : []),
    { label: product.name },
  ];

  const scrollToReviews = (e) => {
    e.preventDefault();
    setActiveTab('reviews');
    document.getElementById('pdp-tabs')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={s.page}>
      <Breadcrumb items={crumbs} className={s.breadcrumb} />

      {/* ── Gallery + Buy Box ── */}
      <div className={s.layout}>

        {/* Gallery */}
        <div className={s.gallery}>
          <div className={s.mainImgWrap}>
            <img
              key={imgKey}
              className={s.mainImg}
              src={images[imgIdx]}
              alt={product.name}
            />
            {discount && (
              <div className={s.imgDiscountBadge}>
                <Badge variant="error">−{discount}%</Badge>
              </div>
            )}
            {product.stock === 0 && (
              <div className={s.outOfStockOverlay}>{t('product.out_of_stock')}</div>
            )}
          </div>

          {images.length > 1 && (
            <div className={s.thumbs}>
              {images.map((img, i) => (
                <button
                  key={i}
                  className={`${s.thumb}${i === imgIdx ? ' ' + s.thumbActive : ''}`}
                  onClick={() => goToImg(i)}
                  aria-label={`${t('product.image_prefix')} ${i + 1}`}
                  aria-current={i === imgIdx}
                >
                  <img src={img} alt={`${product.name} ${i + 1}`} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy Box */}
        <div className={s.buyBox}>
          <div className={s.badgesRow}>
            {product.category && <Badge variant="default">{product.category.name}</Badge>}
            {product.isFeatured && <Badge variant="primary">{t('product.featured_badge')}</Badge>}
            {discount && <Badge variant="error">−{discount}%</Badge>}
            {isBestSeller && <span className={`${s.signalBadge} ${s.sigSeller}`}>{t('product.badge_bestseller')}</span>}
            {isTrending   && <span className={`${s.signalBadge} ${s.sigTrending}`}>{t('product.badge_trending')}</span>}
            {isHotSwap    && <span className={`${s.signalBadge} ${s.sigHotswap}`}>{t('product.badge_hotswap')}</span>}
            {isWireless   && <span className={`${s.signalBadge} ${s.sigWireless}`}>{t('product.badge_wireless')}</span>}
          </div>

          {product.brand && <div className={s.brand}>{product.brand}</div>}

          <h1 className={s.name}>{product.name}</h1>

          {product.ratings?.count > 0 && (
            <div className={s.ratingRow}>
              <StarRating value={product.ratings.average} size={16} />
              <span className={s.ratingNum}>{product.ratings.average.toFixed(1)}</span>
              <a href="#pdp-tabs" className={s.ratingLink} onClick={scrollToReviews}>
                {product.ratings.count} {t('product.reviews_label')}
              </a>
            </div>
          )}

          <div className={s.priceBlock}>
            <span className={s.price}>₪{displayPrice.toFixed(2)}</span>
            {hasDiscount && (
              <>
                <span className={s.compareAt}>₪{strikethroughPrice.toFixed(2)}</span>
                <span className={s.savingBadge}>{t('product.saved_prefix')} ₪{savings.toFixed(2)}</span>
              </>
            )}
          </div>

          {(product.shortDescription || product.description) && (
            <p className={s.shortDesc}>
              {product.shortDescription || product.description?.slice(0, 180)}
            </p>
          )}

          {isKbCategory && <FeatureHighlights product={product} />}

          {/* Stock indicator */}
          <div className={s.stockRow}>
            {product.stock > 10 ? (
              <><span className={`${s.stockDot} ${s.dotGreen}`} /><span className={s.stockText}>{t('product.in_stock')} ({product.stock} {t('product.available')})</span></>
            ) : product.stock > 0 ? (
              <><span className={`${s.stockDot} ${s.dotOrange}`} /><span className={`${s.stockText} ${s.stockLow}`}>{t('product.low_stock_prefix')} {product.stock} {t('product.low_stock_suffix')}</span></>
            ) : (
              <><span className={`${s.stockDot} ${s.dotRed}`} /><span className={`${s.stockText} ${s.stockNone}`}>{t('product.out_of_stock')}</span></>
            )}
          </div>

          {/* Qty row */}
          <div className={s.qtyRow}>
            <span className={s.qtyLabel}>{t('product.qty_label') || 'כמות:'}</span>
            <div className={s.qtyCtrl}>
              <button
                className={s.qtyBtn}
                onClick={() => setQty(q => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label={t('product.decrease_qty')}
              ><Minus size={14} /></button>
              <span className={s.qtyVal}>{qty}</span>
              <button
                className={s.qtyBtn}
                onClick={() => setQty(q => Math.min(product.stock, q + 1))}
                disabled={qty >= product.stock}
                aria-label={t('product.increase_qty')}
              ><Plus size={14} /></button>
            </div>
          </div>

          {/* CTA buttons */}
          <div className={s.addRow}>
            <button
              className={s.addCartBtn}
              onClick={handleAddToCart}
              disabled={adding || product.stock === 0}
            >
              {adding
                ? <><Loader size={17} className={s.spin} /> {t('product.adding')}</>
                : product.stock === 0
                ? t('product.out_of_stock')
                : <><ShoppingCart size={17} /> {t('product.add_to_cart_btn')}</>
              }
            </button>
            <button
              className={s.buyNowBtn}
              onClick={() => { handleAddToCart(); navigate('/cart'); }}
              disabled={adding || product.stock === 0}
            >
              <CreditCard size={17} /> {t('product.buy_now') || 'קנה עכשיו'}
            </button>
          </div>

          {/* Secondary actions: compare + wishlist */}
          <div className={s.secondaryActions}>
            <button
              className={s.secondaryBtn}
              onClick={() => {
                if (compareIds.includes(String(product._id))) {
                  navigate('/compare');
                } else if (compareIds.length >= 4) {
                  toast.info('ניתן להשוות עד 4 מוצרים');
                } else {
                  addToCompare(String(product._id));
                  toast.success('המוצר נוסף להשוואה');
                }
              }}
            >
              <GitCompare size={15} /> {t('product.compare') || 'השוואה'}
            </button>
            <button
              className={`${s.secondaryBtn}${wished ? ' ' + s.secondaryBtnActive : ''}`}
              onClick={() => toggle(product._id)}
              aria-label={wished ? t('product.remove_from_wishlist') : t('product.add_to_wishlist')}
              aria-pressed={wished}
            >
              <Heart size={15} fill={wished ? '#f43f5e' : 'none'} stroke={wished ? '#f43f5e' : 'currentColor'} /> {t('product.wishlist_btn') || 'מועדפים'}
            </button>
          </div>

          {/* Trust badges */}
          <div className={s.trustRow}>
            {TRUST_ITEMS.map(({ Icon, textKey }) => (
              <div key={textKey} className={s.trustItem}>
                <Icon size={14} className={s.trustIcon} aria-hidden="true" />
                <span>{t(textKey)}</span>
              </div>
            ))}
          </div>

          {product.tags?.length > 0 && (
            <div className={s.tagRow}>
              {product.tags.map(tag => (
                <span key={tag} className={s.tag}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Frequently bought together ── */}
      {recs.alsoBought.length > 0 && (
        <FrequentlyBoughtSection
          currentProduct={product}
          companions={recs.alsoBought.slice(0, 2)}
          onAddAll={handleAddFBT}
          adding={fbtAdding}
        />
      )}

      {/* ── Tabs: Description / Specs / Reviews ── */}
      <div className={s.tabsSection} id="pdp-tabs">
        <div className={s.tabList} role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'description'}
            className={`${s.tab}${activeTab === 'description' ? ' ' + s.tabActive : ''}`}
            onClick={() => setActiveTab('description')}
          >
            {t('product.tab_description')}
          </button>

          {hasSpecs && (
            <button
              role="tab"
              aria-selected={activeTab === 'specs'}
              className={`${s.tab}${activeTab === 'specs' ? ' ' + s.tabActive : ''}`}
              onClick={() => setActiveTab('specs')}
            >
              {t('product.tab_specs')}
            </button>
          )}

          <button
            role="tab"
            aria-selected={activeTab === 'reviews'}
            className={`${s.tab}${activeTab === 'reviews' ? ' ' + s.tabActive : ''}`}
            onClick={() => setActiveTab('reviews')}
            id="reviews"
          >
            {t('product.tab_reviews')}
            {product.ratings?.count > 0 && (
              <span className={s.tabBadge}>{product.ratings.count}</span>
            )}
          </button>
        </div>

        <div className={s.tabPanels}>
          <div
            role="tabpanel"
            className={`${s.tabPanel}${activeTab === 'description' ? ' ' + s.tabPanelActive : ''}`}
          >
            <p className={s.description}>
              {product.description || product.shortDescription || '—'}
            </p>
          </div>

          {hasSpecs && (
            <div
              role="tabpanel"
              className={`${s.tabPanel}${activeTab === 'specs' ? ' ' + s.tabPanelActive : ''}`}
            >
              {isKbCategory
                ? <KeyboardSpecsPanel specs={product.specs} />
                : (
                  <div className={s.specsTable}>
                    {Object.entries(product.specs).map(([k, v]) => (
                      <div key={k} className={s.specRow}>
                        <span className={s.specKey}>{k}</span>
                        <span className={s.specVal}>{v}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          <div
            role="tabpanel"
            className={`${s.tabPanel}${activeTab === 'reviews' ? ' ' + s.tabPanelActive : ''}`}
          >
            <ReviewsSection productId={product._id} onReviewAction={refreshProduct} />
          </div>
        </div>
      </div>

      {/* ── Related recommendations ── */}
      <RecommendationsSection related={recs.related} categoryName={product.category?.name} />
    </div>
  );
}
