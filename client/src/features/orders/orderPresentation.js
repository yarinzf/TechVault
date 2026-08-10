import { Clock, CreditCard, Truck, Check, XCircle } from 'lucide-react';

// Sapir's badge states map onto the real backend `status` field this way —
// a PRESENTATION mapping only, the real `status` value is never renamed or
// altered. Shared between OrdersPage (list cards) and OrderDetailsPage.
//
// pending_payment/pending are NOT "preparing" — the order hasn't been paid
// or confirmed yet, so grouping it with confirmed/processing would claim
// fulfillment work is happening when it isn't (payment.controller.js and
// admin.service.js both treat pending_payment/pending as pre-confirmation,
// not-yet-real-revenue states). They get their own "Pending Payment" badge.
export const getBadgeBucket = (status) => {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'delivered') return 'delivered';
  if (status === 'shipped') return 'shipping';
  if (status === 'pending_payment' || status === 'pending') return 'pending_payment';
  return 'preparing'; // confirmed, processing
};

export const BADGE_ICON = {
  pending_payment: CreditCard,
  preparing: Clock,
  shipping: Truck,
  delivered: Check,
  cancelled: XCircle,
};

export const BADGE_LABEL_KEY = {
  pending_payment: 'order.status.pending_payment',
  preparing: 'order.filter.preparing',
  shipping: 'order.status.shipped',
  delivered: 'order.status.delivered',
  cancelled: 'order.status.cancelled',
};

// 5 real stages — the reference's 6th stage ("נארזה"/Packed) has no
// backend-fulfillment equivalent (real statuses jump confirmed→processing
// →shipped) so it's omitted rather than faked; see the final report.
export const TIMELINE_STAGES = ['received', 'paid', 'preparing', 'shipped', 'delivered'];

// Real statuses jump straight from pending_payment/pending to confirmed once
// paid, so "payment approved" is never independently observable as its own
// status — it's implied (done) the moment status reaches confirmed/beyond.
const STATUS_TO_STAGE_INDEX = {
  pending_payment: 0,
  pending: 0,
  confirmed: 2,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

export const getTimelineSteps = (order) => {
  const currentIdx = STATUS_TO_STAGE_INDEX[order.status] ?? 0;
  return TIMELINE_STAGES.map((key, i) => ({
    key,
    done: i < currentIdx,
    current: i === currentIdx,
  }));
};

export const isMembershipOnlyOrder = (order) =>
  (order.items ?? []).length > 0 && (order.items ?? []).every((item) => item.itemType === 'membership');

export const CANCELLABLE_STATUSES = ['pending_payment', 'pending', 'confirmed'];

export const canRequestReturn = (order) =>
  order.status === 'delivered' &&
  ['paid', 'partially_refunded'].includes(order.paymentStatus) &&
  !isMembershipOnlyOrder(order); // digital purchase — nothing physical to return
