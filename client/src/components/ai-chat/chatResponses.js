// Deterministic response provider for the AI Chat widget prototype.
//
// This is intentionally NOT a real AI backend — there is no LLM call, no
// external API, no product-catalog scoring. It is a small keyword-matching
// + guided-flow state machine that answers only with facts already
// established elsewhere in this app (shipping threshold, returns window,
// real routes). If a real backend chat endpoint is ever added, this module
// is the single seam to replace: swap `matchCategory`/`buildResponse` for a
// real API call and the widget component itself needs no other changes.

// Mirrors Sapir's 5-card `.sw-quick-grid` exactly (order, shipping, payment,
// returns, warranty) — the CSS gives the 5th (odd, last) card the full row.
export const PRIMARY_GRID_ACTIONS = [
  { id: 'order',    icon: 'Package',    labelKey: 'aiChat.quick_order' },
  { id: 'shipping', icon: 'Truck',      labelKey: 'aiChat.quick_shipping' },
  { id: 'payment',  icon: 'CreditCard', labelKey: 'aiChat.quick_payment' },
  { id: 'returns',  icon: 'RotateCcw',  labelKey: 'aiChat.quick_returns' },
  { id: 'warranty', icon: 'ShieldCheck', labelKey: 'aiChat.quick_warranty' },
];

// Mirrors Sapir's larger `.sw-advice-card` below the grid.
export const ADVICE_ACTION = {
  id: 'recommend',
  icon: 'Sparkles',
  titleKey: 'aiChat.advice_title',
  subKey: 'aiChat.advice_sub',
};

// Mirrors Sapir's `.sw-secondary-links` row (2 buttons).
export const SECONDARY_ACTIONS = [
  { id: 'account', icon: 'User',  labelKey: 'aiChat.secondary_account' },
  { id: 'contact', icon: 'Phone', labelKey: 'aiChat.secondary_contact' },
];

// Mirrors Sapir's `.sw-faq-chips` (3 chips). The 3rd chip reuses the
// recommendation flow but presets the category to "monitors" since its own
// visible label already names a gaming monitor.
export const FAQ_ACTIONS = [
  { id: 'shipping',         labelKey: 'aiChat.faq_shipping' },
  { id: 'returns',          labelKey: 'aiChat.faq_returns' },
  { id: 'recommendMonitor', labelKey: 'aiChat.faq_advice' },
];

// Real, seeded category slugs (verified against GET /products/categories)
export const RECOMMEND_CATEGORIES = [
  { slug: 'monitors',   labelKey: 'aiChat.cat_monitors' },
  { slug: 'keyboards',  labelKey: 'aiChat.cat_keyboards' },
  { slug: 'mice',       labelKey: 'aiChat.cat_mice' },
  { slug: 'headphones', labelKey: 'aiChat.cat_headphones' },
  { slug: 'desktops',   labelKey: 'aiChat.cat_desktops' },
];

// Keyword rules — checked in order, first match wins. Hebrew and English
// phrases both map to the same conservative, truthful category.
const KEYWORD_RULES = [
  { category: 'recommend', keywords: ['עזרו לי לבחור', 'המלצה', 'מתאים לי', 'recommend', 'which computer', 'which product', 'right for me'] },
  { category: 'find',      keywords: ['מסך', 'גיימינג', 'מחפש', 'gaming monitor', 'looking for', 'find a', 'monitor', 'keyboard', 'mouse', 'headphone', 'laptop'] },
  { category: 'compare',   keywords: ['השווא', 'להשוות', 'compare', 'comparison'] },
  { category: 'shipping',  keywords: ['משלוח', 'shipping', 'delivery'] },
  { category: 'returns',   keywords: ['מחזיר', 'החזר', 'return', 'refund'] },
  { category: 'order',     keywords: ['הזמנה שלי', 'איפה ההזמנה', 'my order', 'track', 'order status'] },
  { category: 'payment',   keywords: ['תשלום', 'לשלם', 'payment', 'pay', 'credit card'] },
  { category: 'warranty',  keywords: ['אחריות', 'תיקון', 'warranty', 'repair'] },
  { category: 'account',   keywords: ['חשבון', 'account', 'profile'] },
  { category: 'contact',   keywords: ['יצירת קשר', 'ליצור קשר', 'תמיכה', 'contact', 'support', 'נציג'] },
];

export function matchCategory(text) {
  const lower = text.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) return rule.category;
  }
  return null;
}

export function matchRecommendCategory(text, t) {
  const lower = text.toLowerCase().trim();
  for (const cat of RECOMMEND_CATEGORIES) {
    const label = t(cat.labelKey).toLowerCase();
    if (lower.includes(label) || label.includes(lower) || lower.includes(cat.slug) || cat.slug.includes(lower)) {
      return cat.slug;
    }
  }
  return null;
}

// Truthful, conservative responses only — never invents stock, delivery
// dates, order status, warranty duration, prices, or support availability.
// Where live data would be required, the response points to the real site
// feature instead.
export function buildResponse(category, t) {
  switch (category) {
    case 'shipping':
      return { text: t('aiChat.resp_shipping'), action: { labelKey: 'aiChat.action_view_terms', route: '/terms' } };
    case 'returns':
      return { text: t('aiChat.resp_returns'), action: { labelKey: 'aiChat.action_view_terms', route: '/terms' } };
    case 'order':
      return { text: t('aiChat.resp_order'), action: { labelKey: 'aiChat.action_view_orders', route: '/orders' } };
    case 'payment':
      return { text: t('aiChat.resp_payment'), action: null };
    case 'warranty':
      return { text: t('aiChat.resp_warranty'), action: { labelKey: 'aiChat.action_view_terms', route: '/terms' } };
    case 'account':
      return { text: t('aiChat.resp_account'), action: { labelKey: 'aiChat.action_view_account', route: '/profile' } };
    case 'compare':
      return { text: t('aiChat.resp_compare'), action: { labelKey: 'aiChat.action_view_compare', route: '/compare' } };
    case 'find':
      return { text: t('aiChat.resp_find'), action: { labelKey: 'aiChat.action_view_products', route: '/products' } };
    case 'contact':
      return { text: t('aiChat.resp_contact'), action: { labelKey: 'aiChat.action_view_terms', route: '/terms' } };
    default:
      return { text: t('aiChat.resp_fallback'), action: null };
  }
}
