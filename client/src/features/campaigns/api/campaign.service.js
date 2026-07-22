import { api } from '../../../services/api';

export const campaignService = {
  // Public, unauthenticated endpoint — throws on genuine network/server
  // failure so the caller can decide how to degrade (HomePage treats both
  // `{ deal: null }` and a thrown error as "no deal to show").
  async getWeeklyDeal() {
    const { data } = await api.get('/campaigns/weekly-deal');
    return data?.deal ?? null;
  },
};
