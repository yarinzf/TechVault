// New Arrivals — single client-side "arrival label" rule, mirroring the
// server's canonical NEW_PRODUCT_DAYS window (see
// server/services/product.service.js#NEW_PRODUCT_DAYS). Used anywhere a
// product card wants to show how recently it joined the catalog — never
// re-derived or hardcoded per call site.
const NEW_PRODUCT_DAYS = 14;
const MS_PER_DAY = 86400000;

// Elapsed whole days since createdAt, based on real elapsed time (not
// calendar-day string slicing, which would drift across midnight/timezones).
function daysSinceArrival(createdAt) {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  return Math.floor((Date.now() - created) / MS_PER_DAY);
}

// Returns a translation key + optional interpolation value, or null when the
// product falls outside the New window. Callers resolve the key via t():
//   const arrival = getArrivalLabel(product.createdAt);
//   const label = arrival && t(arrival.key).replace('{days}', arrival.days ?? '');
function getArrivalLabel(createdAt) {
  const days = daysSinceArrival(createdAt);
  if (days == null || days < 0 || days > NEW_PRODUCT_DAYS) return null;
  if (days === 0) return { key: 'newArrivals.label_today' };
  if (days === 1) return { key: 'newArrivals.label_yesterday' };
  if (days <= 6)  return { key: 'newArrivals.label_days_ago', days };
  return { key: 'newArrivals.label_this_week' };
}

// Convenience: resolves straight to display text given a translator (t).
function arrivalLabelText(createdAt, t) {
  const arrival = getArrivalLabel(createdAt);
  if (!arrival) return null;
  return arrival.days != null
    ? t(arrival.key).replace('{days}', arrival.days)
    : t(arrival.key);
}

export { NEW_PRODUCT_DAYS, daysSinceArrival, getArrivalLabel, arrivalLabelText };
