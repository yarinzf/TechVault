import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { reviewService } from '../api/review.service';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { useTranslation } from '../../../context/LanguageContext';
import Button from '../../../components/ui/Button/Button';
import ReviewCard from './ReviewCard';
import WriteReviewForm from './WriteReviewForm';
import s from './Reviews.module.css';

// Extracted from the old ProductDetailsPage's private `ReviewsSection` so it
// can be reused outside that page; behavior is unchanged (same eligibility
// gating, pagination and optimistic list updates).
export default function ReviewsList({ productId, onReviewAction }) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const t = useTranslation();
  const location = useLocation();

  const [reviews, setReviews]         = useState([]);
  const [meta, setMeta]               = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editTarget, setEditTarget]   = useState(null);

  const fetchReviews = useCallback(async (page = 1) => {
    const setter = page === 1 ? setLoadingList : setLoadingMore;
    setter(true);
    try {
      const res = await reviewService.list(productId, { page, limit: 10 });
      setMeta(res.meta);
      setReviews((prev) => page === 1 ? (res.data?.reviews ?? []) : [...prev, ...(res.data?.reviews ?? [])]);
    } catch {
      // non-fatal — list stays empty, empty state below covers this
    } finally {
      setter(false);
    }
  }, [productId]);

  useEffect(() => { fetchReviews(1); }, [fetchReviews]);

  useEffect(() => {
    if (authLoading || !user) { setEligibility(null); return; }
    reviewService.checkEligibility(productId)
      .then(setEligibility)
      .catch(() => setEligibility(null));
  }, [productId, user, authLoading]);

  const withUser = (review) => ({
    ...review,
    user: { _id: user._id, name: user.name },
  });

  const handleNewReview = (review) => {
    setReviews((prev) => [withUser(review), ...prev]);
    setEligibility((e) => ({ ...e, canReview: false, hasReviewed: true, userReview: review, reason: 'already_reviewed' }));
    onReviewAction?.();
  };

  const handleUpdatedReview = (review) => {
    setReviews((prev) => prev.map((r) => (r._id === review._id ? withUser(review) : r)));
    setEligibility((e) => ({ ...e, userReview: review }));
    setEditTarget(null);
    onReviewAction?.();
  };

  const handleDelete = async (reviewId) => {
    try {
      await reviewService.remove(reviewId);
      setReviews((prev) => prev.filter((r) => r._id !== reviewId));
      setEligibility((e) => ({ ...e, canReview: true, hasReviewed: false, userReview: null, reason: 'eligible' }));
      toast.info(t('product.toast_review_deleted'));
      onReviewAction?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const canLoadMore = meta && meta.page < meta.pages;

  return (
    <div className={s.reviewsInner}>
      {!authLoading && (
        <>
          {!user && (
            <div className={s.gateBox}>
              <Link to="/login" state={{ returnTo: `${location.pathname}${location.search}` }}>{t('product.review_login')}</Link> {t('product.review_login_prompt')}
            </div>
          )}

          {user && eligibility && (
            <>
              {eligibility.canReview && !editTarget && (
                <WriteReviewForm productId={productId} onSuccess={handleNewReview} />
              )}
              {eligibility.hasReviewed && eligibility.userReview && editTarget?._id === eligibility.userReview._id && (
                <WriteReviewForm
                  productId={productId}
                  initial={eligibility.userReview}
                  onSuccess={(r) => handleUpdatedReview(r)}
                  onCancel={() => setEditTarget(null)}
                />
              )}
              {eligibility.reason === 'not_purchased' && (
                <div className={s.gateBox}>{t('product.review_gate')}</div>
              )}
            </>
          )}
        </>
      )}

      {loadingList ? (
        <div className={s.emptyReviews}>{t('product.reviews_loading')}</div>
      ) : reviews.length === 0 ? (
        <div className={s.emptyReviews}>{t('product.reviews_empty')}</div>
      ) : (
        <>
          <div className={s.reviewsList}>
            {reviews.map((r) => (
              <ReviewCard
                key={r._id}
                review={r}
                currentUserId={user?._id}
                onEdit={(rev) => setEditTarget(rev)}
                onDelete={handleDelete}
              />
            ))}
          </div>
          {canLoadMore && (
            <div className={s.loadMore}>
              <Button variant="secondary" size="sm" onClick={() => fetchReviews(meta.page + 1)} disabled={loadingMore}>
                {loadingMore ? t('product.loading') : t('product.load_more_reviews')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
