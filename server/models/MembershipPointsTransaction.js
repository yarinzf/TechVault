'use strict';

const mongoose = require('mongoose');

// Auditable Club-points ledger — User.membership.points/lifetimePoints are
// CACHED balances derived from this ledger, never the source of truth
// themselves. Every balance change (earn/redeem/refund/reversal/expiry/
// adjustment) is one immutable transaction here, so history is always
// traceable and reconcilable.
//
// Sign convention: `points` is always a positive magnitude; the `type`
// determines the effect on the balance —
//   earn      → +points (points AND lifetimePoints)
//   redeem    → -points (points only — lifetimePoints is a historical-earn
//                total and must never decrease from redemption)
//   reversal  → context-dependent (see points.service.js): reversing an
//               EARN (order refunded) is -points (points AND lifetimePoints,
//               floored at 0); reversing a REDEEM (payment failed/order
//               cancelled/order refunded) is +points (points only)
//   refund    → reserved for a distinct future refund-specific flow; not
//               currently emitted (refunds use 'reversal' — see above)
//   expiry    → -points (points only; lifetimePoints is a permanent record)
//   adjustment→ signed manual correction (admin tooling only, not used yet)
const TRANSACTION_TYPES = ['earn', 'redeem', 'refund', 'reversal', 'expiry', 'adjustment'];

const membershipPointsTransactionSchema = new mongoose.Schema(
  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    type: {
      type: String,
      enum: { values: TRANSACTION_TYPES, message: 'Invalid points transaction type' },
      required: true,
    },

    points: { type: Number, required: true, min: 0 }, // always a positive magnitude — see sign convention above

    balanceAfter: { type: Number, default: null, min: 0 }, // cached available balance immediately after this transaction

    description: { type: String, trim: true, default: '' },

    // Only meaningful for type:'earn' — when THIS batch of earned points
    // expires (createdAt + POINTS_EXPIRY_MONTHS). Never a single global
    // expiry date — each earning transaction has its own.
    expiresAt: { type: Date, default: null },

    // Set true once an 'earn' transaction has been fully processed by the
    // expiry reconciliation job, so it is never double-counted — see
    // points.service.js#expireDuePoints. Irrelevant for other types.
    expiredProcessed: { type: Boolean, default: false },

    // References the ORIGINAL transaction this one reverses/expires, so a
    // 'reversal' or 'expiry' entry is always traceable back to the 'earn'
    // or 'redeem' it offsets.
    relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPointsTransaction', default: null },

    // Free-form, type-specific audit detail (e.g. { rate, multiplier,
    // eligibleAmount } for 'earn'; never used for business decisions —
    // itemized order fields are the authoritative snapshot, see Order.js).
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

// Idempotency guard: at most one 'earn' and at most one 'redeem' transaction
// per order. Reversals/expiry are separate types and intentionally excluded
// from this constraint (an earn can be reversed once via its own 'reversal'
// row, tracked through relatedTransaction instead of a uniqueness rule,
// since a single order could in principle need more than one reversal-typed
// entry across its lifecycle — e.g. redeem-reversal on cancel AND
// earn-reversal on a later refund would both be legitimate 'reversal' rows
// for the same order).
membershipPointsTransactionSchema.index(
  { order: 1, type: 1 },
  { unique: true, partialFilterExpression: { order: { $type: 'objectId' }, type: { $in: ['earn', 'redeem'] } } }
);

membershipPointsTransactionSchema.index({ user: 1, createdAt: -1 });
// Supports the expiry-reconciliation query: find 'earn' rows whose
// expiresAt has passed and haven't been processed yet.
membershipPointsTransactionSchema.index({ expiresAt: 1, expiredProcessed: 1, type: 1 });

module.exports = mongoose.model('MembershipPointsTransaction', membershipPointsTransactionSchema);
module.exports.TRANSACTION_TYPES = TRANSACTION_TYPES;
