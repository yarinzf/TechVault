import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, X, SearchX, ShieldCheck, ChevronDown } from 'lucide-react';
import { productService } from '../../features/products/api/product.service';
import ProductCard from '../../features/products/components/ProductCard';
import {
  CATEGORY_BRANDS,
  CATEGORY_SPEC_PARAMS,
  CATEGORY_FILTER_GROUPS,
} from '../../constants/categoryFilters';
import s from './CatalogPage.module.css';

const SORT_OPTIONS = [
  { value: '',           label: 'פופולרי' },
  { value: 'popularity', label: 'הכי פופולרי' },
  { value: 'price_asc',  label: 'מחיר: נמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: גבוה לנמוך' },
  { value: 'rating',     label: 'דירוג' },
  { value: 'name',       label: 'שם' },
];

const PRICE_MIN = 0;
const PRICE_MAX = 8000;
const LIMIT = 24;
const SHOW_MORE_THRESHOLD = 5;   // show N items before "show more" button

const ALL_SPEC_PARAM_KEYS = [...new Set(Object.values(CATEGORY_SPEC_PARAMS).flat())];

// Exact match of Sapir's filter-group-arrow SVG
function ArrowSvg({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Native dual-range price slider — exact match of Sapir's price-range-track structure
function PriceRangeSlider({ min, max, step, value, onChange, onCommit }) {
  const [lo, hi] = value;
  const fillLeft  = ((lo - min) / (max - min)) * 100;
  const fillWidth = ((hi - lo)  / (max - min)) * 100;

  const handleMin = (e) => {
    const v = Math.min(Number(e.target.value), hi - step);
    onChange([v, hi]);
  };
  const handleMax = (e) => {
    const v = Math.max(Number(e.target.value), lo + step);
    onChange([lo, v]);
  };

  const fmt = (v) => v >= max ? `₪${max.toLocaleString()}+` : `₪${v.toLocaleString()}`;

  return (
    <div className={s.priceSliderWrap}>
      {/* Labels: min on right (RTL), max on left — matching Sapir's row-reverse layout */}
      <div className={s.priceSliderLabels}>
        <span>{fmt(lo)}</span>
        <span>{fmt(hi)}</span>
      </div>
      <div
        className={s.priceRangeTrack}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
      >
        <div
          className={s.priceRangeFill}
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        <input
          type="range"
          className={s.priceSlider}
          min={min} max={max} step={step}
          value={lo}
          onChange={handleMin}
        />
        <input
          type="range"
          className={s.priceSlider}
          min={min} max={max} step={step}
          value={hi}
          onChange={handleMax}
        />
      </div>
    </div>
  );
}

const BRAND_ICON_SLUGS = {
  'acer': 'acer',
  'amazon': 'amazon',
  'amd': 'amd',
  'apple': 'apple',
  'asus': 'asus',
  'beats': 'beats',
  'benq': 'benq',
  'corsair': 'corsair',
  'dell': 'dell',
  'google': 'google',
  'hp': 'hp',
  'intel': 'intel',
  'jbl': 'jbl',
  'kingston': 'kingston',
  'lenovo': 'lenovo',
  'lg': 'lg',
  'logitech': 'logitech',
  'microsoft': 'microsoft',
  'msi': 'msi',
  'nintendo': 'nintendo',
  'nvidia': 'nvidia',
  'oneplus': 'oneplus',
  'philips': 'philips',
  'razer': 'razer',
  'samsung': 'samsung',
  'seagate': 'seagate',
  'sennheiser': 'sennheiser',
  'sony': 'sony',
  'steelseries': 'steelseries',
  'synology': 'synology',
  'tplink': 'tplink',
  'ubiquiti': 'ubiquiti',
  'westerndigital': 'westerndigital',
  'xiaomi': 'xiaomi',
};

function BrandCard({ name, selected, onClick }) {
  const [imgError, setImgError] = useState(false);
  const key = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  const slug = BRAND_ICON_SLUGS[key] || (key === 'wd' ? 'westerndigital' : null);

  return (
    <div
      className={`${s.brandItem}${selected ? ' ' + s.brandItemSelected : ''}`}
      onClick={onClick}
    >
      <div className={s.brandLogo}>
        {slug && !imgError ? (
          <img
            src={`https://cdn.simpleicons.org/${slug}/ffffff`}
            alt=""
            onError={() => setImgError(true)}
          />
        ) : (
          <span className={s.brandLogoFallback}>{name}</span>
        )}
      </div>
      <div className={s.brandName}>{name}</div>
    </div>
  );
}

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categorySlug: routeCategorySlug } = useParams();
  const navigate = useNavigate();

  const [products,      setProducts]      = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [meta,          setMeta]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error,         setError]         = useState(null);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [internalPage,  setInternalPage]  = useState(1);
  const [openGroups,    setOpenGroups]    = useState({});
  // tracks which filter groups have their "show more" expanded
  const [expandedGroups, setExpandedGroups] = useState({});

  const categorySlug = routeCategorySlug || searchParams.get('category') || '';
  const category     = categorySlug;
  const sort         = searchParams.get('sort')     || '';
  const search       = searchParams.get('search')   || '';
  const brand        = searchParams.get('brand')    || '';
  const minPrice     = searchParams.get('minPrice') || '';
  const maxPrice     = searchParams.get('maxPrice') || '';
  const inStock      = searchParams.get('inStock')  === 'true';
  const onSale       = searchParams.get('onSale')   === 'true';
  const featured     = searchParams.get('featured') === 'true';

  const [priceRange, setPriceRange] = useState([
    minPrice ? Number(minPrice) : PRICE_MIN,
    maxPrice ? Number(maxPrice) : PRICE_MAX,
  ]);

  useEffect(() => {
    setPriceRange([
      minPrice ? Number(minPrice) : PRICE_MIN,
      maxPrice ? Number(maxPrice) : PRICE_MAX,
    ]);
  }, [minPrice, maxPrice]);

  const applyFilter = useCallback((changes) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => {
        if (v !== '' && v !== false && v !== null && v !== undefined) next.set(k, String(v));
        else next.delete(k);
      });
      return next;
    });
  }, [setSearchParams]);

  const clearAll = () => navigate('/products');

  const handleCategoryChange = (newSlug) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('category');
    ALL_SPEC_PARAM_KEYS.forEach(k => nextParams.delete(k));
    const qs = nextParams.toString();
    navigate(`${newSlug ? `/category/${newSlug}` : '/products'}${qs ? `?${qs}` : ''}`);
  };

  const prevSlugRef = useRef(categorySlug);
  useEffect(() => {
    const prevSlug = prevSlugRef.current;
    prevSlugRef.current = categorySlug;
    if (prevSlug === categorySlug) return;
    const keepParams = new Set(CATEGORY_SPEC_PARAMS[categorySlug] || []);
    const clear = {};
    (CATEGORY_SPEC_PARAMS[prevSlug] || []).forEach(k => {
      if (!keepParams.has(k) && searchParams.has(k)) clear[k] = '';
    });
    if (Object.keys(clear).length > 0) applyFilter(clear);
  }, [categorySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitPriceRange = () => {
    const [lo, hi] = priceRange;
    applyFilter({
      minPrice: lo > PRICE_MIN ? lo : '',
      maxPrice: hi < PRICE_MAX ? hi : '',
    });
  };

  useEffect(() => {
    productService.getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setInternalPage(1);
    setProducts([]);
    setLoading(true);
    setError(null);

    const params = { page: 1, limit: LIMIT };
    if (sort)     params.sort     = sort;
    if (search)   params.search   = search;
    if (category) params.category = category;
    if (brand)    params.brand    = brand;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (inStock)  params.inStock  = 'true';
    if (onSale)   params.onSale   = 'true';
    if (featured) params.featured = 'true';
    ALL_SPEC_PARAM_KEYS.forEach(k => {
      const v = searchParams.get(k);
      if (v) params[k] = v;
    });

    productService.list(params)
      .then(({ products: p, meta: m }) => { setProducts(p); setMeta(m); })
      .catch(err => setError(err.message || 'שגיאה בטעינת מוצרים'))
      .finally(() => setLoading(false));
  }, [category, sort, search, brand, minPrice, maxPrice, inStock, onSale, featured,
      searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMore = products.length < (meta?.total ?? 0);

  const loadMore = async () => {
    const nextPage = internalPage + 1;
    setIsLoadingMore(true);
    const params = { page: nextPage, limit: LIMIT };
    if (sort)     params.sort     = sort;
    if (search)   params.search   = search;
    if (category) params.category = category;
    if (brand)    params.brand    = brand;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (inStock)  params.inStock  = 'true';
    if (onSale)   params.onSale   = 'true';
    if (featured) params.featured = 'true';
    ALL_SPEC_PARAM_KEYS.forEach(k => {
      const v = searchParams.get(k);
      if (v) params[k] = v;
    });
    try {
      const { products: more, meta: newMeta } = await productService.list(params);
      setProducts(prev => [...prev, ...more]);
      setMeta(newMeta);
      setInternalPage(nextPage);
    } catch {
      // silent
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ── Collapse / expand group header ───────────────────────────────────────────
  const toggleGroup = (key) =>
    setOpenGroups(prev => ({ ...prev, [key]: prev[key] !== false ? false : undefined }));
  const isGroupOpen = (key) => openGroups[key] !== false;

  // ── Show-more per group ───────────────────────────────────────────────────────
  const toggleExpand = (key, e) => {
    e.stopPropagation();
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const isExpanded = (key) => !!expandedGroups[key];

  // ── Active filter counts ──────────────────────────────────────────────────────
  const activeCategorySpecCount = (CATEGORY_SPEC_PARAMS[categorySlug] || [])
    .filter(k => { const v = searchParams.get(k); return !!v && v !== 'false'; }).length;

  const activeFilterCount =
    [category, brand, minPrice, maxPrice, inStock || null, onSale || null, featured || null]
      .filter(Boolean).length + activeCategorySpecCount;

  const categoryName     = category
    ? (categories.find(c => c.slug === category)?.name ?? category)
    : null;
  const categoryBrands   = CATEGORY_BRANDS[categorySlug] || [];
  const specFilterGroups = CATEGORY_FILTER_GROUPS[categorySlug] || [];

  // ── Render a group's item rows as Sapir-style checkboxes ─────────────────────
  // type:'select' → each option is a checkbox (radio-like: one value active at a time)
  // type:'toggle' → single checkbox
  const buildRows = (items) => {
    const rows = [];
    items.forEach((item, itemIdx) => {
      const rawValue = searchParams.get(item.param) || '';
      if (item.type === 'select') {
        item.options.forEach((o, i) => {
          rows.push(
            <label key={`${itemIdx}-${i}`} className={s.filterOption}>
              <input
                type="checkbox"
                checked={rawValue === o.value}
                onChange={() => applyFilter({ [item.param]: rawValue === o.value ? '' : o.value })}
              />
              {o.label}
            </label>
          );
        });
      } else if (item.type === 'toggle') {
        rows.push(
          <label key={itemIdx} className={s.filterOption}>
            <input
              type="checkbox"
              checked={rawValue === 'true'}
              onChange={e => applyFilter({ [item.param]: e.target.checked ? 'true' : '' })}
            />
            {item.label}
          </label>
        );
      }
    });
    return rows;
  };

  // ── Render a complete collapsible filter group ────────────────────────────────
  const renderFilterGroup = (group) => {
    const open     = isGroupOpen(group.key);
    const expanded = isExpanded(group.key);
    const allRows  = buildRows(group.items);
    const hasTrunc = allRows.length > SHOW_MORE_THRESHOLD;
    const visible  = hasTrunc && !expanded ? allRows.slice(0, SHOW_MORE_THRESHOLD) : allRows;

    return (
      <div key={group.key} className={s.filterGroup}>
        {/* .filter-group-header */}
        <div className={s.filterGroupHeader} onClick={() => toggleGroup(group.key)}>
          <div className={s.filterGroupTitle}>{group.label}</div>
          <ArrowSvg
            className={`${s.filterGroupArrow}${open ? '' : ' ' + s.filterGroupArrowCollapsed}`}
          />
        </div>
        {/* .filter-group-body */}
        <div className={open ? s.filterGroupBody : s.filterGroupBodyHidden}>
          {visible}
          {hasTrunc && (
            <button className={s.showMoreBtn} onClick={e => toggleExpand(group.key, e)}>
              <ChevronDown
                size={13}
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}
              />
              {expanded ? 'הצג פחות' : 'הצג עוד'}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Filter panel (left sidebar column) ───────────────────────────────────────
  const FilterPanel = () => {
    const brandExpanded = isExpanded('__brand');
    const visibleBrands = brandExpanded
      ? categoryBrands
      : categoryBrands.slice(0, SHOW_MORE_THRESHOLD);
    const brandHasTrunc = categoryBrands.length > SHOW_MORE_THRESHOLD;

    return (
      <div className={s.filterPanel}>

        {/* .filter-title — "סינון" heading with icon */}
        <div className={s.filterTitle}>
          <SlidersHorizontal size={15} aria-hidden="true" />
          סינון
        </div>

        {/* ── Price range (.filter-group) ── */}
        <div className={s.filterGroup}>
          <div className={s.filterGroupHeader} onClick={() => toggleGroup('__price')}>
            <div className={s.filterGroupTitle}>טווח מחיר (₪)</div>
            <ArrowSvg
              className={`${s.filterGroupArrow}${isGroupOpen('__price') ? '' : ' ' + s.filterGroupArrowCollapsed}`}
            />
          </div>
          <div className={isGroupOpen('__price') ? s.filterGroupBody : s.filterGroupBodyHidden}>
            <PriceRangeSlider
              min={PRICE_MIN} max={PRICE_MAX} step={100}
              value={priceRange}
              onChange={setPriceRange}
              onCommit={commitPriceRange}
            />
          </div>
        </div>

        {/* ── Brand checkboxes (.filter-group) ── */}
        {categoryBrands.length > 0 && (
          <div className={s.filterGroup}>
            <div className={s.filterGroupHeader} onClick={() => toggleGroup('__brand')}>
              <div className={s.filterGroupTitle}>מותג</div>
              <ArrowSvg
                className={`${s.filterGroupArrow}${isGroupOpen('__brand') ? '' : ' ' + s.filterGroupArrowCollapsed}`}
              />
            </div>
            <div className={isGroupOpen('__brand') ? s.filterGroupBody : s.filterGroupBodyHidden}>
              {visibleBrands.map(b => (
                <label key={b} className={s.filterOption}>
                  <input
                    type="checkbox"
                    checked={brand === b}
                    onChange={() => applyFilter({ brand: brand === b ? '' : b })}
                  />
                  {b}
                </label>
              ))}
              {brandHasTrunc && (
                <button
                  className={s.showMoreBtn}
                  onClick={e => toggleExpand('__brand', e)}
                >
                  <ChevronDown
                    size={13}
                    style={{ transform: brandExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}
                  />
                  {brandExpanded ? 'הצג פחות' : `הצג עוד (${categoryBrands.length - SHOW_MORE_THRESHOLD} נוספים)`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Availability (.filter-group) ── */}
        <div className={s.filterGroup}>
          <div className={s.filterGroupHeader} onClick={() => toggleGroup('__avail')}>
            <div className={s.filterGroupTitle}>זמינות</div>
            <ArrowSvg
              className={`${s.filterGroupArrow}${isGroupOpen('__avail') ? '' : ' ' + s.filterGroupArrowCollapsed}`}
            />
          </div>
          <div className={isGroupOpen('__avail') ? s.filterGroupBody : s.filterGroupBodyHidden}>
            <label className={s.filterOption}>
              <input
                type="checkbox"
                checked={inStock}
                onChange={e => applyFilter({ inStock: e.target.checked ? 'true' : '' })}
              />
              במלאי בלבד
            </label>
            <label className={s.filterOption}>
              <input
                type="checkbox"
                checked={onSale}
                onChange={e => applyFilter({ onSale: e.target.checked ? 'true' : '' })}
              />
              במבצע
            </label>
            <label className={s.filterOption}>
              <input
                type="checkbox"
                checked={featured}
                onChange={e => applyFilter({ featured: e.target.checked ? 'true' : '' })}
              />
              מוצרים מומלצים
            </label>
          </div>
        </div>

        {/* ── Category-specific spec filters (data-driven) ── */}
        {specFilterGroups.map(renderFilterGroup)}

        {/* ── Clear all (.filter-clear) ── */}
        {activeFilterCount > 0 && (
          <button className={s.filterClear} onClick={clearAll}>
            <X size={13} aria-hidden="true" />
            נקה סינון ({activeFilterCount})
          </button>
        )}

      </div>
    );
  };

  // ── Inline club banner (inside product grid every 6 items) ───────────────────
  const InlineClubBanner = () => (
    <div className={s.inlineClubBanner}>
      <ShieldCheck size={20} style={{ stroke: 'var(--sv-violet)', fill: 'none' }} />
      <div className={s.inlineClubBannerText}>
        <strong>מועדון TechVault</strong> — קבל אחריות מורחבת 3 שנים + תמיכה 24/7 על כל רכישה. רק ₪50 לכל החיים.
      </div>
      <button className={s.inlineClubBannerBtn}>הצטרף עכשיו</button>
    </div>
  );

  const buildGridItems = () => {
    const items = [];
    products.forEach((p, i) => {
      items.push({ type: 'product', product: p, key: p._id });
      if (i > 0 && (i + 1) % 8 === 0 && i + 1 < products.length) {
        items.push({ type: 'club', key: `cb-${i}` });
      }
    });
    return items;
  };

  // ── Page render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {sidebarOpen && (
        <div className={s.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ── Breadcrumb strip ── */}
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <button className={s.breadcrumbLink} onClick={() => navigate('/')}>
            🏠 בית
          </button>
          <span className={s.breadcrumbSep}>›</span>
          {categoryName ? (
            <>
              <button className={s.breadcrumbLink} onClick={() => handleCategoryChange('')}>
                כל המוצרים
              </button>
              <span className={s.breadcrumbSep}>›</span>
              <span className={s.breadcrumbCurrent}>{categoryName}</span>
            </>
          ) : (
            <span className={s.breadcrumbCurrent}>
              {search ? `חיפוש: "${search}"` : 'כל המוצרים'}
            </span>
          )}
        </div>
      </div>

      {/* ── Page inner ── */}
      <div className={s.pageInner}>

        {/* Club promo banner — top of page */}
        <div className={s.clubBanner}>
          <ShieldCheck size={20} className={s.clubBannerIcon} />
          <div className={s.clubBannerText}>
            <strong>מועדון TechVault</strong> — קבל אחריות מורחבת 3 שנים + תמיכה 24/7 על כל רכישה. רק ₪50 לכל החיים.
          </div>
          <button className={s.clubBannerBtn}>הצטרף עכשיו</button>
        </div>

        {/* Brand logo grid — above page title */}
        {categoryBrands.length > 0 && (
          <div className={s.brandsSection}>
            <div className={s.brandsTitle}>סנן לפי מותג</div>
            <div className={s.brandsGrid}>
              {categoryBrands.map(b => (
                <BrandCard
                  key={b}
                  name={b}
                  selected={brand === b}
                  onClick={() => applyFilter({ brand: brand === b ? '' : b })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Page header */}
        <div className={s.pageHeader}>
          <h1 className={s.pageTitle}>
            {categoryName
              ? categoryName
              : search
              ? `תוצאות עבור "${search}"`
              : 'כל המוצרים'}
          </h1>
          <p className={s.pageSub}>
            מציג <strong>{meta?.total ?? products.length}</strong> מוצרים
            {categoryName && ` — ${categoryName} מהמותגים המובילים`}
          </p>
        </div>

        {/* Body: 220px filter sidebar | products column */}
        <div className={s.pageBody}>

          {/* Filter panel */}
          <div className={`${s.filterPanelWrap}${sidebarOpen ? ' ' + s.filterPanelWrapOpen : ''}`}>
            <FilterPanel />
          </div>

          {/* Products column */}
          <div>

            {/* .cat-products-top — count + sort (mobile toggle lives here) */}
            <div className={s.productsTop}>
              <div className={s.productsCount}>
                מציג <strong>{products.length}</strong>
                {meta?.total && products.length !== meta.total
                  ? ` מתוך ${meta.total}`
                  : ''} מוצרים
              </div>
              <div className={s.productsTopRight}>
                {/* Mobile-only filter toggle — hidden on desktop via CSS */}
                <button
                  className={s.filterToggle}
                  onClick={() => setSidebarOpen(o => !o)}
                  aria-expanded={sidebarOpen}
                >
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  סינון
                  {activeFilterCount > 0 && (
                    <span className={s.filterToggleBadge}>{activeFilterCount}</span>
                  )}
                </button>
                <select
                  className={s.sortSelect}
                  value={sort}
                  onChange={e => applyFilter({ sort: e.target.value })}
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product grid */}
            {loading ? (
              <div className={s.skeletonGrid}>
                {[...Array(9)].map((_, i) => (
                  <div key={i} className={`${s.skeletonCard} skeleton`} />
                ))}
              </div>
            ) : error ? (
              <div className={s.noResults}>
                <span style={{ fontSize: '2rem' }}>⚠️</span>
                <span>{error}</span>
                <button className={s.loadMoreBtn} onClick={() => window.location.reload()}>
                  נסה שנית
                </button>
              </div>
            ) : products.length === 0 ? (
              <div className={s.noResults}>
                <SearchX size={40} />
                לא נמצאו מוצרים התואמים את הסינון
                <button className={s.loadMoreBtn} onClick={clearAll}>נקה סינון</button>
              </div>
            ) : (
              <div className={s.productsGrid}>
                {buildGridItems().map(item =>
                  item.type === 'product'
                    ? <ProductCard key={item.key} product={item.product} />
                    : (
                      <div key={item.key} className={s.inlineClub}>
                        <InlineClubBanner />
                      </div>
                    )
                )}
              </div>
            )}

            {/* Load more */}
            {!loading && !error && products.length > 0 && (
              <div className={s.loadMore}>
                {meta && (
                  <p className={s.loadMoreCount}>
                    מוצגים {products.length} מתוך {meta.total} מוצרים
                  </p>
                )}
                {hasMore && (
                  <button
                    className={s.loadMoreBtn}
                    onClick={loadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? 'טוען מוצרים...' : 'טען עוד מוצרים'}
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
