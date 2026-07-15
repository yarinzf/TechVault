import ProductCard from '../ProductCard';
import s from './RelatedProducts.module.css';

export default function RelatedProducts({ products }) {
  if (!products?.length) return null;

  return (
    <div className={s.grid}>
      {products.slice(0, 4).map((p) => <ProductCard key={p._id} product={p} />)}
    </div>
  );
}
