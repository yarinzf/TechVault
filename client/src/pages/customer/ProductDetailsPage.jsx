import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, List, MessageSquare, Grid3x3, Clock, ShoppingBag } from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import { useCart } from '../../hooks/useCart';
import { useToast } from '../../hooks/useToast';
import { useWishlist } from '../../hooks/useWishlist';
import { useCompare, MAX_ITEMS as COMPARE_MAX_ITEMS } from '../../features/compare/context/CompareProvider';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useLanguage } from '../../context/LanguageContext';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import Footer from '../../components/layout/customer/Footer';
import ProductGallery from '../../features/products/components/ProductDetails/ProductGallery';
import ProductBuyBox from '../../features/products/components/ProductDetails/ProductBuyBox';
import ProductHighlightsBar from '../../features/products/components/ProductDetails/ProductHighlightsBar';
import ProductSectionCard from '../../features/products/components/ProductDetails/ProductSectionCard';
import ProductDescription from '../../features/products/components/ProductDetails/ProductDescription';
import ProductSpecifications from '../../features/products/components/ProductDetails/ProductSpecifications';
import ProductReviewsPanel from '../../features/products/components/ProductDetails/ProductReviewsPanel';
import RelatedProducts from '../../features/products/components/ProductDetails/RelatedProducts';
import RecentlyViewedStrip from '../../features/products/components/ProductDetails/RecentlyViewedStrip';
import FrequentlyBoughtTogether from '../../features/products/components/ProductDetails/FrequentlyBoughtTogether';
import { getProductPricing } from '../../features/products/utils/pricing';
import { getProductHighlights } from '../../features/products/utils/highlights';
import { groupProductSpecs } from '../../features/products/utils/specGroups';
import { getCategoryLabel } from '../../features/products/utils/categoryLabels';
import s from './ProductDetailsPage.module.css';

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const { addItem } = useCart();
  const { isInWishlist, toggle: toggleWishlist } = useWishlist();
  const { items: compareIds, addProduct: addToCompare, isComparing } = useCompare();
  const { items: recentlyViewed, track } = useRecentlyViewed();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [fbtAdding, setFbtAdding] = useState(false);
  const [recs, setRecs] = useState({ related: [], alsoBought: [] });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    productService.getBySlug(slug).then((p) => {
      if (cancelled) return;
      if (!p) { setNotFound(true); setProduct(null); return; }
      setProduct(p);
      setQty(1);
      setRecs({ related: [], alsoBought: [] });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const refreshProduct = useCallback(() => {
    productService.getBySlug(slug).then((p) => { if (p) setProduct(p); }).catch(() => {});
  }, [slug]);

  useEffect(() => { if (product) track(product); }, [product, track]);

  useEffect(() => {
    if (!product?._id) return;
    productService.getRecommendations(product._id).then(setRecs).catch(() => {});
  }, [product?._id]);

  if (loading) return <PageSpinner />;

  if (notFound) {
    return (
      <div className={s.notFound}>
        <p className={s.notFoundTitle}>{t('product.not_found_title')}</p>
        <p className={s.notFoundText}>{t('product.not_found_text')}</p>
        <button className={s.notFoundBtn} onClick={() => navigate('/products')}>
          {t('product.not_found_cta')}
        </button>
      </div>
    );
  }

  if (!product) return null;

  const pricing = getProductPricing(product);
  const wished = isInWishlist(product._id);
  const comparing = isComparing(product._id);
  const highlights = getProductHighlights(product, 6);
  const hasDescription = !!(product.description || product.shortDescription) || highlights.length > 0;
  const specGroups = groupProductSpecs(product.specs, product.category?.slug);
  const recentOthers = recentlyViewed.filter((i) => i.productId !== String(product._id));

  const categoryLabel = getCategoryLabel(product.category, language);
  const crumbs = [
    { label: t('product.breadcrumb_home'), href: '/' },
    { label: t('product.breadcrumb_store'), href: '/products' },
    ...(product.category ? [{ label: categoryLabel, href: `/category/${product.category.slug}` }] : []),
    { label: product.name },
  ];

  const handleAddToCart = async () => {
    setAdding(true);
    try {
      await addItem(product._id, qty, {
        name: product.name,
        price: pricing.price,
        image: product.images?.[0] ?? '',
        originalPrice: pricing.hasDiscount ? pricing.oldPrice : null,
      });
      toast.success(`${qty} × ${product.name} ${t('product.added_to_cart_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    setBuying(true);
    try {
      await addItem(product._id, qty, {
        name: product.name,
        price: pricing.price,
        image: product.images?.[0] ?? '',
        originalPrice: pricing.hasDiscount ? pricing.oldPrice : null,
      });
      navigate('/checkout');
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setBuying(false);
    }
  };

  const handleAddFBT = async (companions) => {
    setFbtAdding(true);
    try {
      for (const p of companions) {
        const dp = p.discountedPrice ?? p.price;
        await addItem(p._id, 1, {
          name: p.name,
          price: dp,
          image: p.images?.[0] ?? '',
          originalPrice: p.discountedPrice ? p.price : null,
        });
      }
      toast.success(`${companions.length} ${t('product.items_added_toast')}`);
    } catch (err) {
      toast.error(err.message || t('product.cannot_add_toast'));
    } finally {
      setFbtAdding(false);
    }
  };

  const handleToggleCompare = () => {
    if (comparing) { navigate('/compare'); return; }
    if (compareIds.length >= COMPARE_MAX_ITEMS) {
      toast.info(t('product.compare_limit_toast').replace('{max}', COMPARE_MAX_ITEMS));
      return;
    }
    addToCompare(product._id);
    toast.success(t('product.compare_added_toast'));
  };

  const scrollToReviews = (e) => {
    e.preventDefault();
    document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={s.page}>
      <Breadcrumb items={crumbs} className={s.breadcrumb} />

      <div className={s.hero}>
        <ProductGallery
          product={product}
          discountPercent={pricing.hasDiscount ? pricing.discountPercent : null}
          outOfStock={product.stock === 0}
        />
        <ProductBuyBox
          product={product}
          qty={qty}
          onQtyChange={setQty}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          adding={adding}
          buying={buying}
          wished={wished}
          onToggleWishlist={() => toggleWishlist(product._id)}
          isComparing={comparing}
          onToggleCompare={handleToggleCompare}
          onScrollToReviews={scrollToReviews}
        />
      </div>

      <div className={s.sections}>
        <ProductHighlightsBar product={product} />

        {recs.alsoBought.length > 0 && (
          <ProductSectionCard icon={ShoppingBag} label={t('product.section_fbt_label')} heading={t('product.fbt_heading')}>
            <FrequentlyBoughtTogether
              currentProduct={product}
              companions={recs.alsoBought.slice(0, 2)}
              onAddAll={handleAddFBT}
              adding={fbtAdding}
            />
          </ProductSectionCard>
        )}

        {hasDescription && (
          <ProductSectionCard icon={FileText} label={t('product.section_about_label')} heading={t('product.section_description_heading')}>
            <ProductDescription product={product} />
          </ProductSectionCard>
        )}

        {specGroups.length > 0 && (
          <ProductSectionCard icon={List} label={t('product.section_specs_label')} heading={t('product.section_specs_heading')}>
            <ProductSpecifications groups={specGroups} />
          </ProductSectionCard>
        )}

        <ProductSectionCard icon={MessageSquare} label={t('product.section_reviews_label')} heading={t('product.section_reviews_heading')} id="pdp-reviews">
          <ProductReviewsPanel
            productId={product._id}
            average={product.ratings?.average ?? 0}
            count={product.ratings?.count ?? 0}
            onReviewAction={refreshProduct}
          />
        </ProductSectionCard>

        {recs.related.length > 0 && (
          <ProductSectionCard icon={Grid3x3} label={t('product.section_related_label')} heading={categoryLabel ? `${t('product.recs_similar')} ${categoryLabel}` : t('product.recs_heading')} compact>
            <RelatedProducts products={recs.related} />
          </ProductSectionCard>
        )}

        {recentOthers.length > 0 && (
          <ProductSectionCard icon={Clock} label={t('product.section_recently_label')} heading={t('product.recently_viewed_heading')} compact>
            <RecentlyViewedStrip items={recentlyViewed} excludeProductId={product._id} />
          </ProductSectionCard>
        )}
      </div>

      <Footer />
    </div>
  );
}
