// Tri-state stock indicator shared by the product page and product cards.
// Thresholds match the values already in production use (ProductDetailsPage/ProductCard).
export function getStockStatus(stock) {
  if (stock > 10) return 'in';
  if (stock > 0)  return 'low';
  return 'out';
}
