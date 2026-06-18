import { useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  X, ShoppingCart, Minus, Plus, Trash2, ChevronLeft, Package,
} from 'lucide-react';
import { useCart }     from '../../../hooks/useCart';
import { useCurrency } from '../../../features/currency/hooks/useCurrency';
import { useTranslation } from '../../../context/LanguageContext';
import ProgressBar     from '../ProgressBar';
import s from './CartDrawer.module.css';

const FREE_SHIPPING_THRESHOLD = 500;

export default function CartDrawer({ isOpen, onClose }) {
  const { items, totalPrice, totalItems, updateItem, removeItem } = useCart();
  const { formatPrice } = useCurrency('Israel');
  const t             = useTranslation();
  const navigate      = useNavigate();
  const drawerRef     = useRef(null);
  const firstBtnRef   = useRef(null);

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

  const shippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - totalPrice);
  const shippingProgress  = Math.min(100, (totalPrice / FREE_SHIPPING_THRESHOLD) * 100);

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
        <div className={s.header}>
          <div className={s.headerTitle}>
            <ShoppingCart size={18} />
            <span>{t('cart.title')} {totalItems > 0 && `(${totalItems})`}</span>
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

        {/* Free shipping progress bar */}
        {totalItems > 0 && (
          <div className={s.shippingBar}>
            {shippingRemaining > 0 ? (
              <p className={s.shippingLabel}>
                {t('cart.shipping_prefix')}{' '}
                <strong className={s.shippingAmt}>{formatPrice(shippingRemaining)}</strong>
                {' '}{t('cart.shipping_suffix')}
              </p>
            ) : (
              <p className={s.shippingUnlocked}>
                <span>🎉</span> {t('cart.shipping_unlocked')}
              </p>
            )}
            <ProgressBar value={shippingProgress} color="gradient" height={4} />
          </div>
        )}

        {/* Item list */}
        {items.length === 0 ? (
          <div className={s.empty}>
            <Package size={52} strokeWidth={1} className={s.emptyIcon} />
            <p className={s.emptyTitle}>{t('cart.empty_title')}</p>
            <p className={s.emptySub}>{t('cart.empty_sub')}</p>
            <button
              className={s.discoverBtn}
              onClick={() => { onClose(); navigate('/products'); }}
            >
              {t('cart.discover')}
            </button>
          </div>
        ) : (
          <ul className={s.itemList}>
            {items.map((item) => {
              const id    = item.product?._id  || item.product;
              const name  = item.nameAtAdd     || item.product?.name  || t('cart.product_fallback');
              const image = item.imageAtAdd    || item.product?.images?.[0] || null;
              const price = item.priceAtAdd    || 0;

              return (
                <li key={id} className={s.item}>
                  <div className={s.itemImgWrap}>
                    {image ? (
                      <img src={image} alt={name} className={s.itemImg} />
                    ) : (
                      <div className={s.itemImgFallback}>
                        <Package size={20} />
                      </div>
                    )}
                  </div>

                  <div className={s.itemBody}>
                    <p className={s.itemName}>{name}</p>
                    <p className={s.itemUnit}>{formatPrice(price)} {t('cart.per_unit')}</p>

                    <div className={s.itemFooter}>
                      <div className={s.qty}>
                        <button
                          className={s.qtyBtn}
                          onClick={() => updateItem(id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label={t('cart.decrease_qty')}
                        >
                          <Minus size={11} />
                        </button>
                        <span className={s.qtyNum}>{item.quantity}</span>
                        <button
                          className={s.qtyBtn}
                          onClick={() => updateItem(id, item.quantity + 1)}
                          aria-label={t('cart.increase_qty')}
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      <span className={s.itemTotal}>
                        {formatPrice(price * item.quantity)}
                      </span>
                    </div>
                  </div>

                  <button
                    className={s.removeBtn}
                    onClick={() => removeItem(id)}
                    aria-label={`${t('cart.remove')} ${name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className={s.footer}>
            <div className={s.subtotalRow}>
              <span className={s.subtotalLabel}>{t('cart.subtotal')}</span>
              <strong className={s.subtotalAmt}>{formatPrice(totalPrice)}</strong>
            </div>

            <button className={s.checkoutBtn} onClick={handleCheckout}>
              {t('btn.checkout')} · {formatPrice(totalPrice)}
              <ChevronLeft size={16} />
            </button>

            <Link to="/cart" className={s.viewCartLink} onClick={onClose}>
              {t('cart.view_full')}
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
