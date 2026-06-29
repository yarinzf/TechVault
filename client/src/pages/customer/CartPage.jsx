import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShoppingCart, CreditCard, Trash2,
  Minus, Plus, X, ShieldCheck, RotateCcw, Truck,
  CheckCircle, Monitor,
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

  const [couponCode, setCouponCode] = useState('');
  const [couponMsg,  setCouponMsg]  = useState(null);

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
      setCouponMsg({
        type: 'success',
        text: `קופון הוחל בהצלחה — ${result.coupon?.type === 'percent' ? result.coupon.value + '% הנחה' : 'הנחה של ₪' + result.discount}`,
      });
    } catch (err) {
      setCouponMsg({ type: 'error', text: err.message || 'קוד קופון לא תקין' });
    }
  };

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

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
          <div className={s.emptyIcon}><ShoppingCart size={40} /></div>
          <div className={s.emptyTitle}>{t('cart.empty_title')}</div>
          <div className={s.emptySub}>{t('cart.empty_sub')}</div>
          <button className={s.emptyBtn} onClick={() => navigate('/products')}>
            <Monitor size={16} /> {t('cart.discover')}
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
        <p className={s.subtitle}>{itemCount} {t('cart.items_in_cart') || 'פריטים בעגלה'}</p>
      </div>

      {/* Layout */}
      <div className={s.layout}>

        {/* ── Items column ── */}
        <div>
          <div className={s.itemsHeader}>
            <div className={s.itemsTitle}>{t('cart.products_in_cart') || 'פריטים בעגלה'}</div>
            {clearCartFn && (
              <button className={s.clearBtn} onClick={handleClear}>
                <Trash2 size={14} /> {t('cart.clear_cart') || 'ריקון עגלה'}
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
                {/* Product image */}
                {image ? (
                  <img className={s.img} src={image} alt={name} />
                ) : (
                  <div className={s.img} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Monitor size={32} style={{ color: 'var(--sv-blue-l)', opacity: 0.5 }} />
                  </div>
                )}

                {/* Item body */}
                <div className={s.itemBody}>
                  <div className={s.itemTop}>
                    <div className={s.itemMeta}>
                      {brand && <div className={s.itemBrand}>{brand}</div>}
                      {item.product?.slug ? (
                        <Link to={`/products/${item.product.slug}`} className={s.itemName}>{name}</Link>
                      ) : (
                        <div className={s.itemName}>{name}</div>
                      )}
                      <div className={s.itemStock}>
                        <CheckCircle size={12} /> {t('cart.in_stock') || 'במלאי'}
                      </div>
                    </div>
                    <button className={s.removeBtn} onClick={() => handleRemove(pid)} title={t('cart.remove_item')}>
                      <X size={16} />
                    </button>
                  </div>

                  <div className={s.itemBottom}>
                    <div className={s.qtyCtrl}>
                      <button className={s.qBtn} onClick={() => handleUpdate(pid, item.quantity - 1)} disabled={item.quantity <= 1}>
                        <Minus size={14} />
                      </button>
                      <span className={s.qty}>{item.quantity}</span>
                      <button className={s.qBtn} onClick={() => handleUpdate(pid, item.quantity + 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className={s.itemPrice}>
                      <div className={s.lineTotal}>{formatPrice(lineTotal)}</div>
                      {hasDiscount && (
                        <>
                          <div className={s.strikePrice}>{formatPrice(originalPrice)}</div>
                          <div className={s.discLabel}>{t('cart.saving') || 'חיסכון'}: {formatPrice(saving)}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Summary sidebar ── */}
        <div className={s.summary}>
          <div className={s.summaryTitle}>{t('checkout.summary_title') || 'סיכום הזמנה'}</div>

          <div className={s.summaryRow}>
            <span className={s.summaryLabel}>{t('checkout.total_products')} ({itemCount})</span>
            <span className={s.summaryVal}>{formatPrice(totalPrice)}</span>
          </div>
          <div className={s.summaryRow}>
            <span className={s.summaryLabel}>{t('checkout.shipping')}</span>
            <span className={s.summaryValFree}>{t('checkout.free')}</span>
          </div>

          {/* Coupon */}
          <div className={s.couponWrap}>
            <div className={s.couponLabel}>{t('cart.coupon_label') || 'יש לך קוד קופון?'}</div>
            <div className={s.couponRow}>
              <input
                className={s.couponInput}
                type="text"
                value={couponCode}
                onChange={e => setCouponCode(e.target.value)}
                placeholder={t('cart.coupon_placeholder') || 'הכנס קוד קופון'}
              />
              <button className={s.couponBtn} onClick={handleCoupon}>
                {t('cart.coupon_apply') || 'החל'}
              </button>
            </div>
            {couponMsg && (
              <div className={`${s.couponMsg} ${couponMsg.type === 'success' ? s.couponSuccess : s.couponError}`}>
                {couponMsg.text}
              </div>
            )}
          </div>

          <hr className={s.divider} />

          <div className={s.totalRow}>
            <span className={s.totalLabel}>{t('checkout.to_pay')}</span>
            <span className={s.totalVal}>{formatPrice(totalPrice)}</span>
          </div>

          <button className={s.checkoutBtn} onClick={() => navigate('/checkout')}>
            <CreditCard size={17} /> {t('cart.proceed_to_checkout')}
          </button>

          <Link to="/products" className={s.continueBtn}>
            {t('cart.continue_shopping')}
          </Link>

          <div className={s.badges}>
            <div className={s.badge}><ShieldCheck size={13} className={s.badgeIcon} /> {t('trust.pdp_secure') || 'תשלום מאובטח'}</div>
            <div className={s.badge}><RotateCcw size={13} className={s.badgeIcon} /> {t('trust.pdp_returns') || 'החזרה ב-30 יום'}</div>
            <div className={s.badge}><Truck size={13} className={s.badgeIcon} /> {t('trust.pdp_shipping') || 'משלוח חינם'}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
