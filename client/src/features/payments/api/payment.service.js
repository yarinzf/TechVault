import { api } from '../../../services/api';

export const paymentService = {
  async createIntent(orderId, cardDetails = {}) {
    const { data } = await api.post('/payments/create-intent', { orderId, ...cardDetails });
    return data;
  },

  async confirmPayment(orderId, paymentIntentId) {
    const { data } = await api.post('/payments/confirm', { orderId, paymentIntentId });
    return data?.order ?? data;
  },
};
