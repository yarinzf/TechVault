import { Link } from 'react-router-dom';
import { ImageWithFallback } from '../../../../components/ui/ImageWithFallback';
import { useLanguage } from '../../../../context/LanguageContext';
import { getLocalizedProductName } from '../../utils/localizedProduct';
import s from './RecentlyViewedStrip.module.css';

// Recently-viewed entries are lightweight localStorage snapshots (see
// useRecentlyViewed), not full product documents, so this renders its own
// compact card rather than reusing ProductCard (which expects the full
// product shape — stock, ratings, specs — that this data doesn't carry).
// The snapshot does carry `name`/`nameHe` though, so it can still localize.
export default function RecentlyViewedStrip({ items, excludeProductId }) {
  const { language } = useLanguage();
  const list = items.filter((i) => i.productId !== String(excludeProductId));
  if (!list.length) return null;

  return (
    <div className={s.grid}>
      {list.slice(0, 4).map((item) => {
        const name = getLocalizedProductName(item, language);
        return (
          <Link key={item.productId} to={`/products/${item.slug}`} className={s.card}>
            <div className={s.imgWrap}>
              <ImageWithFallback src={item.image} alt={name} className={s.img} loading="lazy" />
            </div>
            <div className={s.body}>
              <div className={s.name}>{name}</div>
              <div className={s.price}>₪{Number(item.price).toLocaleString()}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
