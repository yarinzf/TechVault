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

  // Public, personalized when authenticated — real "2x points" campaign
  // teaser + VIP-only exclusive deals for the Club page. A non-member
  // always gets vipDeals: [] (server-enforced, not merely hidden here).
  async getClubSummary() {
    try {
      const { data } = await api.get('/campaigns/club-summary');
      return { pointsCampaign: data?.pointsCampaign ?? null, vipDeals: data?.vipDeals ?? [] };
    } catch {
      return { pointsCampaign: null, vipDeals: [] };
    }
  },
};
