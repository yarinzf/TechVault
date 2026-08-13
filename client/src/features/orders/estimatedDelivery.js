// Estimated-delivery presentation helper for Order Success.
//
// The three commitments used here are NOT invented for this helper — they
// are the exact same approved numbers already shown to customers on
// Checkout's delivery-method cards (see checkout.delivery.standard_desc /
// express_desc / store_desc in i18n/translations.js: "3–5 ימי עסקים" /
// "עד 2 ימי עסקים" / "מהחנות שלנו — עוד היום"). This helper turns those into
// a real order-date-relative estimate instead of a fabricated generic date.
//
// Informational only — never alters real Order status or shipping price
// logic (see server/services/shipping.service.js, untouched).
const STANDARD_MIN_BUSINESS_DAYS = 3;
const STANDARD_MAX_BUSINESS_DAYS = 5;
const EXPRESS_MAX_BUSINESS_DAYS  = 2;

// TechVault's business week is Sunday–Thursday (Israeli work week) —
// Friday (5) and Saturday (6) are the weekend and must be skipped, not
// Saturday/Sunday.
const isIsraeliBusinessDay = (d) => d.getDay() !== 5 && d.getDay() !== 6;

function addBusinessDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (isIsraeliBusinessDay(d)) added++;
  }
  return d;
}

const fmtDate = (d, language) =>
  d.toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', { month: 'long', day: 'numeric' });

/**
 * getEstimatedDelivery(order, t, language)
 * Returns a display string for Sapir's "משלוח משוער" field, or null when
 * there is nothing real to show (membership-only orders, or a
 * shippingMethod with no approved commitment — legacy/unknown — where
 * inventing a date would be dishonest).
 */
export function getEstimatedDelivery(order, t, language) {
  const base = order?.createdAt ? new Date(order.createdAt) : new Date();
  switch (order?.shippingMethod) {
    case 'store_pickup':
      return t('order.success.delivery_pickup_ready');
    case 'standard': {
      const from = addBusinessDays(base, STANDARD_MIN_BUSINESS_DAYS);
      const to   = addBusinessDays(base, STANDARD_MAX_BUSINESS_DAYS);
      return `${fmtDate(from, language)} – ${fmtDate(to, language)}`;
    }
    case 'express': {
      const by = addBusinessDays(base, EXPRESS_MAX_BUSINESS_DAYS);
      return `${t('order.success.delivery_until')} ${fmtDate(by, language)}`;
    }
    default:
      return null;
  }
}
