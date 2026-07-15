import { Fragment } from 'react';
import { ShoppingCart, Loader } from 'lucide-react';
import { useTranslation } from '../../../../context/LanguageContext';
import { ImageWithFallback } from '../../../../components/ui/ImageWithFallback';
import Button from '../../../../components/ui/Button/Button';
import s from './FrequentlyBoughtTogether.module.css';

// Not part of Sapir's static mockup, but this bundle-upsell feature already
// existed and works end-to-end (add-all-to-cart), so per the brief it is
// preserved here — just restyled to the new section-card visual language
// instead of dropped for not appearing in the reference file.
export default function FrequentlyBoughtTogether({ currentProduct, companions, onAddAll, adding }) {
  const t = useTranslation();
  if (!companions.length) return null;

  const dp = (p) => p.discountedPrice ?? p.price;
  const total = companions.reduce((sum, p) => sum + dp(p), 0);
  const all = [currentProduct, ...companions];

  return (
    <div className={s.wrap}>
      <div className={s.strip}>
        {all.map((p, i) => (
          <Fragment key={p._id}>
            <div className={`${s.card}${i === 0 ? ' ' + s.cardCurrent : ''}`}>
              <div className={s.imgWrap}>
                <ImageWithFallback src={p.images?.[0] || ''} alt={p.name} className={s.img} loading="lazy" />
                {i === 0 && <span className={s.currentLabel}>{t('product.fbt_current')}</span>}
              </div>
              <p className={s.name}>{p.name}</p>
              <p className={s.price}>₪{dp(p).toFixed(2)}</p>
            </div>
            {i < all.length - 1 && <span className={s.plus} aria-hidden="true">+</span>}
          </Fragment>
        ))}
      </div>

      <div className={s.footer}>
        <div className={s.total}>
          <span className={s.totalLabel}>{t('product.fbt_total_label')}</span>
          <strong className={s.totalPrice}>₪{total.toFixed(2)}</strong>
        </div>
        <Button onClick={() => onAddAll(companions)} disabled={adding}>
          {adding
            ? <><Loader size={14} className={s.spin} /> {t('product.adding')}</>
            : <><ShoppingCart size={14} /> {t('product.fbt_add_all')}</>}
        </Button>
      </div>
    </div>
  );
}
