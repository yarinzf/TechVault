import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { ImageWithFallback } from '../../../../components/ui/ImageWithFallback';
import { useLanguage } from '../../../../context/LanguageContext';
import { buildGalleryMedia } from '../../utils/media';
import { getLocalizedProductName } from '../../utils/localizedProduct';
import s from './ProductGallery.module.css';

export default function ProductGallery({ product, discountPercent, outOfStock }) {
  const { t, language } = useLanguage();
  const [index, setIndex] = useState(0);
  const [swapKey, setSwapKey] = useState(0);
  const videoRef = useRef(null);

  const displayName = getLocalizedProductName(product, language);
  const media = buildGalleryMedia(product, displayName);
  const hasMultiple = media.length > 1;
  const active = media[index];

  const goTo = (i) => {
    videoRef.current?.pause();
    setIndex(i);
    setSwapKey((k) => k + 1);
  };
  const nav = (dir) => goTo((index + dir + media.length) % media.length);

  // Pausing on unmount covers navigating away from the product entirely.
  useEffect(() => () => videoRef.current?.pause(), []);

  if (!media.length) {
    return (
      <div className={s.gallery}>
        <div className={s.row}>
          <div className={s.mainWrap}>
            <ImageWithFallback src="" alt={displayName} className={s.mainImg} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.gallery}>
      <div className={s.row}>
        {hasMultiple && (
          <div className={s.thumbs}>
            {media.map((item, i) => (
              <button
                key={i}
                type="button"
                className={`${s.thumb}${i === index ? ' ' + s.thumbActive : ''}`}
                onClick={() => goTo(i)}
                aria-label={item.type === 'video' ? `${displayName} — ${t('product.video_label')}` : `${t('product.image_prefix')} ${i + 1}`}
                aria-current={i === index}
              >
                {item.type === 'video' ? (
                  <>
                    <ImageWithFallback src={item.poster} alt="" className={s.thumbImg} loading="lazy" />
                    <span className={s.thumbPlay}><Play size={14} fill="currentColor" /></span>
                  </>
                ) : (
                  <ImageWithFallback src={item.url} alt={item.alt} className={s.thumbImg} loading="lazy" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className={s.mainWrap}>
          {hasMultiple && (
            <button type="button" className={`${s.navBtn} ${s.navPrev}`} onClick={() => nav(-1)} aria-label={t('product.prev_image')}>
              <ChevronLeft size={17} />
            </button>
          )}

          {active.type === 'video' ? (
            <video
              key={swapKey}
              ref={videoRef}
              className={s.mainVideo}
              src={active.url}
              poster={active.poster}
              controls
              playsInline
              preload="metadata"
              aria-label={active.title}
            >
              <track kind="captions" />
            </video>
          ) : (
            <ImageWithFallback key={swapKey} src={active.url} alt={active.alt} className={s.mainImg} />
          )}

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
