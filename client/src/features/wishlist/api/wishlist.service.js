import { api } from '../../../services/api';

export const wishlistService = {
  get:    ()          => api.get('/wishlist').then(r => r.data?.wishlist ?? { products: [] }),
  add:    (productId) => api.post(`/wishlist/${productId}`).then(r => r.data?.wishlist),
  remove: (productId) => api.delete(`/wishlist/${productId}`).then(r => r.data?.wishlist),
};
