'use strict';

const mongoose = require('mongoose');

// ── Status timeline — one entry per status change ─────────────────────────────
const statusHistorySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: '' }, // '' for the creation entry
    toStatus:   { type: String, required: true },
    changedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt:  { type: Date, default: Date.now },
    note:       { type: String, trim: true, default: '' },
  },
  { _id: false } // entries are not individually addressable — no need for _id
);

const ORDER_ITEM_TYPES = ['product', 'membership'];

const orderItemSchema = new mongoose.Schema(
  {
    // 'product' (default) = physical inventory item; 'membership' = digital/
    // service line (TechVault Club) — never touches stock/warehouse logic.
    // Business logic must branch on this explicit field, never on `name`.
    itemType: {
      type: String,
      enum: { values: ORDER_ITEM_TYPES, message: 'Invalid order item type' },
      default: 'product',
    },
    // Required for physical items; absent for digital/service items (there is
    // no Product document to reference).
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: function () { return this.itemType !== 'membership'; },
    },
    // ── Snapshot — values locked at checkout, independent of live product ──
    name:       { type: String, required: true },
    sku:        { type: String, required: true },
    image:      { type: String, default: '' },
    unitPrice:  { type: Number, required: true, min: 0 },
    quantity:   { type: Number, required: true, min: 1 },
    totalPrice: { type: Number, required: true, min: 0 },

    // ── Club points — locked at checkout, never recomputed from live
    // Product/Campaign state later (see points.service.js). Absent/0 for
    // membership lines and for any order placed by a non-member.
    pointsEligible:   { type: Boolean, default: false }, // this line's product.pointsEligible AND buyer was VIP at checkout
    pointsRate:       { type: Number,  default: 0, min: 0 }, // effective rate used (product override or POINTS_DEFAULT_RATE)
    pointsMultiplier: { type: Number,  default: 1, min: 1 }, // active campaign multiplier applied to this line, if any
    pointsEarned:     { type: Number,  default: 0, min: 0 }, // final points this line contributes — locked at checkout

    // ── Campaign attribution snapshot — locked at checkout, forward-looking
    // only (see campaign-analytics audit fix). null/absent means either "no
    // campaign discount applied to this line" OR "this order predates
    // attribution tracking" — the two are indistinguishable by design, and
    // campaign analytics must treat both the same way: excluded, never
    // guessed retroactively from "which campaign contains this product
    // today" (a product can move between campaigns, so that would be
    // historically incorrect). Set ONLY by order.service.js at the moment a
    // campaign discount is actually applied to unitPrice — never editable,
    // never recomputed later even if the campaign itself later changes.
    campaignId:              { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
    campaignTitle:           { type: String, default: null }, // display-name snapshot — survives the campaign being renamed/deleted later
    campaignDiscountPercent: { type: Number, default: null, min: 0, max: 90 }, // the % actually applied — lets analytics reconstruct the pre-discount price
    // Free-form, item-type-specific immutable purchase info (e.g.
    // { membershipPlan: 'monthly' }). Always server-set (never taken from
    // client input) — no business/security decision reads this field;
    // itemType alone drives all membership logic. Still constrained for
    // membership lines so a malformed/arbitrary shape can never be
    // persisted as purchase history. 'lifetime' is intentionally no longer
    // accepted for NEW documents — the one-time-lifetime plan is retired —
    // but historical orders already containing it are untouched (this
    // validator only runs on write, never on read of old data).
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator: function (val) {
          if (this.itemType !== 'membership') return true; // unconstrained for other item types
          if (val == null || typeof val !== 'object' || Array.isArray(val)) return false;
          const keys = Object.keys(val);
          return keys.length === 1 && keys[0] === 'membershipPlan' && ['monthly', 'annual'].includes(val.membershipPlan);
        },
        message: 'Invalid membership metadata — expected exactly { membershipPlan: "monthly" | "annual" }',
      },
    },
  },
  { _id: false }
);

