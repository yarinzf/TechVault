import { api, setToken, clearToken } from '../../../services/api';

export const authService = {
  async register(name, email, password, phone) {
    const { data } = await api.post('/auth/register', { name, email, password, phone });
    setToken(data.accessToken);
    return data.user;
  },

  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.accessToken);
    return data.user;
  },

  // ── OAuth ──────────────────────────────────────────────────────────────────

  async loginWithGoogle(idToken) {
    const { data } = await api.post('/auth/google', { idToken });
    setToken(data.accessToken);
    return data.user;
  },

  async loginWithApple(idToken) {
    const { data } = await api.post('/auth/apple', { idToken });
    setToken(data.accessToken);
    return data.user;
  },

  // ── SMS ────────────────────────────────────────────────────────────────────

  async smsStart(phone) {
    const { data } = await api.post('/auth/sms/start', { phone });
    return data; // { sent: true }
  },

  async smsVerify(phone, code) {
    const { data } = await api.post('/auth/sms/verify', { phone, code });
    setToken(data.accessToken);
    return data.user;
  },

  async logout() {
    try { await api.post('/auth/logout', {}); } catch { /* swallow */ }
    clearToken();
  },

  async getMe() {
    const { data } = await api.get('/auth/me');
    return data.user ?? data;
  },

  async updateMe(dto) {
    const { data } = await api.patch('/auth/me', dto);
    return data.user ?? data;
  },

  async changePassword(currentPassword, newPassword) {
    await api.patch('/auth/change-password', { currentPassword, newPassword });
  },

  async forgotPassword(email) {
    await api.post('/auth/forgot-password', { email });
  },

  async resetPassword(token, newPassword) {
    await api.post('/auth/reset-password', { token, newPassword });
  },

  // ── Session management ──────────────────────────────────────────────────────

  async getSessions() {
    const { data } = await api.get('/auth/sessions');
    return data?.sessions ?? [];
  },

  async revokeSession(sessionId) {
    await api.delete(`/auth/sessions/${sessionId}`);
  },

  async logoutAllDevices() {
    try { await api.post('/auth/logout-all', {}); } catch { /* swallow */ }
    clearToken();
  },
};
