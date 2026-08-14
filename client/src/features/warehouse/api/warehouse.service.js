import { api, qs } from '../../../services/api';

export const warehouseService = {
  async listInventory(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/inventory/list${qs(params)}`);
      return { products: data?.products ?? data ?? [], meta };
    } catch {
      return { products: [], meta: null };
    }
  },

  // Exact barcode/SKU lookup for the scanner — deliberately NOT wrapped in a
  // try/catch fallback (unlike listInventory above): a lookup failure must
  // reach the caller as a real error, distinguishable from a genuine "no
  // product matches this code" result (which is `null`, not a thrown error).
  async lookupProduct(code) {
    const { data } = await api.get(`/admin/inventory/lookup${qs({ code })}`);
    return data?.product ?? null;
  },

  async listMovements(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/inventory/movements${qs(params)}`);
      return { movements: data?.movements ?? data ?? [], meta };
    } catch {
      return { movements: [], meta: null };
    }
  },

  async restock(productId, dto) {
    const { data } = await api.post(`/admin/inventory/products/${productId}/restock`, dto);
    return data?.product ?? data;
  },

  async adjust(productId, dto) {
    const { data } = await api.post(`/admin/inventory/products/${productId}/adjust`, dto);
    return data?.product ?? data;
  },

  async markDamaged(productId, dto) {
    const { data } = await api.post(`/admin/inventory/products/${productId}/damaged`, dto);
    return data?.product ?? data;
  },

  // Real, persisted warehouse settings (GET/PATCH /admin/inventory/settings)
  // — deliberately NOT wrapped in a try/catch fallback like the read methods
  // above: a settings load/save failure must surface as a real error to the
  // caller, never silently substitute an empty/default result.
  async getSettings() {
    const { data } = await api.get('/admin/inventory/settings');
    return data?.settings ?? data;
  },

  async updateSettings(dto) {
    const { data } = await api.patch('/admin/inventory/settings', dto);
    return data?.settings ?? data;
  },
};
