import { api, qs } from '../../../services/api';

const BASE = '/admin/notifications';

export const adminNotificationService = {
  list:       (params = {}) => api.get(`${BASE}${qs(params)}`).then((r) => r.data),
  markRead:   (id)          => api.patch(`${BASE}/${id}/read`).then((r) => r.data),
  markAllRead: ()           => api.patch(`${BASE}/read-all`).then((r) => r.data),
};
