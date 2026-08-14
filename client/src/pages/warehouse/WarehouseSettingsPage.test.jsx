import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../app/providers/ToastProvider';
import ToastContainer from '../../components/feedback/Toast/Toast';
import WarehouseSettingsPage from './WarehouseSettingsPage';

vi.mock('../../features/warehouse/api/warehouse.service', () => ({
  warehouseService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));
// eslint-disable-next-line import/first
import { warehouseService } from '../../features/warehouse/api/warehouse.service';

function renderPage() {
  return render(
    <ToastProvider>
      <ToastContainer />
      <WarehouseSettingsPage />
    </ToastProvider>
  );
}

function makeSettings(overrides = {}) {
  return {
    minStockDefault: 10,
    alertEmail: 'warehouse@techvault.co.il',
    lowStockAlert: true,
    supplierNotify: true,
    autoOrder: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WarehouseSettingsPage — real persistence', () => {
  it('loads persisted values from the API on mount', async () => {
    warehouseService.getSettings.mockResolvedValue(makeSettings({ minStockDefault: 42 }));

    renderPage();

    await waitFor(() => expect(warehouseService.getSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByDisplayValue('42')).toBeInTheDocument());
  });

  it('shows an honest error state when loading fails', async () => {
    warehouseService.getSettings.mockRejectedValue(new Error('Network error'));

    renderPage();

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('a field change followed by Save sends the correct value to the API', async () => {
    warehouseService.getSettings.mockResolvedValue(makeSettings());
    warehouseService.updateSettings.mockResolvedValue(makeSettings({ minStockDefault: 30 }));

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '30' } });
    fireEvent.click(screen.getByText('שמור הגדרות'));

    await waitFor(() => expect(warehouseService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ minStockDefault: 30 })
    ));
  });

  it('shows a success toast only after the backend confirms persistence (was previously a no-op button entirely)', async () => {
    warehouseService.getSettings.mockResolvedValue(makeSettings());
    let resolveSave;
    warehouseService.updateSettings.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('שמור הגדרות')).toBeInTheDocument());

    fireEvent.click(screen.getByText('שמור הגדרות'));
    expect(screen.queryByText('הגדרות המחסן נשמרו בהצלחה')).not.toBeInTheDocument();

    resolveSave(makeSettings());
    expect(await screen.findByText('הגדרות המחסן נשמרו בהצלחה')).toBeInTheDocument();
  });

  it('a failed save shows an error, not an optimistic success', async () => {
    warehouseService.getSettings.mockResolvedValue(makeSettings());
    warehouseService.updateSettings.mockRejectedValue(new Error('Insufficient permissions'));

    renderPage();
    await waitFor(() => expect(screen.getByText('שמור הגדרות')).toBeInTheDocument());
    fireEvent.click(screen.getByText('שמור הגדרות'));

    expect(await screen.findByText('Insufficient permissions')).toBeInTheDocument();
    expect(screen.queryByText('הגדרות המחסן נשמרו בהצלחה')).not.toBeInTheDocument();
  });

  it('prevents a duplicate save submission while pending', async () => {
    warehouseService.getSettings.mockResolvedValue(makeSettings());
    let resolveSave;
    warehouseService.updateSettings.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('שמור הגדרות')).toBeInTheDocument());

    fireEvent.click(screen.getByText('שמור הגדרות'));
    await waitFor(() => expect(warehouseService.updateSettings).toHaveBeenCalledTimes(1));

    expect(screen.getByText('שומר...')).toBeDisabled();
    fireEvent.click(screen.getByText('שומר...'));
    expect(warehouseService.updateSettings).toHaveBeenCalledTimes(1);

    resolveSave(makeSettings());
    await screen.findByText('הגדרות המחסן נשמרו בהצלחה');
  });

  it('the returned backend state becomes the displayed state after save', async () => {
    warehouseService.getSettings.mockResolvedValue(makeSettings({ minStockDefault: 10 }));
    warehouseService.updateSettings.mockResolvedValue(makeSettings({ minStockDefault: 55 }));

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeInTheDocument());

    fireEvent.click(screen.getByText('שמור הגדרות'));

    await waitFor(() => expect(screen.getByDisplayValue('55')).toBeInTheDocument());
  });
});
