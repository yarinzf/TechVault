import StarRating from '../../../components/ui/StarRating/StarRating';
import { useTranslation } from '../../../context/LanguageContext';
import s from './Reviews.module.css';

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });

export default function ReviewCard({ review, currentUserId, onEdit, onDelete }) {
  const t = useTranslation();
  const isOwner = currentUserId && review.user?._id === currentUserId;

  return (
    <div className={s.reviewCard}>
      <div className={s.reviewHeader}>
        <div className={s.reviewMeta}>
          <span className={s.reviewAuthor}>{review.user?.name ?? t('product.user_fallback')}</span>
          {review.isVerifiedPurchase && (
            <span className={s.verifiedBadge}>{t('product.verified_purchase')}</span>
          )}
          <span className={s.reviewDate}>{fmtDate(review.createdAt)}</span>
        </div>
        <StarRating value={review.rating} size={14} />
      </div>
      {review.title && <div className={s.reviewTitle}>{review.title}</div>}
      {review.body && <div className={s.reviewBody}>{review.body}</div>}
      {isOwner && (
        <div className={s.reviewActions}>
          <button className={s.actionBtn} onClick={() => onEdit(review)}>{t('product.review_edit')}</button>
          <button className={`${s.actionBtn} ${s.actionBtnDanger}`} onClick={() => onDelete(review._id)}>{t('product.review_delete')}</button>
        </div>
      )}
    </div>
  );
}
