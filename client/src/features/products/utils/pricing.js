// Resolves the effective price/discount for a product, accounting for both
// a static `compareAtPrice` and a campaign-injected `discountedPrice`/
// `discountPercent` pair (only present on API responses when an active
// campaign covers the product — see server/services/product.service.js).
export function getProductPricing(product) {
  const hasCampaignDiscount = product.discountedPrice != null && product.discountedPrice < product.price;
  const hasStaticDiscount   = !hasCampaignDiscount && product.compareAtPrice != null && product.compareAtPrice > product.price;
  const hasDiscount         = hasCampaignDiscount || hasStaticDiscount;

  const price      = hasCampaignDiscount ? product.discountedPrice : product.price;
  const oldPrice    = hasCampaignDiscount ? product.price : (hasStaticDiscount ? product.compareAtPrice : null);
  const discountPercent = hasCampaignDiscount
    ? product.discountPercent
    : hasStaticDiscount
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : null;
  const savings = hasDiscount && oldPrice != null ? oldPrice - price : null;

  return { price, oldPrice, discountPercent, savings, hasDiscount };
}
