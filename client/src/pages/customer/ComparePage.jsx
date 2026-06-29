import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Plus, ShoppingCart, X, ChevronDown, ArrowRight } from 'lucide-react';
import { useCompare } from '../../features/compare/context/CompareProvider';
import { useCart } from '../../hooks/useCart';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import { useTranslation } from '../../context/LanguageContext';
import { productService } from '../../features/products/api/product.service';
import { compareSpec, comparePrices, gatherSpecKeys, determineBadges } from '../../features/compare/utils/compareScoring';
import s from './ComparePage.module.css';

// ── Spec grouping ──────────────────────────────────────────────────────────────
const SPEC_GROUPS = [
  { label: 'תצוגה', keys: ['Screen Size', 'Resolution', 'Refresh Rate', 'Panel Type', 'HDR', 'Brightness'] },
  { label: 'ביצועים', keys: ['Response Time', 'Sensor', 'DPI', 'Switch Type', 'Connection'] },
  { label: 'חיבורים', keys: ['HDMI', 'DisplayPort', 'USB-C', 'USB', 'Bluetooth', 'Wireless'] },
  { label: 'כללי', keys: ['Layout', 'Keyboard Type', 'Noise Cancellation', 'Connectivity', 'Driver Size', 'Form Factor'] },
];

// Key differences specs to highlight
const DIFF_KEYS = ['Refresh Rate', 'Panel Type', 'Response Time', 'HDR', 'Screen Size', 'Resolution'];

const starStr = (n) => '★'.repeat(Math.min(Math.round(n), 5)) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));

// ── Fetch products by IDs via the dedicated compare endpoint ─────────────────
async function fetchProductsByIds(ids) {
  if (!ids.length) return [];
  try {
    return await productService.compare(ids);
  } catch {
    return [];
  }
}

// ── Badge metadata ─────────────────────────────────────────────────────────────
const BADGE_META = {
  'מומלץ לגיימינג': { emoji: '🎮', type: 'גיימינג', cls: 'recTypeGaming', why: 'קצב רענן הכי גבוה' },
  'תמורה מצוינת': { emoji: '💰', type: 'תמורה', cls: 'recTypeValue', why: 'המחיר הנמוך ביותר' },
  'הכי מומלץ': { emoji: '🏆', type: 'הכי מומלץ', cls: 'recTypeBest', why: 'דירוג הכי גבוה' },
};

