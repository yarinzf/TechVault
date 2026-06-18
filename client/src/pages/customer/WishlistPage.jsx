import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useWishlist } from '../../hooks/useWishlist';
import { wishlistService } from '../../features/wishlist/api/wishlist.service';
import ProductCard from '../../features/products/components/ProductCard';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import Button from '../../components/ui/Button/Button';
import { useTranslation } from '../../context/LanguageContext';
import s from './WishlistPage.module.css';

export default function WishlistPage() {
  const { user } = useAuth();
  const { ids } = useWishlist();
  const navigate = useNavigate();
  const t = useTranslation();

  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    wishlistService.get()
      .then(w => setProducts(w.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [user]);

  // Keep displayed list in sync when user removes items via heart button
  useEffect(() => {
    setProducts(prev => prev.filter(p => ids.has(String(p._id))));
  }, [ids]);

  if (!user) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🔒</div>
          <h3>{t('wishlist.login_required')}</h3>
          <p>{t('wishlist.login_prompt')}</p>
          <Button onClick={() => navigate('/login')}>{t('wishlist.login_btn')}</Button>
        </div>
      </div>
    );
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="page">
      <h1 className={s.heading}>{t('wishlist.page_title')}</h1>

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🤍</div>
          <h3>{t('wishlist.empty_title')}</h3>
          <p>{t('wishlist.empty_sub')}</p>
          <Button onClick={() => navigate('/products')}>{t('wishlist.discover')}</Button>
        </div>
      ) : (
        <>
          <p className={s.count}>{products.length} {t('wishlist.count')}</p>
          <div className={s.grid}>
            {products.map(p => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
