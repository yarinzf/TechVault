import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from '../../../../components/ui/ImageWithFallback';
import { useTranslation } from '../../../../context/LanguageContext';
import s from './ProductGallery.module.css';

export default function ProductGallery({ images, name, discountPercent, outOfStock }) {
  const t = useTranslation();
  const [index, setIndex] = useState(0);
  const [swapKey, setSwapKey] = useState(0);

  const list = images?.length ? images : [];
  const hasMultiple = list.length > 1;

  const goTo = (i) => {
    setIndex(i);
    setSwapKey((k) => k + 1);
  };
  const nav = (dir) => goTo((index + dir + list.length) % list.length);

  return (
    <div className={s.gallery}>
      <div className={s.row}>
        {hasMultiple && (
          <div className={s.thumbs}>
            {list.map((img, i) => (
              <button
                key={i}
                type="button"
                className={`${s.thumb}${i === index ? ' ' + s.thumbActive : ''}`}
                onClick={() => goTo(i)}
                aria-label={`${t('product.image_prefix')} ${i + 1}`}
                aria-current={i === index}
              >
                <ImageWithFallback src={img} alt={`${name} ${i + 1}`} className={s.thumbImg} loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <div className={s.mainWrap}>
          {hasMultiple && (
            <button type="button" className={`${s.navBtn} ${s.navPrev}`} onClick={() => nav(-1)} aria-label={t('product.prev_image') }>
              <ChevronLeft size={17} />
            </button>
          )}

          <ImageWithFallback
            key={swapKey}
            src={list[index]}
            alt={name}
            className={s.mainImg}
          />

          {discountPercent != null && (
            <span className={s.discountBadge}>−{discountPercent}%</span>
          )}
          {outOfStock && <div className={s.outOfStockOverlay}>{t('product.out_of_stock')}</div>}

          {hasMultiple && (
            <button type="button" className={`${s.navBtn} ${s.navNext}`} onClick={() => nav(1)} aria-label={t('product.next_image')}>
              <ChevronRight size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
