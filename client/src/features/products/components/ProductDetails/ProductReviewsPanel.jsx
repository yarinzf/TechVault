import ReviewsSummary from '../../../reviews/components/ReviewsSummary';
import ReviewsList from '../../../reviews/components/ReviewsList';

export default function ProductReviewsPanel({ productId, average, count, onReviewAction }) {
  return (
    <div>
      <ReviewsSummary productId={productId} average={average} count={count} />
      <ReviewsList productId={productId} onReviewAction={onReviewAction} />
    </div>
  );
}
