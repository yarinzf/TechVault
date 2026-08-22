import { api, qs, getToken } from '../../../services/api';

export const adminService = {
  // No mock fallback — this is the flagship business dashboard. A genuine
  // API failure must surface to AdminDashboardPage's real error state, never
  // silently render a fabricated ₪184,320.50/247-orders dashboard that looks
  // indistinguishable from live data.
  async getDashboard() {
    const { data } = await api.get('/admin/dashboard');
    return data;
  },

  async getRevenue(params = {}) {
    const { data } = await api.get(`/admin/analytics/revenue${qs(params)}`);
    return data?.revenue ?? data ?? [];
  },

  async getTopProducts(params = {}) {
    const { data } = await api.get(`/admin/analytics/top-products${qs(params)}`);
    return data?.products ?? data ?? [];
  },

  async listCategories() {
    const { data } = await api.get('/admin/categories');
    return data?.categories ?? [];
  },

  async createCategory(dto) {
    const { data } = await api.post('/admin/categories', dto);
    return data?.category ?? data;
  },

  async updateCategory(id, dto) {
    const { data } = await api.patch(`/admin/categories/${id}`, dto);
    return data?.category ?? data;
  },

  async reorderCategories(items) {
    const { data } = await api.patch('/admin/categories/reorder', { items });
    return data?.categories ?? [];
  },

  async deleteCategory(id) {
    await api.delete(`/admin/categories/${id}`);
  },

  async listClubMembers(params = {}) {
    const { data, meta } = await api.get(`/admin/club-members${qs(params)}`);
    return { members: data?.members ?? [], meta };
  },

  // No mock fallback — every caller of listAlerts/resolveAlert already has
  // its own real error state (AdminDashboardPage's page-level error screen,
  // AdminAlertsPage/WarehouseAlertsPage/SuperAdminDashboardPage's own
  // try/catch), so a genuine failure surfaces honestly instead of showing
  // fabricated "Low stock: Google Pixel 8" style alerts TechVault never had.
  async listAlerts(params = {}) {
    const { data, meta } = await api.get(`/admin/alerts${qs(params)}`);
    return { alerts: data?.alerts ?? data ?? [], meta };
  },

  async resolveAlert(id) {
    const { data } = await api.patch(`/admin/alerts/${id}/resolve`, {});
    return data?.alert ?? data;
  },

  async listAllOrders(params = {}) {
    const { data, meta } = await api.get(`/orders/all${qs(params)}`);
    return { orders: data?.orders ?? data ?? [], meta };
  },

  // No mock fallback — the Users list is privileged-account data (roles,
  // emails); on a genuine failure the caller's own error state should show,
  // not a silently-substituted fake admin/warehouse/superadmin identity.
  async listUsers(params = {}) {
    const { data, meta } = await api.get(`/admin/users${qs(params)}`);
    return { users: data?.users ?? data ?? [], meta };
  },

  async updateUser(id, dto) {
    const { data } = await api.patch(`/admin/users/${id}`, dto);
    return data?.user ?? data;
  },

  // Force-logout / revoke all active sessions for a user — superadmin-only
  // on the backend (DELETE /admin/users/:id/sessions). Returns how many
  // sessions were actually revoked so the caller can give honest feedback
  // (e.g. "0" means the user had no active sessions to begin with).
  async forceLogoutUser(id) {
    const { data } = await api.delete(`/admin/users/${id}/sessions`);
    return { revokedSessions: data?.revokedSessions ?? 0 };
  },

  // Real, persisted admin (business) settings (GET/PATCH /admin/settings) —
  // no silent fallback: a load/save failure must reach the caller as a real
  // error, never be swallowed into a fake empty/default result.
  async getSettings() {
    const { data } = await api.get('/admin/settings');
    return data?.settings ?? data;
  },

  async updateSettings(dto) {
    const { data } = await api.patch('/admin/settings', dto);
    return data?.settings ?? data;
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

  // ── Business targets / Performance Goals — real, persisted (server/models/
  // BusinessTarget.js), never a frontend-hardcoded constant. No mock
  // fallback: PerformanceGoals.jsx shows its own real unavailable state on
  // failure rather than fabricated progress numbers.
  async getGoalsProgress(date) {
    const { data } = await api.get(`/admin/targets/goals${qs(date ? { date } : {})}`);
    return data;
  },

  async listTargets(params = {}) {
    const { data } = await api.get(`/admin/targets${qs(params)}`);
    return data?.targets ?? [];
  },

  async setTarget(dto) {
    const { data } = await api.post('/admin/targets', dto);
    return data?.target ?? data;
  },

  async getDailyAnalytics(params = {}) {
    const { data } = await api.get(`/admin/analytics/daily${qs(params)}`);
    return data;
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

  // Admin Products catalog browser — the SAME real category/filter/search/
  // sort/pagination engine the public storefront uses (see
  // productService.list / server/services/product.service.js#listProducts),
  // just admin-gated and including unpublished drafts. Never a second/mock
  // product data source.
  async listProductsCatalog(params = {}) {
    const { data, meta } = await api.get(`/products/admin-list${qs(params)}`);
    return { products: data?.products ?? data ?? [], meta };
  },

  async getProductFilterCounts(category) {
    try {
      const { data } = await api.get(`/products/admin-filter-counts${qs({ category })}`);
      return data?.counts ?? {};
    } catch {
      return {};
    }
  },

  // Real, rebuildable monthly sales history — never a mock fallback (this
  // is real transactional data, same principle as listUsers: a genuine
  // failure should surface as an error, not silently show fabricated
  // numbers).
  async getProductSalesHistory(productId, months = 12) {
    const { data } = await api.get(`/admin/products/${productId}/sales-history${qs({ months })}`);
    return data;
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

  // No silent [] fallback (unlike this file's usual convention) — a load
  // failure must be visibly distinguishable from "zero campaigns exist" so
  // AdminCampaignsPage can show a real error state instead of a fake empty
  // list (see the campaign-analytics-honesty audit fix).
  async listCampaigns() {
    const { data } = await api.get('/admin/campaigns');
    return data?.campaigns ?? data ?? [];
  },

  async getCampaignAnalytics(id) {
    const { data } = await api.get(`/admin/campaigns/${id}/analytics`);
    return data?.analytics ?? data;
  },

  // Reuses the existing warehouse inventory endpoint as the Admin product
  // search source — it already supports name/SKU search, pagination, and
  // returns stock/isPublished (unlike the public product list, which
  // filters unpublished/deleted products out before this code ever sees
  // them). Errors are NOT swallowed here (unlike most methods in this file)
  // so callers can distinguish a genuine search failure from an empty
  // result and show the correct translated state. `signal` lets callers
  // abort a stale in-flight request when the search query changes.
  async searchProducts(params = {}, signal) {
    const { data, meta } = await api.get(`/admin/inventory/list${qs(params)}`, { signal });
    return { products: data?.products ?? data ?? [], meta };
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
