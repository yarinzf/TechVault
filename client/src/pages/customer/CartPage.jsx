import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShoppingCart, CreditCard, Trash2,
  Minus, Plus, ShieldCheck, RotateCcw, Truck,
  CheckCircle, AlertCircle, Monitor,
} from 'lucide-react';
import { useCart }         from '../../hooks/useCart';
import { useToast }        from '../../hooks/useToast';
import { useCurrency }     from '../../features/currency/hooks/useCurrency';
import { useTranslation }  from '../../context/LanguageContext';
import { couponService }   from '../../features/coupons/api/coupon.service';
import s from './CartPage.module.css';

export default function CartPage() {
  const { items, totalPrice, updateItem, removeItem, clearCart: clearCartFn } = useCart();
  const { toast }        = useToast();
  const navigate         = useNavigate();
  const { formatPrice }  = useCurrency('Israel');
  const t                = useTranslation();

  const [couponCode,    setCouponCode]    = useState('');
  const [couponMsg,     setCouponMsg]     = useState(null);
  // Cart is never authoritative for the final charge — Checkout always
  // recalculates the real discount server-side. This is only a truthful
  // preview of what applying the code would do to THIS page's totals.
  const [couponApplied, setCouponApplied] = useState(null);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Sapir's "סכום מוצרים" row shows the pre-discount total, and "הנחה"
  // shows the real campaign/VIP savings already baked into priceAtAdd vs
  // originalPriceAtAdd — never invented, always derived from the same
  // live-repriced cart data used everywhere else on this page.
  const subtotalOriginal = items.reduce((sum, item) => {
    const price = item.priceAtAdd ?? item.unitPrice ?? 0;
    const original = item.originalPriceAtAdd ?? price;
    return sum + original * item.quantity;
  }, 0);
  const productDiscount = Math.max(0, subtotalOriginal - totalPrice);

  const couponDiscount = couponApplied?.discount ?? 0;
  const displayTotal    = Math.max(0, totalPrice - couponDiscount);

  const handleUpdate = async (productId, qty) => {
    try { await updateItem(productId, qty); }
    catch (err) { toast.error(err.message); }
  };

  const handleRemove = async (productId) => {
    try { await removeItem(productId); toast.info(t('cart.item_removed')); }
    catch (err) { toast.error(err.message); }
  };

  const handleClear = async () => {
    if (!clearCartFn) return;
    try { await clearCartFn(); } catch {}
  };

  const handleCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponMsg(null);
    try {
      const result = await couponService.validate(code, totalPrice);
      // Actually reflect the discount in this page's displayed total — a
      // coupon must never show a "success" message without the shown
      // numbers changing to match (the real, final discount is still
      // recalculated by Checkout/order.service.js at purchase time).
      setCouponApplied({
        code:     result.coupon?.code ?? code.toUpperCase(),
        discount: result.discount,
      });
      setCouponMsg({
        type: 'success',
        text: `קוד ההנחה התקבל — ${result.coupon?.type === 'percentage' ? result.coupon.value + '% הנחה' : 'הנחה של ' + formatPrice(result.discount)}`,
      });
      setCouponCode('');
    } catch (err) {
      setCouponApplied(null);
      setCouponMsg({ type: 'error', text: err.message || 'קוד ההנחה אינו תקין' });
    }
  };

  /* ── Empty state ── */
  if (items.length === 0) {
    return (
      <div className={s.cartPage}>
        <div className={s.breadcrumb}>
          <div className={s.breadcrumbInner}>
            <Link to="/" className={s.bcLink}><ArrowRight size={13} /> עמוד ראשי</Link>
            <span className={s.bcSep}>›</span>
            <span className={s.bcCurrent}>{t('cart.page_title')}</span>
          </div>
        </div>
        <div className={s.emptyCart}>
          <div className={s.emptyIcon}><ShoppingCart size={40} strokeWidth={1.3} /></div>
          <div className={s.emptyTitle}>{t('cart.empty_title')}</div>
          <div className={s.emptySub}>{t('cart.page_empty_sub')}</div>
          <button className={s.emptyBtn} onClick={() => navigate('/products')}>
            <Monitor size={16} /> {t('cart.page_discover_btn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.cartPage}>

      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <div className={s.breadcrumbInner}>
          <Link to="/" className={s.bcLink}><ArrowRight size={13} /> עמוד ראשי</Link>
          <span className={s.bcSep}>›</span>
          <span className={s.bcCurrent}>{t('cart.page_title')}</span>
        </div>
      </div>

      {/* Page header */}
      <div className={s.header}>
        <h1 className={s.title}>{t('cart.page_title')}</h1>
      </div>

      {/* Layout */}
      <div className={s.layout}>

        {/* ── Items column ── */}
        <div>
          <div className={s.itemsHeader}>
            <div className={s.itemsTitle}>{t('cart.products_in_cart')}</div>
            {clearCartFn && (
              <button className={s.clearBtn} onClick={handleClear}>
                <Trash2 size={14} /> {t('cart.clear_cart')}
              </button>
            )}
          </div>

          {items.map(item => {
            const pid           = String(item.product?._id ?? item.product);
            const price         = item.priceAtAdd ?? item.unitPrice ?? 0;
            const originalPrice = item.originalPriceAtAdd;
            const lineTotal     = price * item.quantity;
            const image         = item.imageAtAdd || item.image || '';
            const name          = item.nameAtAdd ?? item.name;
            const brand         = item.product?.brand;
            const hasDiscount   = originalPrice && originalPrice > price;
            const saving        = hasDiscount ? (originalPrice - price) * item.quantity : 0;

            return (
              <div key={pid} className={s.item}>
                {/* Right zone: image + info */}
                <div className={s.itemRight}>
                  <div className={s.imgWrap}>
                    {image ? (
                      <img src={image} alt={name} />
                    ) : (
                      <Monitor size={51} strokeWidth={1.3} style={{ color: 'var(--sv-blue-l)' }} />
                    )}
                  </div>
                  <div className={s.itemMeta}>
                    {brand && <div className={s.itemBrand}>{brand}</div>}
                    {item.product?.slug ? (
                      <Link to={`/products/${item.product.slug}`} className={s.itemName}>{name}</Link>
                    ) : (
                      <div className={s.itemName}>{name}</div>
                    )}
                    <div className={s.itemStock}>
                      <CheckCircle size={13} /> {t('cart.in_stock')}
                    </div>
                  </div>
                </div>

                {/* Middle zone: quantity */}
                <div className={s.qtyZone}>
                  <div className={s.qtyCtrl}>
                    <button
                      className={s.qBtn}
                      onClick={() => handleUpdate(pid, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      aria-label={t('cart.decrease_qty')}
                    >
                      <Minus size={14} />
                    </button>
                    <span className={s.qty}>{item.quantity}</span>
                    <button
                      className={s.qBtn}
                      onClick={() => handleUpdate(pid, item.quantity + 1)}
                      aria-label={t('cart.increase_qty')}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Left zone: remove + price */}
                <div className={s.itemLeft}>
                  <button className={s.removeBtn} onClick={() => handleRemove(pid)} aria-label={t('cart.remove_item')}>
                    <Trash2 size={17} />
                  </button>
                  <div className={s.itemPrice}>
                    <div className={s.priceRow}>
                      <span className={s.lineTotal}>{formatPrice(lineTotal)}</span>
                      {hasDiscount && <span className={s.strikePrice}>{formatPrice(originalPrice * item.quantity)}</span>}
                    </div>
                    {saving > 0 && (
                      <div className={s.discLabel}>{t('cart.saving')} {formatPrice(saving)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Summary sidebar ── */}
        <div className={s.summary}>
          <div className={s.summaryTitle}>{t('checkout.summary_title')}</div>

          <div className={s.summaryRow}>
            <span className={s.summaryLabel}>{t('cart.subtotal_label')} ({itemCount} {t('cart.units_word')})</span>
            <span className={s.summaryVal}>{formatPrice(subtotalOriginal)}</span>
          </div>
          <div className={s.summaryRow}>
            <span className={s.summaryLabel}>{t('cart.product_discount_label')}</span>
            <span className={s.summaryValGreen}>{productDiscount > 0 ? `−${formatPrice(productDiscount)}` : formatPrice(0)}</span>
          </div>
          {/* Shipping is never authoritative here — Cart never charges or
              persists it. The real method/cost is chosen and calculated at
              Checkout (order.service.js / shipping.service.js), so this row
              intentionally does not use the "free" (green) treatment. */}
          <div className={s.summaryRow}>
            <span className={s.summaryLabel}>{t('checkout.shipping')}</span>
            <span className={s.summaryVal}>{t('cart.shipping_at_checkout')}</span>
          </div>
          {couponApplied && (
            <div className={s.summaryRow}>
              <span className={s.summaryLabel}>{t('checkout.coupon_discount')}</span>
              <span className={s.summaryValGreen}>−{formatPrice(couponDiscount)}</span>
            </div>
          )}

          {/* Coupon */}
          <div className={s.couponWrap}>
            <div className={s.couponLabel}>{t('cart.coupon_label')}</div>
            <div className={s.couponRow}>
              <input
                className={s.couponInput}
                type="text"
                value={couponCode}
                onChange={e => setCouponCode(e.target.value)}
                placeholder={t('cart.coupon_placeholder')}
                aria-label={t('cart.coupon_placeholder')}
              />
              <button className={s.couponBtn} onClick={handleCoupon}>
                {t('cart.coupon_apply')}
              </button>
            </div>
            {couponMsg && (
              <div className={`${s.couponMsg} ${couponMsg.type === 'success' ? s.couponSuccess : s.couponError}`}>
                {couponMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                <span>{couponMsg.text}</span>
              </div>
            )}
          </div>

          <hr className={s.divider} />

          <div className={s.totalRow}>
            <span className={s.totalLabel}>{t('cart.total_label')}</span>
            <span className={s.totalVal}>{formatPrice(displayTotal)}</span>
          </div>

          <button className={s.checkoutBtn} onClick={() => navigate('/checkout')}>
            <CreditCard size={17} /> {t('cart.proceed_to_checkout')}
          </button>

          <Link to="/products" className={s.continueBtn}>
            {t('cart.continue_shopping')}
          </Link>

          <div className={s.badges}>
            <div className={s.badge}><ShieldCheck size={13} className={s.badgeIcon} /> {t('trust.pdp_secure')}</div>
            <div className={s.badge}><RotateCcw size={13} className={s.badgeIcon} /> {t('trust.pdp_returns')}</div>
            <div className={s.badge}><Truck size={13} className={s.badgeIcon} /> {t('cart.badge_free_shipping_regular')}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
