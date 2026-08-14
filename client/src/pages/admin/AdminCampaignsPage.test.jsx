import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import AdminCampaignsPage from './AdminCampaignsPage';

// jsdom has no ResizeObserver — recharts' ResponsiveContainer needs one to mount.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('../../features/admin/api/admin.service', () => ({
  adminService: {
    listCampaigns: vi.fn(),
    getCampaignAnalytics: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    searchProducts: vi.fn(),
  },
}));
// eslint-disable-next-line import/first
import { adminService } from '../../features/admin/api/admin.service';

function renderPage() {
  return render(
    <LanguageProvider>
      <AdminCampaignsPage />
    </LanguageProvider>
  );
}

const PRODUCT_A_ID = '507f191e810c19729de860ea';
const PRODUCT_B_ID = '507f191e810c19729de860eb';

function makeCampaign(overrides = {}) {
  return {
    _id: 'camp-1',
    name: 'קמפיין קיץ',
    discountPercent: 20,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
    placement: 'none',
    isClearance: false,
    isActive: true,
    products: [{ _id: PRODUCT_A_ID, name: 'Product A', sku: 'SKU-A', price: 100, stock: 5 }],
    ...overrides,
  };
}

function makeAnalytics(overrides = {}) {
  return {
    campaign: { _id: 'camp-1', name: 'קמפיין קיץ', title: null, discountPercent: 20, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', isActive: true },
    summary: { attributedOrders: 3, unitsSold: 7, revenue: 240, discountGenerated: 40 },
    timeSeries: [{ date: '2026-01-05', orders: 2, units: 5, revenue: 180 }],
    products: [{ productId: PRODUCT_A_ID, name: 'Product A', sku: 'SKU-A', unitsSold: 7, revenue: 240 }],
    ...overrides,
  };
}

async function openAnalytics(campaign = makeCampaign()) {
  adminService.listCampaigns.mockResolvedValue([campaign]);
  renderPage();
  await waitFor(() => expect(screen.getByText(campaign.name)).toBeInTheDocument());
  fireEvent.click(screen.getByText('ניתוח ביצועים'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminCampaignsPage — campaign list loading', () => {
  it('renders real campaigns from the API', async () => {
    adminService.listCampaigns.mockResolvedValue([makeCampaign()]);
    renderPage();
    expect(await screen.findByText('קמפיין קיץ')).toBeInTheDocument();
  });

  it('a list load failure shows a distinct error state, not an empty-campaigns message', async () => {
    adminService.listCampaigns.mockRejectedValue(new Error('Network error'));
    renderPage();

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    expect(screen.queryByText('אין קמפיינים עדיין')).not.toBeInTheDocument();
  });

  it('an empty (genuinely zero-campaign) list shows the empty state, not the error state', async () => {
    adminService.listCampaigns.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('אין קמפיינים עדיין')).toBeInTheDocument();
    expect(screen.queryByText('שגיאה בטעינת הקמפיינים')).not.toBeInTheDocument();
  });
});

describe('AdminCampaignsPage — Analytics modal (real, server-derived)', () => {
  it('requests analytics for the specific selected campaign id', async () => {
    let resolveAnalytics;
    adminService.getCampaignAnalytics.mockReturnValue(new Promise((res) => { resolveAnalytics = res; }));
    await openAnalytics(makeCampaign({ _id: 'camp-42' }));

    await waitFor(() => expect(adminService.getCampaignAnalytics).toHaveBeenCalledWith('camp-42'));
    resolveAnalytics(makeAnalytics());
  });

  it('shows a loading state before the analytics response resolves', async () => {
    let resolveAnalytics;
    adminService.getCampaignAnalytics.mockReturnValue(new Promise((res) => { resolveAnalytics = res; }));
    await openAnalytics();

    expect(screen.queryByText('הזמנות מיוחסות')).not.toBeInTheDocument();
    resolveAnalytics(makeAnalytics());
    expect(await screen.findByText('הזמנות מיוחסות')).toBeInTheDocument();
  });

  it('renders real analytics values returned by the server', async () => {
    adminService.getCampaignAnalytics.mockResolvedValue(makeAnalytics());
    await openAnalytics();

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('7').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₪240').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₪40')).toBeInTheDocument();
    expect(screen.getByText('Product A')).toBeInTheDocument();
  });

  it('shows a genuine empty state (not a fake zero-data chart) when there is no attributed sales data', async () => {
    adminService.getCampaignAnalytics.mockResolvedValue(makeAnalytics({ timeSeries: [], products: [] }));
    await openAnalytics();

    const emptyMessages = await screen.findAllByText('אין עדיין נתוני מכירות לקמפיין זה');
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('shows an error state when the analytics request fails', async () => {
    adminService.getCampaignAnalytics.mockRejectedValue(new Error('Analytics fetch failed'));
    await openAnalytics();

    expect(await screen.findByText('Analytics fetch failed')).toBeInTheDocument();
  });

  it('never displays a hardcoded 3.8% conversion rate (no honest denominator exists)', async () => {
    adminService.getCampaignAnalytics.mockResolvedValue(makeAnalytics());
    await openAnalytics();

    await screen.findByText('הזמנות מיוחסות');
    expect(screen.queryByText(/3\.8%/)).not.toBeInTheDocument();
  });

  it('never displays a fabricated "+12% מהשבוע שעבר" week-over-week trend', async () => {
    adminService.getCampaignAnalytics.mockResolvedValue(makeAnalytics());
    await openAnalytics();

    await screen.findByText('הזמנות מיוחסות');
    expect(screen.queryByText(/מהשבוע שעבר/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+12%/)).not.toBeInTheDocument();
  });

  it('never displays a static April chart dataset', async () => {
    adminService.getCampaignAnalytics.mockResolvedValue(makeAnalytics());
    await openAnalytics();

    await screen.findByText('הזמנות מיוחסות');
    expect(screen.queryByText(/אפריל/)).not.toBeInTheDocument();
    expect(screen.queryByText(/April/i)).not.toBeInTheDocument();
  });

  it('the fake "Add Budget" success flow no longer exists', async () => {
    adminService.getCampaignAnalytics.mockResolvedValue(makeAnalytics());
    await openAnalytics();

    await screen.findByText('הזמנות מיוחסות');
    expect(screen.queryByText('הוסף תקציב')).not.toBeInTheDocument();
    expect(screen.queryByText('תקציב מבצע')).not.toBeInTheDocument();
  });
});

describe('AdminCampaignsPage — Products modal / Add Products (real, wired to the update endpoint)', () => {
  it('shows the campaign\'s real existing products, not placeholder data', async () => {
    const campaign = makeCampaign();
    adminService.listCampaigns.mockResolvedValue([campaign]);
    renderPage();
    await waitFor(() => expect(screen.getByText(campaign.name)).toBeInTheDocument());

    fireEvent.click(screen.getByText('1 מוצרים'));

    expect(await screen.findByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('SKU-A')).toBeInTheDocument();
  });

  it('searching and selecting a product, then confirming, calls the real update endpoint with merged product ids', async () => {
    const campaign = makeCampaign();
    adminService.listCampaigns.mockResolvedValue([campaign]);
    adminService.searchProducts.mockResolvedValue({ products: [{ _id: PRODUCT_B_ID, name: 'Product B', sku: 'SKU-B', price: 50, stock: 3 }] });
    const updatedCampaign = makeCampaign({ products: [...campaign.products, { _id: PRODUCT_B_ID, name: 'Product B', sku: 'SKU-B', price: 50, stock: 3 }] });
    adminService.updateCampaign.mockResolvedValue(updatedCampaign);

    renderPage();
    await waitFor(() => expect(screen.getByText(campaign.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText('1 מוצרים'));
    await screen.findByText('Product A');

    fireEvent.click(screen.getByText('הוסף מוצרים לקמפיין'));
    fireEvent.change(screen.getByPlaceholderText('חפש מוצר לפי שם או מק״ט...'), { target: { value: 'Product B' } });

    await waitFor(() => expect(adminService.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Product B' }),
      expect.anything()
    ), { timeout: 2000 });

    fireEvent.click(await screen.findByText('Product B'));
    fireEvent.click(screen.getByText('הוסף נבחרים (1)'));

    await waitFor(() => expect(adminService.updateCampaign).toHaveBeenCalledWith('camp-1', { products: [PRODUCT_A_ID, PRODUCT_B_ID] }));
    expect(await screen.findByText('Product B')).toBeInTheDocument();
  });

  it('a failed add-products save shows an inline error, not a fake success', async () => {
    const campaign = makeCampaign();
    adminService.listCampaigns.mockResolvedValue([campaign]);
    adminService.searchProducts.mockResolvedValue({ products: [{ _id: PRODUCT_B_ID, name: 'Product B', sku: 'SKU-B', price: 50, stock: 3 }] });
    adminService.updateCampaign.mockRejectedValue(new Error('Update failed'));

    renderPage();
    await waitFor(() => expect(screen.getByText(campaign.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText('1 מוצרים'));
    await screen.findByText('Product A');

    fireEvent.click(screen.getByText('הוסף מוצרים לקמפיין'));
    fireEvent.change(screen.getByPlaceholderText('חפש מוצר לפי שם או מק״ט...'), { target: { value: 'Product B' } });
    fireEvent.click(await screen.findByText('Product B'));
    fireEvent.click(screen.getByText('הוסף נבחרים (1)'));

    expect(await screen.findByText('Update failed')).toBeInTheDocument();
  });
});
