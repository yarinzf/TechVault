import { useState, useEffect } from 'react';
import { reviewService } from '../api/review.service';
import { useTranslation } from '../../../context/LanguageContext';
import StarRating from '../../../components/ui/StarRating/StarRating';
import s from './Reviews.module.css';

// Aggregate score + per-star breakdown, shown above the review list —
// mirrors the design reference's "pp-reviews-header" block. The breakdown
// bars need a real histogram (not just average+count), so this fetches the
// additive `/reviews/distribution` endpoint; if that fails the score itself
// (already known from `product.ratings`) still renders without the bars.
export default function ReviewsSummary({ productId, average, count }) {
  const t = useTranslation();
  const [dist, setDist] = useState(null);

  useEffect(() => {
    if (!count) return;
    reviewService.getDistribution(productId).then(setDist).catch(() => setDist(null));
  }, [productId, count]);

  if (!count) return null;

  return (
    <div className={s.summary}>
      <div className={s.summaryScore}>
        <div className={s.summaryScoreNum}>{average.toFixed(1)}</div>
        <StarRating value={average} size={18} />
        <div className={s.summaryScoreCount}>{count} {t('product.reviews_label')}</div>
      </div>

      {dist && dist.total > 0 && (
        <div className={s.summaryBars}>
          {dist.stars.map(({ star, percent }) => (
            <div key={star} className={s.barRow}>
              <span className={s.barLabel}>{star}</span>
              <div className={s.barTrack}>
                <div className={s.barFill} style={{ width: `${percent}%` }} />
              </div>
              <span className={s.barPct}>{percent}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
