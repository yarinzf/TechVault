import { api, qs } from '../../../services/api';

export const MOCK_ORDERS = [
  {
    _id: 'o1',
    orderNumber: 'ORD-20240601-A1B2',
    status: 'delivered',
    paymentStatus: 'paid',
    total: 2339.98,
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    items: [
      { name: 'MacBook Pro 14" M3', quantity: 1, unitPrice: 1999.99, totalPrice: 1999.99 },
      { name: 'Anker USB-C Hub',    quantity: 2, unitPrice: 49.99,   totalPrice: 99.98 },
    ],
  },
  {
    _id: 'o2',
    orderNumber: 'ORD-20240620-C3D4',
    status: 'shipped',
    paymentStatus: 'paid',
    total: 1286.99,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    items: [{ name: 'iPhone 15 Pro', quantity: 1, unitPrice: 1099.99, totalPrice: 1099.99 }],
  },
  {
    _id: 'o3',
    orderNumber: 'ORD-20240701-E5F6',
    status: 'pending',
    paymentStatus: 'unpaid',
    total: 409.49,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    items: [{ name: 'Sony WH-1000XM5', quantity: 1, unitPrice: 349.99, totalPrice: 349.99 }],
  },
];

export const orderService = {
  async listMine(params = {}) {
    try {
      const { data, meta } = await api.get(`/orders${qs(params)}`);
      return { orders: data?.orders ?? data ?? [], meta };
    } catch {
      return { orders: MOCK_ORDERS, meta: null };
    }
  },

  async getById(id) {
    try {
      const { data } = await api.get(`/orders/${id}`);
      return data?.order ?? data;
    } catch {
      return MOCK_ORDERS.find(o => o._id === id) ?? null;
    }
  },

  async create(shippingAddress, notes, couponCode) {
    const body = { shippingAddress, notes };
    if (couponCode) body.couponCode = couponCode.trim().toUpperCase();
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
