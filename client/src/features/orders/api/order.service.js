import { api, qs } from '../../../services/api';

export const orderService = {
  // Deliberately does NOT fall back to MOCK_ORDERS on failure — this is a
  // real purchase history; a failed request must surface as an error to
  // the caller (so the page can show a real error/retry state), never a
  // fabricated order list.
  async listMine(params = {}) {
    const { data, meta } = await api.get(`/orders${qs(params)}`);
    return { orders: data?.orders ?? data ?? [], meta };
  },

  // Server-authoritative account stats ({ totalOrders, totalPaidSpend }) —
  // deliberately does NOT fall back to MOCK_ORDERS-derived numbers on
  // failure like listMine() does; a failed request must surface as a
  // failure to the caller, never a fabricated statistic.
  async getStats() {
    const { data } = await api.get('/orders/stats');
    return data;
  },

  // Deliberately does NOT fall back to fake data on failure — see listMine.
  async getById(id) {
    const { data } = await api.get(`/orders/${id}`);
    return data?.order ?? data;
  },

  async create(shippingAddress, notes, couponCode, pointsToRedeem) {
    const body = { shippingAddress, notes };
    if (couponCode) body.couponCode = couponCode.trim().toUpperCase();
    // Server (order.service.js) is the sole authority on the actual
    // redemption amount/discount — this is only the customer's request.
    if (pointsToRedeem) body.pointsToRedeem = pointsToRedeem;
    const { data } = await api.post('/orders', body);
    return data?.order ?? data;
  },

  async cancel(id) {
    const { data } = await api.patch(`/orders/${id}/cancel`, {});
    return data?.order ?? data;
  },

  async requestReturn(orderId, dto) {
    const { data } = await api.post(`/orders/${orderId}/return`, dto);
    return data?.returnRequest ?? data;
  },

  async listMyReturns(orderId) {
    try {
      const { data } = await api.get(`/orders/${orderId}/returns`);
      return data?.returns ?? data ?? [];
    } catch {
      return [];
    }
  },
};
