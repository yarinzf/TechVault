import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../app/providers/ToastProvider';
import ToastContainer from '../../components/feedback/Toast/Toast';
import AdminSettingsPage from './AdminSettingsPage';

vi.mock('../../features/admin/api/admin.service', () => ({
  adminService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));
// eslint-disable-next-line import/first
import { adminService } from '../../features/admin/api/admin.service';

function renderPage() {
  return render(
    <ToastProvider>
      <ToastContainer />
      <AdminSettingsPage />
    </ToastProvider>
  );
}

function makeSettings(overrides = {}) {
  return {
    notifications: { email: true, push: true, sms: false },
    alertTypes: {
      criticalAlerts: true, stockAlerts: true, salesAlerts: true,
      orderAlerts: true, securityAlerts: true,
    },
    thresholds: { highSalesIncrease: 100, salesDecrease: 30, priceChange: 10, orderDelay: 24 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminSettingsPage — real persistence', () => {
  it('loads persisted values from the API on mount', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings({
      notifications: { email: true, push: true, sms: true },
    }));

    renderPage();

    await waitFor(() => expect(adminService.getSettings).toHaveBeenCalledTimes(1));
    // The SMS toggle reflects the loaded (non-default) value: aria-pressed=true.
    await waitFor(() => expect(screen.getByLabelText('התראות SMS')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('shows an honest error state when loading fails (no fake defaults presented as real)', async () => {
    adminService.getSettings.mockRejectedValue(new Error('Network error'));

    renderPage();

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('a field change followed by Save sends the updated value to the API', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    adminService.updateSettings.mockResolvedValue(makeSettings({
      notifications: { email: true, push: true, sms: true },
    }));

    renderPage();
    await waitFor(() => expect(screen.getByLabelText('התראות SMS')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('התראות SMS'));
    fireEvent.click(screen.getByText('שמור שינויים'));

    await waitFor(() => expect(adminService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ notifications: expect.objectContaining({ sms: true }) })
    ));
  });

  it('shows a success toast only AFTER the backend confirms persistence', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    let resolveSave;
    adminService.updateSettings.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('שמור שינויים')).toBeInTheDocument());

    fireEvent.click(screen.getByText('שמור שינויים'));
    // Still pending — no premature/optimistic success claim.
    expect(screen.queryByText('ההגדרות נשמרו בהצלחה')).not.toBeInTheDocument();

    resolveSave(makeSettings());
    expect(await screen.findByText('ההגדרות נשמרו בהצלחה')).toBeInTheDocument();
  });

  it('a failed save shows an error toast, not a success claim', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    adminService.updateSettings.mockRejectedValue(new Error('Insufficient permissions'));

    renderPage();
    await waitFor(() => expect(screen.getByText('שמור שינויים')).toBeInTheDocument());
    fireEvent.click(screen.getByText('שמור שינויים'));

    expect(await screen.findByText('Insufficient permissions')).toBeInTheDocument();
    expect(screen.queryByText('ההגדרות נשמרו בהצלחה')).not.toBeInTheDocument();
  });

  it('prevents a duplicate save submission while a save is already pending', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    let resolveSave;
    adminService.updateSettings.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('שמור שינויים')).toBeInTheDocument());

    const saveButton = screen.getByText('שמור שינויים');
    fireEvent.click(saveButton);
    await waitFor(() => expect(adminService.updateSettings).toHaveBeenCalledTimes(1));

    expect(screen.getByText('שומר...')).toBeDisabled();
    fireEvent.click(screen.getByText('שומר...'));
    expect(adminService.updateSettings).toHaveBeenCalledTimes(1);

    resolveSave(makeSettings());
    await screen.findByText('ההגדרות נשמרו בהצלחה');
  });

  it('the returned backend state becomes the displayed state after save', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    adminService.updateSettings.mockResolvedValue(makeSettings({
      thresholds: { highSalesIncrease: 100, salesDecrease: 30, priceChange: 10, orderDelay: 72 },
    }));

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('24')).toBeInTheDocument());

    fireEvent.click(screen.getByText('שמור שינויים'));

    // Server's returned value (72), not whatever was locally typed, is shown.
    await waitFor(() => expect(screen.getByDisplayValue('72')).toBeInTheDocument());
  });

  it('Reset persists the documented defaults via the real API (not just local state)', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings({
      thresholds: { highSalesIncrease: 200, salesDecrease: 30, priceChange: 10, orderDelay: 24 },
    }));
    adminService.updateSettings.mockResolvedValue(makeSettings());
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('200')).toBeInTheDocument());

    fireEvent.click(screen.getByText('איפוס'));

    await waitFor(() => expect(adminService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ thresholds: expect.objectContaining({ highSalesIncrease: 100 }) })
    ));
    expect(await screen.findByText('ההגדרות אופסו לברירת המחדל ונשמרו')).toBeInTheDocument();
  });

  it('does NOT render a Dark Mode toggle (removed — duplicate of the real, already-working theme toggle)', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    renderPage();
    await waitFor(() => expect(screen.getByText('שמור שינויים')).toBeInTheDocument());
    expect(screen.queryByText('מצב כהה (Dark Mode)')).not.toBeInTheDocument();
  });

  it('does NOT render a global "מלאי קריטי"/"מלאי נמוך" threshold (would conflict with per-product Product.minStock)', async () => {
    adminService.getSettings.mockResolvedValue(makeSettings());
    renderPage();
    await waitFor(() => expect(screen.getByText('שמור שינויים')).toBeInTheDocument());
    expect(screen.queryByText('מלאי קריטי')).not.toBeInTheDocument();
    expect(screen.queryByText('מלאי נמוך')).not.toBeInTheDocument();
  });
});
