import { api, qs, getToken } from '../../../services/api';

// ── Mock fallback data ────────────────────────────────────────────────────────
const MOCK_USERS = [
  { _id: 'u1', name: 'Super Admin',       email: 'superadmin@techvault.dev', role: 'superadmin', isActive: true,  createdAt: new Date(Date.now() - 90 * 86400000).toISOString() },
  { _id: 'u2', name: 'Admin User',        email: 'admin@techvault.dev',      role: 'admin',      isActive: true,  createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
  { _id: 'u3', name: 'Warehouse Manager', email: 'warehouse@techvault.dev',  role: 'warehouse',  isActive: true,  createdAt: new Date(Date.now() - 45 * 86400000).toISOString() },
  { _id: 'u4', name: 'Alice Johnson',     email: 'alice@example.com',        role: 'user',       isActive: true,  createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
  { _id: 'u5', name: 'Bob Smith',         email: 'bob@example.com',          role: 'user',       isActive: true,  createdAt: new Date(Date.now() - 15 * 86400000).toISOString() },
  { _id: 'u6', name: 'Carol Williams',    email: 'carol@example.com',        role: 'user',       isActive: false, createdAt: new Date(Date.now() -  5 * 86400000).toISOString() },
];

const MOCK_DASHBOARD = {
  orders:  { total: 247, pending: 18, inProgress: 34 },
  revenue: { total: 184320.50, paidOrders: 194 },
  users:   { total: 1203, new30d: 87 },
  recentOrders: [
    { _id: 'o1', orderNumber: 'ORD-20240701-A1B2', status: 'confirmed',  total: 2339.98, paymentStatus: 'paid', createdAt: new Date().toISOString() },
    { _id: 'o2', orderNumber: 'ORD-20240701-C3D4', status: 'shipped',    total: 1286.99, paymentStatus: 'paid', createdAt: new Date().toISOString() },
    { _id: 'o3', orderNumber: 'ORD-20240701-E5F6', status: 'processing', total: 409.49,  paymentStatus: 'paid', createdAt: new Date().toISOString() },
    { _id: 'o4', orderNumber: 'ORD-20240701-G7H8', status: 'pending',    total: 59.99,   paymentStatus: 'unpaid', createdAt: new Date().toISOString() },
  ],
  lowStockProducts: [
    { _id: 'p1', name: 'Lenovo ThinkPad X1 Carbon', sku: 'TV-A1B2', stock: 3, minStock: 10 },
    { _id: 'p2', name: 'Google Pixel 8',             sku: 'TV-C3D4', stock: 0, minStock: 8  },
  ],
};

const MOCK_TOP_PRODUCTS = [
  { product: 'p1', name: 'MacBook Pro 14" M3',  sku: 'TV-1', totalQty: 42, revenue: 83999.58, orders: 42 },
  { product: 'p2', name: 'iPhone 15 Pro',        sku: 'TV-2', totalQty: 88, revenue: 96799.12, orders: 88 },
  { product: 'p3', name: 'Sony WH-1000XM5',      sku: 'TV-3', totalQty: 55, revenue: 19249.45, orders: 55 },
  { product: 'p4', name: 'Samsung Galaxy S24',   sku: 'TV-4', totalQty: 61, revenue: 76249.39, orders: 61 },
  { product: 'p5', name: 'Anker USB-C Hub',      sku: 'TV-5', totalQty: 210, revenue: 10499.90, orders: 210 },
];

const MOCK_ALERTS = [
  { _id: 'a1', type: 'low_stock',    severity: 'critical', title: 'Low stock: Google Pixel 8',            message: 'Product has 0 units remaining.',                isResolved: false, createdAt: new Date().toISOString() },
  { _id: 'a2', type: 'low_stock',    severity: 'warning',  title: 'Low stock: Lenovo ThinkPad X1',        message: 'Product has 3 units remaining.',                isResolved: false, createdAt: new Date().toISOString() },
  { _id: 'a3', type: 'refund_spike', severity: 'critical', title: 'Refund spike detected',                message: '7 orders refunded in last 24 hours.',            isResolved: false, createdAt: new Date().toISOString() },
  { _id: 'a4', type: 'ranking_drop', severity: 'info',     title: 'No sales: Dell UltraSharp U2722D',     message: 'Published 30+ days with 0 sales.',              isResolved: true,  createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
];

const MOCK_REVENUE = Array.from({ length: 30 }, (_, i) => ({
  period:  new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
  revenue: Math.round((2000 + Math.random() * 8000) * 100) / 100,
  orders:  Math.floor(3 + Math.random() * 12),
}));

export const adminService = {
  async getDashboard() {
    try {
      const { data } = await api.get('/admin/dashboard');
      return data;
    } catch {
      return MOCK_DASHBOARD;
    }
  },

  async getRevenue(params = {}) {
    try {
      const { data } = await api.get(`/admin/analytics/revenue${qs(params)}`);
      return data?.revenue ?? data ?? [];
    } catch {
      return MOCK_REVENUE;
    }
  },

  async getTopProducts(params = {}) {
    try {
      const { data } = await api.get(`/admin/analytics/top-products${qs(params)}`);
      return data?.products ?? data ?? [];
    } catch {
      return MOCK_TOP_PRODUCTS;
    }
  },

  async listAlerts(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/alerts${qs(params)}`);
      return { alerts: data?.alerts ?? data ?? [], meta };
    } catch {
      return { alerts: MOCK_ALERTS, meta: null };
    }
  },

  async resolveAlert(id) {
    try {
      const { data } = await api.patch(`/admin/alerts/${id}/resolve`, {});
      return data?.alert ?? data;
    } catch {
      return MOCK_ALERTS.find(a => a._id === id);
    }
  },

  async listAllOrders(params = {}) {
    const { data, meta } = await api.get(`/orders/all${qs(params)}`);
    return { orders: data?.orders ?? data ?? [], meta };
  },

  async listUsers(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/users${qs(params)}`);
      return { users: data?.users ?? data ?? [], meta };
    } catch {
      return { users: MOCK_USERS, meta: null };
    }
  },

  async updateUser(id, dto) {
    const { data } = await api.patch(`/admin/users/${id}`, dto);
    return data?.user ?? data;
  },

  async getOrderTimeline(orderId) {
    try {
      const { data } = await api.get(`/orders/${orderId}/timeline`);
      return data?.timeline ?? [];
    } catch {
      return [];
    }
  },

  async getActivity() {
    try {
      const { data } = await api.get('/admin/activity');
      return data?.activities ?? [];
    } catch {
      return [];
    }
  },

  async getAnalyticsOverview(params = {}) {
    try {
      const { data } = await api.get(`/admin/analytics/overview${qs(params)}`);
      return data;
    } catch {
      return null;
    }
  },

  async getAnalyticsOrders(params = {}) {
    try {
      const { data } = await api.get(`/admin/analytics/orders${qs(params)}`);
      return data;
    } catch {
      return null;
    }
  },

  async getAnalyticsProducts(params = {}) {
    try {
      const { data } = await api.get(`/admin/analytics/products${qs(params)}`);
      return data;
    } catch {
      return null;
    }
  },

  async getInsights() {
    try {
      const { data } = await api.get('/admin/insights');
      return data;
    } catch {
      return null;
    }
  },

  async refundOrder(id, dto) {
    const { data } = await api.post(`/admin/orders/${id}/refund`, dto);
    return data?.order ?? data;
  },

  async updateOrderStatus(orderId, status, note = '') {
    const { data } = await api.patch(`/orders/${orderId}/status`, { status, note });
    return data?.order ?? data;
  },

  async getProductForEdit(id) {
    const { data } = await api.get(`/products/${id}/admin-detail`);
    return data?.product ?? data;
  },

  async createProduct(dto) {
    const { data } = await api.post('/products', dto);
    return data?.product ?? data;
  },

  async updateProduct(id, dto) {
    const { data } = await api.patch(`/products/${id}`, dto);
    return data?.product ?? data;
  },

  async deleteProduct(id) {
    await api.delete(`/products/${id}`);
  },

  async scanInventoryAlerts() {
    const { data } = await api.post('/admin/inventory/scan-alerts', {});
    return data;
  },

  async getInventoryHealth() {
    try {
      const { data } = await api.get('/admin/inventory/health');
      return data;
    } catch {
      return null;
    }
  },

  async listCampaigns() {
    try {
      const { data } = await api.get('/admin/campaigns');
      return data?.campaigns ?? data ?? [];
    } catch {
      return [];
    }
  },

  async createCampaign(dto) {
    const { data } = await api.post('/admin/campaigns', dto);
    return data?.campaign ?? data;
  },

  async updateCampaign(id, dto) {
    const { data } = await api.patch(`/admin/campaigns/${id}`, dto);
    return data?.campaign ?? data;
  },

  async deleteCampaign(id) {
    await api.delete(`/admin/campaigns/${id}`);
  },

  async listAuditLogs(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/audit-logs${qs(params)}`);
      return { logs: data?.logs ?? data ?? [], meta };
    } catch {
      return { logs: [], meta: null };
    }
  },

  async listReturns(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/returns${qs(params)}`);
      return { returns: data?.returns ?? data ?? [], meta };
    } catch {
      return { returns: [], meta: null };
    }
  },

  async getReturn(id) {
    const { data } = await api.get(`/admin/returns/${id}`);
    return data?.returnRequest ?? data;
  },

  async approveReturn(id, dto = {}) {
    const { data } = await api.patch(`/admin/returns/${id}/approve`, dto);
    return data?.returnRequest ?? data;
  },

  async rejectReturn(id, dto = {}) {
    const { data } = await api.patch(`/admin/returns/${id}/reject`, dto);
    return data?.returnRequest ?? data;
  },

  async markReturnReceived(id, dto = {}) {
    const { data } = await api.patch(`/admin/returns/${id}/received`, dto);
    return data?.returnRequest ?? data;
  },

  async processReturnRefund(id, dto) {
    const { data } = await api.patch(`/admin/returns/${id}/refund`, dto);
    return data;
  },

  // ── Suppliers ────────────────────────────────────────────────────────────────
  async listSuppliers(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/suppliers${qs(params)}`);
      return { suppliers: data?.suppliers ?? data ?? [], meta };
    } catch {
      return { suppliers: [], meta: null };
    }
  },

  async createSupplier(dto) {
    const { data } = await api.post('/admin/suppliers', dto);
    return data?.supplier ?? data;
  },

  async updateSupplier(id, dto) {
    const { data } = await api.patch(`/admin/suppliers/${id}`, dto);
    return data?.supplier ?? data;
  },

  async deleteSupplier(id) {
    await api.delete(`/admin/suppliers/${id}`);
  },

  // ── Purchase orders ───────────────────────────────────────────────────────────
  async listPurchaseOrders(params = {}) {
    try {
      const { data, meta } = await api.get(`/admin/purchase-orders${qs(params)}`);
      return { orders: data?.orders ?? data ?? [], meta };
    } catch {
      return { orders: [], meta: null };
    }
  },

  async getPurchaseOrder(id) {
    const { data } = await api.get(`/admin/purchase-orders/${id}`);
    return data?.order ?? data;
  },

  async createPurchaseOrder(dto) {
    const { data } = await api.post('/admin/purchase-orders', dto);
    return data?.order ?? data;
  },

  async updatePurchaseOrder(id, dto) {
    const { data } = await api.patch(`/admin/purchase-orders/${id}`, dto);
    return data?.order ?? data;
  },

  async receivePurchaseOrder(id, dto) {
    const { data } = await api.post(`/admin/purchase-orders/${id}/receive`, dto);
    return data?.order ?? data;
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  async getReport(type, params = {}) {
    const { data } = await api.get(`/admin/reports/${type}${qs(params)}`);
    return data;
  },

  async exportReportCsv(type, params = {}, filename) {
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const url  = `${BASE}/admin/reports/${type}.csv${qs(params)}`;
    const token = getToken();
    const resp = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error('Export failed');
    const blob    = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename ?? `${type}-report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },

  async getRestockSuggestions() {
    try {
      const { data } = await api.get('/admin/purchase-orders/restock-suggestions');
      return data?.suggestions ?? [];
    } catch {
      return [];
    }
  },

  async getSystemStatus() {
    const { data } = await api.get('/admin/system/status');
    return data;
  },
};
