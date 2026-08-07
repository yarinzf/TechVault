import { api } from '../../../services/api';

export const campaignService = {
  // Public, unauthenticated endpoint — throws on genuine network/server
  // failure so the caller can decide how to degrade (HomePage treats both
  // `{ deal: null }` and a thrown error as "no deal to show").
  async getWeeklyDeal() {
    const { data } = await api.get('/campaigns/weekly-deal');
    return data?.deal ?? null;
  },

  // Public, unauthenticated — every currently active, storefront-eligible
  // campaign with its available products already priced. Powers the Deals
  // page in a single request (no per-card fetch).
  async getActiveCampaigns() {
    const { data } = await api.get('/campaigns/active');
    return data?.campaigns ?? [];
  },
};
