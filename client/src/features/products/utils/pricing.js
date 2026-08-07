// Resolves the effective price/discount for a product. A product is "on
// sale" ONLY when a currently active Campaign discounts it (discountedPrice/
// discountPercent, injected by the server — see
// server/services/product.service.js). `compareAtPrice` is a legacy/
// reference-price field only; it must never independently create a
// strikethrough price, a discount badge, or "on sale" status.
export function getProductPricing(product) {
  const hasDiscount = product.discountedPrice != null && product.discountedPrice < product.price;

  const price           = hasDiscount ? product.discountedPrice : product.price;
  const oldPrice         = hasDiscount ? product.price : null;
  const discountPercent = hasDiscount ? product.discountPercent : null;
  const savings          = hasDiscount && oldPrice != null ? oldPrice - price : null;

  return { price, oldPrice, discountPercent, savings, hasDiscount };
}
