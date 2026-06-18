import { api } from '../../../services/api';

export const cartService = {
  async get() {
    const { data } = await api.get('/cart');
    return data?.cart ?? data;
  },

  async addItem(productId, quantity = 1) {
    const { data } = await api.post('/cart/items', { productId, quantity });
    return data?.cart ?? data;
  },

  async updateItem(productId, quantity) {
    const { data } = await api.patch(`/cart/items/${productId}`, { quantity });
    return data?.cart ?? data;
  },

  async removeItem(productId) {
    const { data } = await api.delete(`/cart/items/${productId}`);
    return data?.cart ?? data;
  },

  async clear() {
    await api.delete('/cart');
  },
};
