import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  X, ShoppingCart, Minus, Plus, Trash2, Monitor, CreditCard,
  CheckCircle, AlertCircle, Truck,
} from 'lucide-react';
import { useCart }         from '../../../hooks/useCart';
import { useCurrency }     from '../../../features/currency/hooks/useCurrency';
import { useTranslation }  from '../../../context/LanguageContext';
import { couponService }   from '../../../features/coupons/api/coupon.service';
import s from './CartDrawer.module.css';

export default function CartDrawer({ isOpen, onClose }) {
  const { items, totalPrice, updateItem, removeItem } = useCart();
  const { formatPrice } = useCurrency('Israel');
  const t             = useTranslation();
  const navigate      = useNavigate();
  const drawerRef     = useRef(null);
  const firstBtnRef   = useRef(null);

  const [couponCode,    setCouponCode]    = useState('');
  const [couponMsg,     setCouponMsg]     = useState(null);
  // Cart Drawer is never authoritative for the final charge — Checkout
  // always recalculates the real discount server-side. This is only a
  // truthful preview, exactly like the full Cart page's coupon area.
  const [couponApplied, setCouponApplied] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => firstBtnRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  const couponDiscount = couponApplied?.discount ?? 0;
  const displayTotal    = Math.max(0, totalPrice - couponDiscount);

  const handleCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponMsg(null);
    try {
      const result = await couponService.validate(code, totalPrice);
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

  return (
    <>
      <div
        className={`${s.backdrop} ${isOpen ? s.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        ref={drawerRef}
        className={`${s.drawer} ${isOpen ? s.drawerOpen : ''}`}
        aria-label={t('nav.cart_arialabel')}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className={s.head}>
          <div className={s.title}>
            <ShoppingCart size={19} />
            <span>{t('cart.drawer_title')}</span>
          </div>
          <button
            ref={firstBtnRef}
            className={s.closeBtn}
            onClick={onClose}
            aria-label={t('cart.close')}
          >
            <X size={18} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}><ShoppingCart size={34} strokeWidth={1.3} /></div>
            <p className={s.emptyTitle}>{t('cart.empty_title')}</p>
            <p className={s.emptySub}>{t('cart.page_empty_sub')}</p>
            <button
              className={s.emptyBtn}
              onClick={() => { onClose(); navigate('/products'); }}
            >
              {t('cart.page_discover_btn')}
            </button>
          </div>
        ) : (
          <>
            {/* Scrollable body: items + coupon + shipping note */}
            <div className={s.body}>
              {items.map((item) => {
                const id    = item.product?._id || item.product;
                const name  = item.nameAtAdd     || item.product?.name  || t('cart.product_fallback');
                const image = item.imageAtAdd    || item.product?.images?.[0] || null;
                const brand = item.product?.brand;
                const price = item.priceAtAdd    || 0;

                return (
                  <div key={id} className={s.item}>
                    <div className={s.itemImgWrap}>
                      {image ? (
                        <img src={image} alt={name} className={s.itemImg} />
                      ) : (
                        <div className={s.itemImgFallback}>
                          <Monitor size={28} strokeWidth={1.3} />
                        </div>
                      )}
                    </div>

                    <div className={s.itemInfo}>
                      {brand && <div className={s.itemBrand}>{brand}</div>}
                      <div className={s.itemName}>{name}</div>
                      <div className={s.itemBottom}>
                        <div className={s.qty}>
                          <button
                            className={s.qtyBtn}
                            onClick={() => updateItem(id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            aria-label={t('cart.decrease_qty')}
                          >
                            <Minus size={12} />
                          </button>
                          <span className={s.qtyNum}>{item.quantity}</span>
                          <button
                            className={s.qtyBtn}
                            onClick={() => updateItem(id, item.quantity + 1)}
                            aria-label={t('cart.increase_qty')}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className={s.itemPrice}>{formatPrice(price * item.quantity)}</span>
                      </div>
                    </div>

                    <button
                      className={s.removeBtn}
                      onClick={() => removeItem(id)}
                      aria-label={t('cart.remove_item')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}

              {/* Coupon */}
              <div className={s.couponRow}>
                <input
                  className={s.couponInput}
                  type="text"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value)}
                  placeholder={t('cart.drawer_coupon_placeholder')}
                  aria-label={t('cart.drawer_coupon_placeholder')}
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

              {/* Shipping note — Cart/Cart Drawer never choose or charge
                  shipping; this is a static, truthful Shipping V1 summary,
                  never personalized to Club status here (see Checkout for
                  the real, authoritative per-order calculation). */}
              <div className={s.shippingNote}>
                <Truck size={13} />
                <span>{t('cart.badge_free_shipping_regular')}</span>
              </div>
            </div>

            {/* Footer */}
            <div className={s.foot}>
              <div className={s.subtotalRow}>
                <span className={s.subtotalLabel}>{t('cart.drawer_subtotal_label')}</span>
                <strong className={s.subtotalVal}>{formatPrice(totalPrice)}</strong>
              </div>
              {couponApplied && (
                <div className={s.discountRow}>
                  <span className={s.discountLabel}>{t('checkout.coupon_discount')}</span>
                  <span className={s.discountVal}>−{formatPrice(couponDiscount)}</span>
                </div>
              )}
              {couponApplied && (
                <div className={s.totalRow}>
                  <span className={s.totalLabel}>{t('cart.total_label')}</span>
                  <span className={s.totalVal}>{formatPrice(displayTotal)}</span>
                </div>
              )}

              <button className={s.checkoutBtn} onClick={handleCheckout}>
                <CreditCard size={17} /> {t('cart.drawer_checkout_btn')}
              </button>

              <Link to="/cart" className={s.viewCartBtn} onClick={onClose}>
                {t('cart.drawer_view_cart_btn')}
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
