import { useState } from 'react';
import { reviewService } from '../api/review.service';
import { useToast } from '../../../hooks/useToast';
import { useTranslation } from '../../../context/LanguageContext';
import StarRating from '../../../components/ui/StarRating/StarRating';
import Button from '../../../components/ui/Button/Button';
import s from './Reviews.module.css';

export default function WriteReviewForm({ productId, initial, onSuccess, onCancel }) {
  const { toast } = useToast();
  const t = useTranslation();
  const isEdit = !!initial;

  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [title, setTitle]   = useState(initial?.title ?? '');
  const [body, setBody]     = useState(initial?.body ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!rating) { toast.error(t('product.toast_rate_required')); return; }
    setSaving(true);
    try {
      const dto = { rating, ...(title.trim() && { title: title.trim() }), ...(body.trim() && { body: body.trim() }) };
      const review = isEdit
        ? await reviewService.update(initial._id, dto)
        : await reviewService.create(productId, dto);
      toast.success(isEdit ? t('product.toast_review_updated') : t('product.toast_review_saved'));
      onSuccess(review, isEdit);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.writeReviewBox}>
      <div className={s.writeReviewTitle}>{isEdit ? t('product.review_edit_title') : t('product.review_write')}</div>
      <StarRating value={rating} onChange={setRating} size={28} disabled={saving} />
      <div className={s.reviewFormField}>
        <label className={s.reviewFormLabel}>{t('product.review_title_label')}</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder={t('product.review_title_ph')}
          disabled={saving}
        />
      </div>
      <div className={s.reviewFormField}>
        <label className={s.reviewFormLabel}>{t('product.review_body_label')}</label>
        <textarea
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder={t('product.review_body_ph')}
          disabled={saving}
          style={{ resize: 'vertical' }}
        />
      </div>
      <div className={s.reviewFormRow}>
        {onCancel && <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>{t('btn.cancel')}</Button>}
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? t('product.review_saving') : isEdit ? t('product.review_update') : t('product.review_submit')}
        </Button>
      </div>
    </div>
  );
}
