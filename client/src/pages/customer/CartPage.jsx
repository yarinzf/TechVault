import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import Button from '../../components/ui/Button/Button';
import { useTranslation } from '../../context/LanguageContext';
import s from './CartPage.module.css';

export default function CartPage() {
  const { items, totalPrice, updateItem, removeItem } = useCart();
  const { toast }    = useToast();
  const navigate     = useNavigate();
  const { formatPrice } = useCurrency('Israel');
  const t = useTranslation();

  const handleUpdate = async (productId, qty) => {
    try { await updateItem(productId, qty); }
    catch (err) { toast.error(err.message); }
  };

  const handleRemove = async (productId) => {
    try { await removeItem(productId); toast.info(t('cart.item_removed')); }
    catch (err) { toast.error(err.message); }
  };

  if (items.length === 0) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🛒</div>
          <h3>{t('cart.empty_title')}</h3>
          <p>{t('cart.empty_sub')}</p>
          <Button onClick={() => navigate('/')}>{t('cart.discover')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className={s.heading}>{t('cart.page_title')}</h1>

      <div className={s.layout}>
        {/* Items */}
        <div className={s.items}>
          {items.map(item => {
            const pid           = String(item.product?._id ?? item.product);
            const price         = item.priceAtAdd ?? item.unitPrice ?? 0;
            const originalPrice = item.originalPriceAtAdd;
            const lineTotal     = price * item.quantity;
            const image         = item.imageAtAdd || item.image || 'https://picsum.photos/80/80';
            const name          = item.nameAtAdd ?? item.name;

            const itemContent = (
              <>
                <img className={s.img} src={image} alt={name} />
                <div className={s.itemBody}>
                  <div className={s.itemName}>{name}</div>
                  <div className={s.itemMeta}>
                    <span className={s.unitPrice}>{formatPrice(price)} {t('cart.per_unit')}</span>
                    {originalPrice && originalPrice > price && (
                      <span className={s.strikePrice}>{formatPrice(originalPrice)}</span>
                    )}
                  </div>
                </div>
              </>
            );

            return (
              <div key={pid} className={s.item}>
                {item.product?.slug ? (
                  <Link to={`/products/${item.product.slug}`} className={s.itemLink}>
                    {itemContent}
                  </Link>
                ) : (
                  <div className={s.itemLink}>{itemContent}</div>
                )}

                <div className={s.itemActions}>
                  <div className={s.qtyCtrl}>
                    <button className={s.qBtn} onClick={() => handleUpdate(pid, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                    <span className={s.qty}>{item.quantity}</span>
                    <button className={s.qBtn} onClick={() => handleUpdate(pid, item.quantity + 1)}>+</button>
                  </div>
                  <div className={s.lineTotal}>{formatPrice(lineTotal)}</div>
                  <button className={s.removeBtn} onClick={() => handleRemove(pid)} title={t('cart.remove_item')}>✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className={s.summary}>
          <h2 className={s.summaryTitle}>{t('checkout.summary_title')}</h2>
          <div className={s.summaryRow}>
            <span>{t('checkout.total_products')}</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          <div className={s.summaryRow}>
            <span>{t('checkout.shipping')}</span>
            <span className={s.free}>{t('checkout.free')}</span>
          </div>
          <div className={s.divider} />
          <div className={`${s.summaryRow} ${s.total}`}>
            <span>{t('checkout.to_pay')}</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>

          <Button full size="lg" onClick={() => navigate('/checkout')} style={{ marginTop: 24 }}>
            {t('cart.proceed_to_checkout')}
          </Button>

          <Link to="/products" className={s.continueShopping}>{t('cart.continue_shopping')}</Link>
        </div>
      </div>
    </div>
  );
}
