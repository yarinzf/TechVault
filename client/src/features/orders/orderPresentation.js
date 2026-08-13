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

// ── Shipping V1 — canonical method → i18n key ──────────────────────────────
// Shared by every Order view that already uses the translation system
// (OrderDetailsPage, OrdersPage, AdminOrdersPage). A legacy order created
// before Shipping V1 (or a membership-purchase order, which has nothing
// physical to ship) has shippingMethod: null — never guessed/inferred from
// shippingCost (a legacy order may show ₪0 for reasons unrelated to Store
// Pickup) — it always falls back to the truthful "not specified" label.
export const SHIPPING_METHOD_LABEL_KEY = {
  store_pickup: 'order.shipping_method.store_pickup',
  standard:     'order.shipping_method.standard',
  express:      'order.shipping_method.express',
};

export const getShippingMethodLabel = (method, t) =>
  t(SHIPPING_METHOD_LABEL_KEY[method] ?? 'order.shipping_method.unknown');

// ── Payment display — safe snapshot fields only ────────────────────────────
// Order.paymentMethod/paymentCardBrand/paymentCardLast4 are set once at
// create-intent time (see server/controllers/payment.controller.js) from
// safe, non-sensitive metadata only — never the full card number or CVV.
// Orders placed before these fields existed have paymentMethod: null, and
// fall back to parsing the same "Payment: ..." segment CheckoutPage.jsx has
// always written into order.notes, exactly as this page always did before
// the fields existed — never a fabricated "4242" for a historical order.
export const parsePaymentFromNotes = (notes, t) => {
  if (!notes) return t('order.payment_card');
  const part = notes.split(' | ').find((p) => p.startsWith('Payment:'));
  const raw  = part ? part.slice('Payment: '.length) : '';
  if (raw === 'כרטיס אשראי' || raw === 'Credit Card') return t('checkout.payment_credit');
  if (raw === 'תשלום במזומן' || raw === 'Cash on Delivery') return t('order.payment_cash');
  return raw || t('order.payment_card');
};

// Sapir's reference shows a plain "כרטיס אשראי •••• 4242" — brand name is
// intentionally never displayed (her design has no brand text), only the
// generic method label plus a masked last4 when a real one is on file.
export const getPaymentLabel = (order, t) => {
  if (order.paymentMethod === 'zero_cash') return t('order.success.payment_zero_cash');
  if (order.paymentMethod === 'credit_card') {
    const label = t('checkout.payment_credit');
    return order.paymentCardLast4 ? `${label} •••• ${order.paymentCardLast4}` : label;
  }
  return parsePaymentFromNotes(order.notes, t);
};

// ── Shipping address display ────────────────────────────────────────────────
// Checkout's country/city SearchableSelect fields carry a canonical value
// (often English — required internally for shipping-country validation and
// street lookup, e.g. "Israel"/"Rehovot") separate from the Hebrew label the
// customer actually saw and picked. Historically only the canonical value
// was ever saved to shippingAddress, so a Hebrew-mode order always rendered
// "Israel"/"Rehovot" in English. CheckoutPage.jsx now also captures
// shippingAddress.countryLabel/cityLabel going forward (see
// onCountryChange/onCityChange there) — this formatter prefers those real
// captured labels, and only falls back to a mapping for the one country
// guaranteed for every real physical order in this app (Shipping V1 is
// Israel-only for standard/express — see shipping.service.js), never an
// arbitrary/fabricated city translation for legacy orders missing cityLabel.
export const formatShippingAddress = (shippingAddress, language, t) => {
  if (!shippingAddress) return null;
  const isHebrew = language === 'he';

  const countryDisplay =
    shippingAddress.countryLabel ||
    (isHebrew && shippingAddress.country === 'Israel' ? 'ישראל' : shippingAddress.country);

  // No safe general English->Hebrew city mapping exists for legacy orders —
  // showing the raw stored value is honest; guessing would not be.
  const cityDisplay = shippingAddress.cityLabel || shippingAddress.city;

  const mainLine = [countryDisplay, cityDisplay, shippingAddress.street]
    .filter(Boolean)
    .join(', ');

  const postalLine = shippingAddress.zip
    ? `${t('checkout.zip')} - ${shippingAddress.zip}`
    : null;

  return { mainLine, postalLine };
};

export const CANCELLABLE_STATUSES = ['pending_payment', 'pending', 'confirmed'];

export const canRequestReturn = (order) =>
  order.status === 'delivered' &&
  ['paid', 'partially_refunded'].includes(order.paymentStatus) &&
  !isMembershipOnlyOrder(order); // digital purchase — nothing physical to return
