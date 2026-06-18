'use strict';

const mongoose = require('mongoose');

const REVIEW_STATUSES = ['published', 'hidden', 'flagged'];

const reviewSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    order:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order',   default: null },
    rating:  { type: Number, required: true, min: 1, max: 5 },
    title:   { type: String, trim: true, maxlength: [100, 'Title cannot exceed 100 characters'] },
    body:    { type: String, trim: true, maxlength: [2000, 'Body cannot exceed 2000 characters'] },
    isVerifiedPurchase: { type: Boolean, default: false },
    status:  { type: String, enum: REVIEW_STATUSES, default: 'published' },
  },
  { timestamps: true },
);

// One review per product per user
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ status: 1, createdAt: -1 });

// ─── Rating recalculation ─────────────────────────────────────────────────────
// Only published reviews count toward the product rating so moderation
// (hiding/flagging) immediately corrects the displayed average.
const recalculateRating = async (productId) => {
  const Product = mongoose.model('Product');
  const result = await mongoose.model('Review').aggregate([
    { $match: { product: productId, status: 'published' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = result[0] ?? {};
  await Product.findByIdAndUpdate(productId, {
    'ratings.average': Math.round(avg * 10) / 10,
    'ratings.count':   count,
  });
};

reviewSchema.post('save', async function () {
  await recalculateRating(this.product);
});

reviewSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await recalculateRating(doc.product);
});

const Review = mongoose.model('Review', reviewSchema);
Review.recalculateRating = recalculateRating;

module.exports = Review;
module.exports.REVIEW_STATUSES = REVIEW_STATUSES;
