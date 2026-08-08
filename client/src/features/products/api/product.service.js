import { api, qs } from '../../../services/api';

// Mock fallback only used by navbar autocomplete when backend is unreachable.
// The catalog and home page throw errors and let callers handle them — no silent mocks.
export const MOCK_PRODUCTS = [
  { _id: '1', name: 'MacBook Pro 14" M3', slug: 'macbook-pro-14-m3', price: 1999.99, compareAtPrice: 2199.99, stock: 25, brand: 'Apple', images: ['https://picsum.photos/seed/mbp/400/300'], ratings: { average: 4.8, count: 83 }, category: { name: 'Laptops', slug: 'laptops' }, isPublished: true },
  { _id: '2', name: 'iPhone 15 Pro',      slug: 'iphone-15-pro',     price: 1099.99, compareAtPrice: 1199.99, stock: 50, brand: 'Apple', images: ['https://picsum.photos/seed/ip15/400/300'], ratings: { average: 4.7, count: 120 }, category: { name: 'Smartphones', slug: 'smartphones' }, isPublished: true },
  { _id: '3', name: 'Sony WH-1000XM5',   slug: 'sony-wh-1000xm5',   price: 349.99,  compareAtPrice: 399.99,  stock: 40, brand: 'Sony',  images: ['https://picsum.photos/seed/sony/400/300'],  ratings: { average: 4.9, count: 201 }, category: { name: 'Headphones', slug: 'headphones' }, isPublished: true },
  { _id: '4', name: 'Anker USB-C Hub',   slug: 'anker-usb-c-hub-7-in-1', price: 49.99, stock: 150, brand: 'Anker', images: ['https://picsum.photos/seed/anker/400/300'], ratings: { average: 4.4, count: 312 }, category: { name: 'Accessories', slug: 'accessories' }, isPublished: true },
];

export const productService = {
  // Returns { products, meta } — throws on backend failure (callers handle errors)
  async list(params = {}) {
    const { data, meta } = await api.get(`/products${qs(params)}`);
    return { products: data?.products ?? data ?? [], meta };
  },

  async getBySlug(slug) {
    try {
      const { data } = await api.get(`/products/${slug}`);
      return data?.product ?? data;
    } catch {
      return MOCK_PRODUCTS.find(p => p.slug === slug) ?? null;
    }
  },

  async autocomplete(q) {
    try {
      const { data } = await api.get(`/products/autocomplete${qs({ q })}`);
      return data?.products ?? data ?? [];
    } catch {
      return MOCK_PRODUCTS.filter(p => p.name.toLowerCase().startsWith(q.toLowerCase())).slice(0, 6);
    }
  },

  // Returns [] on failure — categories are non-critical (UI degrades gracefully)
  async getCategories() {
    try {
      const { data } = await api.get('/products/categories');
      return data?.categories ?? data ?? [];
    } catch {
      return [];
    }
  },

  // New Arrivals — thin wrapper over list({ new: true, ... }); same
  // catalog-enriched product shape (campaign pricing included), no
  // separate data source. Throws on failure like list() — callers show
  // a real error/retry state rather than an empty page.
  async listNew(params = {}) {
    return this.list({ ...params, new: 'true' });
  },

  // New Arrivals — brands whose entire real catalog presence is recent.
  // Returns [] on failure — non-critical, page degrades gracefully.
  async getNewBrands() {
    try {
      const { data } = await api.get('/products/new-brands');
      return data?.brands ?? data ?? [];
    } catch {
      return [];
    }
  },

  async updateStock(id, type, amount) {
    const { data } = await api.patch(`/products/${id}/stock`, { type, amount });
    return data?.product ?? data;
  },

  async getStockHistory(id) {
    const { data } = await api.get(`/products/${id}/stock-history`);
    return data;
  },

  async getRecommendations(productId) {
    try {
      const { data } = await api.get(`/products/${productId}/recommendations`);
      return { related: data?.related ?? [], alsoBought: data?.alsoBought ?? [] };
    } catch {
      return { related: [], alsoBought: [] };
    }
  },

  async getTrending(limit = 8) {
    try {
      const { data } = await api.get(`/products/trending${qs({ limit })}`);
      return data?.products ?? [];
    } catch {
      return [];
    }
  },

  async getTopRated(limit = 8) {
    try {
      const { data } = await api.get(`/products/top-rated${qs({ limit })}`);
      return data?.products ?? [];
    } catch {
      return [];
    }
  },

  // Backward-compatible bare-array form — WishlistPage's fallback
  // recommendation call relies on exactly this shape (a plain product
  // array), so it always takes just a limit and returns `data.products`
  // directly regardless of the richer envelope the endpoint now returns.
  async getBestSellers(limit = 8) {
    try {
      const { data } = await api.get(`/products/best-sellers${qs({ limit })}`);
      return data?.products ?? [];
    } catch {
      return [];
    }
  },

  // Full envelope — { period, periodStart, periodEnd, products } — for the
  // dedicated Best Sellers page, which needs the period metadata (e.g. to
  // localize "this month"'s real name) alongside the ranked products.
  async getBestSellersRanking({ limit = 4, period = 'overall' } = {}) {
    try {
      const { data } = await api.get(`/products/best-sellers${qs({ limit, period })}`);
      return {
        period:      data?.period ?? period,
        periodStart: data?.periodStart ?? null,
        periodEnd:   data?.periodEnd ?? null,
        products:    data?.products ?? [],
      };
    } catch {
      return { period, periodStart: null, periodEnd: null, products: [] };
    }
  },

  async compare(ids) {
    const { data } = await api.post('/products/compare', { ids });
    return data?.products ?? [];
  },
};