const ORDER_STATUSES   = ['pending_payment', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PAYMENT_STATUSES = ['unpaid', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded'];

// ── Payment history — one entry per payment-status change ─────────────────────
const paymentHistorySchema = new mongoose.Schema(
  {
    fromStatus:    { type: String, default: '' },
    toStatus:      { type: String, required: true },
    changedAt:     { type: Date, default: Date.now },
    changedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note:          { type: String, trim: true, default: '' },
    transactionId: { type: String, default: null },
    amount:        { type: Number, default: null }, // amount involved in this event (refund amount, etc.)
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    items: { type: [orderItemSchema], required: true },

    // Not required at the model level — a membership-only order has nothing to
    // ship. The physical product checkout path enforces these via Joi
    // (createOrderSchema) before an order is ever built.
    shippingAddress: {
      street:  { type: String, trim: true },
      city:    { type: String, trim: true },
      zip:     { type: String, trim: true },
      country: { type: String, trim: true },
      // Safe presentation-only labels — the real (often Hebrew) display text
      // the customer saw and picked in Checkout's city/country SearchableSelect,
      // captured alongside the canonical value above (which stays whatever
      // internal business logic/validation needs — e.g. English "Israel").
      // Absent on orders placed before this field existed; presentation code
      // must fall back to the canonical field, never fabricate a label.
      cityLabel:    { type: String, trim: true },
      countryLabel: { type: String, trim: true },
    },

    subtotal:       { type: Number, required: true, min: 0 },
    taxAmount:      { type: Number, required: true, min: 0 },

    // ── Shipping V1 — snapshot, locked at checkout ──────────────────────────
    // shippingCost is never recomputed later: historical orders must keep
    // the exact amount charged at the time, even if the rules in
    // shipping.service.js change afterward.
    //
    // default: null (NOT 'standard') is deliberate — order.service.js always
    // writes an explicit real value for every order it creates, so this
    // default only ever surfaces for documents Shipping V1 never touched:
    // pre-Shipping-V1 legacy orders, and membership-purchase orders (built
    // directly via Order.create in membership.service.js, which has nothing
    // physical to ship). Defaulting to 'standard' would fabricate a method
    // that was never actually chosen — the presentation layer must show a
    // truthful "not specified" state instead (see orderPresentation.js).
    // null is included in the enum values (matching couponType's existing
    // pattern below) so hydrating/saving a legacy document never fails
    // validation.
    shippingMethod: {
      type: String,
      enum: { values: ['store_pickup', 'standard', 'express', null], message: 'Invalid shipping method' },
      default: null,
    },
    shippingCost:   { type: Number, default: 0, min: 0 },

    // Coupon snapshot — locked at checkout, independent of live coupon state
    couponCode:     { type: String, default: null },
    couponType:     { type: String, enum: ['percentage', 'fixed', null], default: null },
    couponValue:    { type: Number, default: null },
    couponDiscount: { type: Number, default: 0, min: 0 },

    total:          { type: Number, required: true, min: 0 },

    // ── Club points — locked at checkout, authoritative for this order
    // forever (never recomputed from later Product/Campaign/points-rate
    // changes — see points.service.js and Part M of the Club/VIP spec).
    pointsRedeemed:      { type: Number,  default: 0, min: 0 }, // points spent on this order (reserved at creation)
    pointsRedeemedValue: { type: Number,  default: 0, min: 0 }, // ₪ value of the above, at POINTS_REDEMPTION_RATE
    pointsRedeemedReversed: { type: Boolean, default: false },  // true once a cancel/refund has returned the reserved points
    pointsEarned:        { type: Number,  default: 0, min: 0 }, // sum of items[].pointsEarned — locked at creation
    pointsEarnedRealized:{ type: Boolean, default: false },     // true once the 'earn' ledger transaction has been posted (order reached delivered)
    pointsEarnedReversed:{ type: Boolean, default: false },     // true once a full refund has reversed the earned points

    // Real membership context at the moment of purchase — audit trail only;
    // never re-derived from the user's CURRENT (possibly since-changed)
    // membership state. See Part M — historical order economics must stay
    // stable even if the user's plan/points-rate changes later.
    isVipOrder: { type: Boolean, default: false },
    membershipPlanSnapshot: { type: String, enum: ['monthly', 'annual', null], default: null },

    // Idempotency marker for membership PURCHASE orders only — set once
    // activateMembershipForOrder has extended the user's term for this
    // specific order, so a replayed webhook/confirm call is a safe no-op
    // even across renewals (where membership.status legitimately stays
    // 'active' across the whole transition, unlike the old lifetime model).
    membershipActivatedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: { values: ORDER_STATUSES, message: 'Invalid order status' },
      default: 'pending_payment',
    },
    paymentStatus: {
      type: String,
      enum: { values: PAYMENT_STATUSES, message: 'Invalid payment status' },
      default: 'unpaid',
    },
    paymentRef:     { type: String, default: null },   // Stripe PaymentIntent ID (stub)

    // ── Safe payment display snapshot — set once at create-intent time, never
    // the full PAN/CVV (never even transiently stored — only brand/last4 are
    // derived in-memory from the submitted card number and persisted; see
    // payment.controller.js / payment.service.js). null for legacy orders
    // placed before this field existed and for any order where no credit
    // card was actually collected (zero-cash / points-covered orders).
    paymentMethod:     { type: String, enum: ['credit_card', 'zero_cash', null], default: null },
    paymentCardBrand:  { type: String, default: null },
    paymentCardLast4:  { type: String, default: null },
    expiresAt:      { type: Date,   default: null },   // payment deadline for pending_payment orders
    refundedAmount: { type: Number, default: 0, min: 0 }, // cumulative amount refunded so far

    // Concurrency guard for membership purchases ONLY — see membership.service.js.
    // Set to 'pending' while (and only while) this order is a live, payable
    // membership purchase; reset to null the moment it leaves that state
    // (paid, cancelled, or expired). A partial unique index on
    // {user, membershipPendingLock} guarantees at most one 'pending' document
    // per user at the database level, closing the race where two concurrent
    // checkout requests could otherwise both create a payable ₪50 order.
    // Always null for physical product orders — never set outside the
    // membership checkout path.
    membershipPendingLock: { type: String, default: null },

    paymentHistory: { type: [paymentHistorySchema], default: [] },

    notes: { type: String, trim: true },

    // Full lifecycle timeline — appended on every status change
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Conditional shipping-address invariant ─────────────────────────────────────
// shippingAddress fields are optional at the field level (a membership-only
// order has nothing to ship), but any order containing a physical `product`
// item MUST have a valid address. This runs on every save()/create() —
// including internal service calls that bypass the public Joi route — so the
// invariant can never be silently skipped. Pre-existing historical documents
// are unaffected: this only runs on writes, never on reads of old data.
orderSchema.pre('validate', function (next) {
  const hasPhysicalItem = (this.items || []).some(item => item.itemType !== 'membership');
  // Store Pickup has nothing to ship to — no address is required for it,
  // even on an order that otherwise contains physical items (see Shipping
  // V1 spec, Part 20). standard/express still require a full address.
  const requiresAddress = hasPhysicalItem && this.shippingMethod !== 'store_pickup';
  if (requiresAddress) {
    const addr = this.shippingAddress || {};
    if (!addr.street || !addr.city || !addr.country) {
      this.invalidate(
        'shippingAddress',
        'shippingAddress (street, city, country) is required for orders containing physical items'
      );
    }
  }
  next();
});

// ── Computed read-only virtual — never stored ─────────────────────────────────
// 'active'    → payment window open (pending_payment, unpaid, expiresAt in future)
// 'expired'   → window closed but order not yet cancelled by the job
// 'completed' → payment succeeded or order no longer in pending_payment state
orderSchema.virtual('paymentReservationStatus').get(function () {
  if (this.paymentStatus === 'paid')     return 'completed';
  if (this.status !== 'pending_payment') return 'completed';
  if (this.expiresAt && this.expiresAt < new Date()) return 'expired';
  return 'active';
});

// orderNumber is generated by the service (with collision-retry) before save.
// The unique index below is the enforcement layer; the model does not auto-generate it.

// Compound indexes aligned to actual query patterns:
//   listMyOrders  → filter user, sort createdAt
//   listAllOrders → filter status, sort createdAt
//   getOrder      → orderNumber lookup
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ status: 1, expiresAt: 1 }); // for expiry cancellation job
orderSchema.index({ createdAt: -1 }); // unfiltered admin list
orderSchema.index({ status: 1, isVipOrder: -1, createdAt: 1 }); // warehouse VIP-priority queue sort

// Partial unique index — see membershipPendingLock comment above. Only
// documents where the field equals 'pending' participate in uniqueness, so
// every pre-existing order (field absent/null by default) is unaffected —
// no migration needed, and the index can be built safely on a populated
// production collection.
orderSchema.index(
  { user: 1, membershipPendingLock: 1 },
  { unique: true, partialFilterExpression: { membershipPendingLock: 'pending' } }
);

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES   = ORDER_STATUSES;
module.exports.ORDER_ITEM_TYPES = ORDER_ITEM_TYPES;
