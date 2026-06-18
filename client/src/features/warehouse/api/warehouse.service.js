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
};