// ── Product Selector Modal ─────────────────────────────────────────────────────
function ProductSelector({ onSelect, onClose, compareIds }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency('Israel');
  const timerRef = useRef(null);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(val), 300);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productService.list({ limit: 60, search: debouncedQuery || undefined })
      .then(({ products: prods }) => {
        if (!cancelled) setProducts(prods);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={s.selOverlay} onClick={handleBackdrop}>
      <div className={s.selModal}>
        <div className={s.selHead}>
          <span className={s.selTitle}>{'בחר מוצר להשוואה'}</span>
          <button className={s.selClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div className={s.selSearchWrap}>
          <input
            className={s.selSearch}
            placeholder={'חפש מוצר...'}
            value={query}
            onChange={handleQueryChange}
            autoFocus
          />
        </div>
        <div className={s.selBody}>
          {loading ? (
            <div className={s.selLoading}>{'טוען...'}</div>
          ) : products.length === 0 ? (
            <div className={s.selEmpty}>{'לא נמצאו מוצרים'}</div>
          ) : (
            <div className={s.selProds}>
              {products.map((p) => {
                const alreadyAdded = compareIds.includes(String(p._id));
                return (
                  <div
                    key={p._id}
                    className={`${s.selProd} ${alreadyAdded ? s.selProdDisabled : ''}`}
                    onClick={() => { if (!alreadyAdded) { onSelect(String(p._id)); onClose(); } }}
                  >
                    <div className={s.selProdImg}>
                      {p.images?.[0]
                        ? <img src={p.images[0]} alt={p.name} />
                        : <Monitor size={28} />
                      }
                    </div>
                    <div className={s.selProdBrand}>{p.brand || ''}</div>
                    <div className={s.selProdName}>{p.name}</div>
                    <div className={s.selProdPrice}>{formatPrice(p.discountedPrice ?? p.price)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Spec Accordion for a single product ────────────────────────────────────────
function SpecAccordion({ product, openSections, onToggle, slotIndex }) {
  const allKeys = useMemo(() => {
    const entries = product.specs instanceof Map ? [...product.specs.keys()] : Object.keys(product.specs || {});
    return new Set(entries);
  }, [product.specs]);

  const getSpec = (key) => {
    if (product.specs instanceof Map) return product.specs.get(key);
    return product.specs?.[key];
  };

  // Filter groups to only show those with at least one matching spec
  const visibleGroups = SPEC_GROUPS.filter((g) => g.keys.some((k) => allKeys.has(k)));

  // Gather uncategorized specs
  const categorizedKeys = new Set(SPEC_GROUPS.flatMap((g) => g.keys));
  const extraKeys = [...allKeys].filter((k) => !categorizedKeys.has(k));

  const groups = [...visibleGroups];
  if (extraKeys.length > 0) {
    groups.push({ label: 'נוסף', keys: extraKeys });
  }

  if (groups.length === 0) return null;

  return (
    <div className={s.slotSpecs}>
      {groups.map((group) => {
        const sectionKey = `${slotIndex}-${group.label}`;
        const isOpen = openSections.has(sectionKey);
        const specs = group.keys.filter((k) => allKeys.has(k));
        if (specs.length === 0) return null;

        return (
          <div key={group.label} className={s.specSec}>
            <div className={s.specHdr} onClick={() => onToggle(sectionKey)}>
              <span className={s.specHdrTitle}>{group.label}</span>
              <ChevronDown
                size={13}
                className={`${s.specHdrArrow} ${isOpen ? s.specHdrArrowOpen : ''}`}
              />
            </div>
            <div className={`${s.specBody} ${isOpen ? s.specBodyOpen : ''}`}>
              {specs.map((key) => (
                <div key={key} className={s.specRow}>
                  <span className={s.specKey}>{key}</span>
                  <span className={s.specVal}>{getSpec(key) ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ComparePage ───────────────────────────────────────────────────────────
export default function ComparePage() {
  const { items, addProduct, removeProduct } = useCompare();
  const { addItem } = useCart();
  const { formatPrice } = useCurrency('Israel');
  const t = useTranslation();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [openSections, setOpenSections] = useState(new Set());

  // Fetch full product data via the compare endpoint whenever items change
  useEffect(() => {
    if (items.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchProductsByIds(items).then((prods) => {
      if (!cancelled) setProducts(prods);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [items]);

  const toggleSection = useCallback((key) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleAddToCart = useCallback(async (productId) => {
    try {
      await addItem(productId, 1);
    } catch {
      // Cart error handled by CartProvider toast
    }
  }, [addItem]);

  const handleSelectProduct = useCallback((id) => {
    addProduct(id);
  }, [addProduct]);

  // Price comparison data
  const priceData = useMemo(() => {
    if (products.length < 2) return {};
    const result = comparePrices(products);
    const map = {};
    result.forEach((r) => { map[r.productId] = r; });
    return map;
  }, [products]);

  // Badges
  const badges = useMemo(() => {
    if (products.length < 2) return {};
    return determineBadges(products);
  }, [products]);

  // Key differences
  const keyDiffs = useMemo(() => {
    if (products.length < 2) return [];
    const allKeys = gatherSpecKeys(products);
    const diffKeys = DIFF_KEYS.filter((k) => allKeys.includes(k));
    // Also include price as the first diff
    const diffs = [];

    // Price diff
    const pComparison = comparePrices(products);
    diffs.push({
      label: 'מחיר',
      values: pComparison.map((pc) => {
        const prod = products.find((p) => String(p._id) === String(pc.productId));
        return {
          brand: prod?.brand || '',
          value: formatPrice(pc.price),
          isBest: pc.isBest,
        };
      }),
    });

    // Spec diffs
    for (const key of diffKeys) {
      const comparison = compareSpec(key, products);
      const hasVariation = new Set(comparison.map((c) => String(c.rawValue))).size > 1;
      if (!hasVariation) continue;
      diffs.push({
        label: key,
        values: comparison.map((c) => {
          const prod = products.find((p) => String(p._id) === String(c.productId));
          return {
            brand: prod?.brand || '',
            value: c.rawValue ?? '-',
            isBest: c.isBest,
          };
        }),
      });
    }

    return diffs;
  }, [products, formatPrice]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!loading && items.length === 0) {
    return (
      <div className={s.pageWrap}>
        <div className={s.breadcrumb}>
          <div className={s.bcInner}>
            <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {'עמוד ראשי'}</Link>
            <span className={s.bcSep}>{'›'}</span>
            <span className={s.bcCurrent}>{'השוואת מוצרים'}</span>
          </div>
        </div>
        <div className={s.cmpPage}>
          <div className={s.empty}>
            <div className={s.emptyIcon}>
              <Monitor size={36} />
            </div>
            <div className={s.emptyTitle}>{t('compare.empty_title') || 'אין מוצרים להשוואה'}</div>
            <div className={s.emptySub}>{t('compare.empty_sub') || 'הוסף מוצרים מהקטלוג כדי להשוות ביניהם'}</div>
            <Link to="/products" className={s.emptyCta}>
              {'עבור לקטלוג'}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading && products.length === 0) {
    return (
      <div className={s.pageWrap}>
        <div className={s.breadcrumb}>
          <div className={s.bcInner}>
            <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {'עמוד ראשי'}</Link>
            <span className={s.bcSep}>{'›'}</span>
            <span className={s.bcCurrent}>{'השוואת מוצרים'}</span>
          </div>
        </div>
        <div className={s.cmpPage}>
          <div className={s.loading}>
            <div className={s.spinner} />
          </div>
        </div>
      </div>
    );
  }

  // ── Main content ─────────────────────────────────────────────────────────────
  const canAddMore = items.length < 4;

  return (
    <div className={s.pageWrap}>
      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <div className={s.bcInner}>
          <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {'עמוד ראשי'}</Link>
          <span className={s.bcSep}>{'›'}</span>
          <span className={s.bcCurrent}>{'השוואת מוצרים'}</span>
        </div>
      </div>

      <div className={s.cmpPage}>
        {/* Title */}
        <h1 className={s.title}>{t('compare.title') || 'השוואת מוצרים'}</h1>
        <p className={s.sub}>
          {products.length} {'מוצרים נבחרו להשוואה'}
          {products.length >= 2 && ' • לחץ על מוצר להסרה'}
        </p>

        {/* Recommendation badges */}
        {products.length >= 2 && Object.keys(badges).length > 0 && (
          <div className={s.recs}>
            {Object.entries(badges).map(([productId, badgeLabel]) => {
              const prod = products.find((p) => String(p._id) === productId);
              if (!prod) return null;
              const meta = BADGE_META[badgeLabel] || { emoji: '⭐', type: badgeLabel, cls: 'recTypeBest', why: '' };
              return (
                <div key={productId} className={s.rec}>
                  <span className={s.recEmoji}>{meta.emoji}</span>
                  <div>
                    <div className={`${s.recType} ${s[meta.cls] || ''}`}>{meta.type}</div>
                    <div className={s.recName}>{prod.name}</div>
                    <div className={s.recWhy}>{meta.why}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Product slots */}
        <div className={s.slots}>
          {products.map((product, idx) => {
            const priceBest = priceData[product._id]?.isBest;
            const discountPercent = product.discountPercent || (product.compareAtPrice && product.compareAtPrice > product.price
              ? Math.round((1 - product.price / product.compareAtPrice) * 100)
              : null);
            const effectivePrice = product.discountedPrice ?? product.price;

            return (
              <div key={product._id} className={s.slot}>
                <div className={s.slotCard}>
                  <div className={s.slotHeader}>
                    {/* Image */}
                    <div className={s.slotImg}>
                      {discountPercent > 0 && (
                        <span className={s.slotDisc}>-{discountPercent}%</span>
                      )}
                      {product.images?.[0]
                        ? <img src={product.images[0]} alt={product.name} />
                        : <Monitor size={44} />
                      }
                    </div>

                    {/* Brand */}
                    <div className={s.slotBrand}>{product.brand || ''}</div>

                    {/* Name */}
                    <div className={s.slotName}>{product.name}</div>

                    {/* Stars */}
                    {product.ratings?.average > 0 && (
                      <div className={s.slotStars}>
                        {starStr(product.ratings.average)}{' '}
                        <span style={{ color: 'var(--sv-muted)', fontSize: 9 }}>({product.ratings.count})</span>
                      </div>
                    )}

                    {/* Price */}
                    <div className={priceBest ? s.slotPriceBest : s.slotPrice}>
                      {formatPrice(effectivePrice)}
                      {product.compareAtPrice && product.compareAtPrice > effectivePrice && (
                        <span className={s.slotPriceOld}>{formatPrice(product.compareAtPrice)}</span>
                      )}
                    </div>

                    {/* Add to cart */}
                    <button className={s.slotAddCart} onClick={() => handleAddToCart(product._id)}>
                      <ShoppingCart size={11} />
                      {'הוסף לסל'}
                    </button>

                    {/* Remove from compare */}
                    <button className={s.slotRemove} onClick={() => removeProduct(product._id)}>
                      {'הסר מהשוואה'}
                    </button>
                  </div>

                  {/* Spec accordion */}
                  <SpecAccordion
                    product={product}
                    openSections={openSections}
                    onToggle={toggleSection}
                    slotIndex={idx}
                  />
                </div>
              </div>
            );
          })}

          {/* "Add product" slot */}
          {canAddMore && (
            <div className={s.slotAdd} onClick={() => setShowSelector(true)}>
              <div className={s.slotAddIcon}>
                <Plus size={22} />
              </div>
              <span className={s.slotAddLabel}>{'הוסף מוצר'}</span>
            </div>
          )}
        </div>

        {/* Key differences */}
        {products.length >= 2 && keyDiffs.length > 0 && (
          <div className={s.diffCard}>
            <div className={s.diffTitle}>{'הבדלים מרכזיים'}</div>
            {keyDiffs.map((diff) => (
              <div key={diff.label} className={s.diffRow}>
                <div className={s.diffRowLabel}>{diff.label}</div>
                <div className={s.diffVals}>
                  {diff.values.map((v, i) => (
                    <div key={i} className={`${s.diffVal} ${v.isBest ? s.diffValBest : ''}`}>
                      <span className={s.diffValBrand}>{v.brand}</span>
                      <span className={v.isBest ? s.diffValBestSpec : s.diffValSpec}>{v.value}</span>
                      {v.isBest && <span className={s.diffBadge}>{'✓'}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product selector modal */}
      {showSelector && (
        <ProductSelector
          onSelect={handleSelectProduct}
          onClose={() => setShowSelector(false)}
          compareIds={items}
        />
      )}
    </div>
  );
}
