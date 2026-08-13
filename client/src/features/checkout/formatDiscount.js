// Language-aware presentation for negative/discount summary rows (coupon
// discount, points discount) — the underlying amount stays a plain positive
// number everywhere else (order totals, server payload, etc.); only the
// DISPLAY string gets a sign, and its position depends on convention:
//
// English (LTR): "-₪65.00"  — sign leads, standard Western convention.
// Hebrew  (RTL): "₪65.00-"  — sign trails, the approved Sapir/RTL convention
//   (common in Hebrew financial UIs — a leading "−" glued onto an
//   RTL-formatted currency string is ambiguous under the Unicode
//   bidi algorithm and can visually render as "-65" either way depending on
//   context; appending it after an already RTL-correct formatPrice() output
//   removes that ambiguity and reliably trails the number).
//
// formatPrice is passed in (never reimplemented here) so this never touches
// the currency formatter itself — see features/currency/hooks/useCurrency.js.
export function formatDiscountAmount(amount, formatPrice, language) {
  const formatted = formatPrice(amount);
  return language === 'he' ? `${formatted}-` : `-${formatted}`;
}
