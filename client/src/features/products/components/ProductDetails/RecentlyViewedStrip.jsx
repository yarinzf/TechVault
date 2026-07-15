import { Link } from 'react-router-dom';
import { ImageWithFallback } from '../../../../components/ui/ImageWithFallback';
import s from './RecentlyViewedStrip.module.css';

// Recently-viewed entries are lightweight localStorage snapshots (see
// useRecentlyViewed), not full product documents, so this renders its own
// compact card rather than reusing ProductCard (which expects the full
// product shape — stock, ratings, specs — that this data doesn't carry).
export default function RecentlyViewedStrip({ items, excludeProductId }) {
  const list = items.filter((i) => i.productId !== String(excludeProductId));
  if (!list.length) return null;

  return (
    <div className={s.grid}>
      {list.slice(0, 4).map((item) => (
        <Link key={item.productId} to={`/products/${item.slug}`} className={s.card}>
          <div className={s.imgWrap}>
            <ImageWithFallback src={item.image} alt={item.name} className={s.img} loading="lazy" />
          </div>
          <div className={s.body}>
            <div className={s.name}>{item.name}</div>
            <div className={s.price}>₪{Number(item.price).toLocaleString()}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
