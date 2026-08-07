import { api } from '../../../services/api';

// Display-only — the server owns the real price. Never sent to the backend;
// the checkout endpoint takes no pricing input at all.
export const MEMBERSHIP_DISPLAY_PRICE = 50;

export const membershipService = {
  async checkout() {
    const { data } = await api.post('/membership/checkout', {});
    return data?.order ?? data;
  },

  async updateNotificationPreference(notificationPreference) {
    const { data } = await api.patch('/membership/notification-preference', { notificationPreference });
    return data?.user ?? data;
  },
};
