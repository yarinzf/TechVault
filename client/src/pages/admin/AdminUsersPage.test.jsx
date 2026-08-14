import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../app/providers/ToastProvider';
import ToastContainer from '../../components/feedback/Toast/Toast';
import AdminUsersPage from './AdminUsersPage';

vi.mock('../../features/admin/api/admin.service', () => ({
  adminService: {
    listUsers: vi.fn(),
    updateUser: vi.fn(),
    forceLogoutUser: vi.fn(),
  },
}));
// eslint-disable-next-line import/first
import { adminService } from '../../features/admin/api/admin.service';

vi.mock('../../hooks/useAuth');
// eslint-disable-next-line import/first
import { useAuth } from '../../hooks/useAuth';

function renderPage() {
  return render(
    <ToastProvider>
      <ToastContainer />
      <AdminUsersPage />
    </ToastProvider>
  );
}

function makeUser(overrides = {}) {
  return {
    _id: 'user-1',
    name: 'Victim User',
    email: 'victim@example.com',
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Acting superadmin, distinct from the row(s) under test unless overridden.
  useAuth.mockReturnValue({ user: { _id: 'superadmin-self', role: 'superadmin' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminUsersPage — Force Logout ("התנתק מכל המכשירים")', () => {
  it('shows the force-logout action for a user row (available in Super Admin user management)', async () => {
    const victim = makeUser();
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());

    expect(screen.getByText('התנתק מכל המכשירים')).toBeInTheDocument();
  });

  it('asks for confirmation, and does NOT call the API when the confirmation is cancelled', async () => {
    const victim = makeUser();
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText('התנתק מכל המכשירים'));

    expect(window.confirm).toHaveBeenCalled();
    expect(adminService.forceLogoutUser).not.toHaveBeenCalled();
  });

  it('on confirmation, calls forceLogoutUser with the correct user id (the real DELETE endpoint call)', async () => {
    const victim = makeUser({ _id: 'user-42' });
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });
    adminService.forceLogoutUser.mockResolvedValue({ revokedSessions: 2 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText('התנתק מכל המכשירים'));

    await waitFor(() => expect(adminService.forceLogoutUser).toHaveBeenCalledWith('user-42'));
  });

  it('shows a Hebrew success toast (mentioning the revoked-session count) after a successful call', async () => {
    const victim = makeUser();
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });
    adminService.forceLogoutUser.mockResolvedValue({ revokedSessions: 3 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText('התנתק מכל המכשירים'));

    expect(await screen.findByText(/נותק מכל המכשירים בהצלחה/)).toBeInTheDocument();
    expect(screen.getByText(/3 התחברויות פעילות בוטלו/)).toBeInTheDocument();
  });

  it('does not claim success and shows the existing error pattern on a failed call', async () => {
    const victim = makeUser();
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });
    adminService.forceLogoutUser.mockRejectedValue(new Error('Insufficient permissions'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText('התנתק מכל המכשירים'));

    await waitFor(() => expect(adminService.forceLogoutUser).toHaveBeenCalled());
    expect(screen.queryByText(/נותק מכל המכשירים בהצלחה/)).not.toBeInTheDocument();
    // Both the toast AND the existing per-row error message show the failure
    // — real, intentional double surfacing, not a bug.
    await waitFor(() => expect(screen.getAllByText('Insufficient permissions').length).toBeGreaterThanOrEqual(1));
  });

  it('prevents a duplicate submission while the request is pending (button disabled mid-flight)', async () => {
    const victim = makeUser();
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolveCall;
    adminService.forceLogoutUser.mockReturnValue(new Promise((resolve) => { resolveCall = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());

    const button = screen.getByText('התנתק מכל המכשירים');
    fireEvent.click(button);
    await waitFor(() => expect(adminService.forceLogoutUser).toHaveBeenCalledTimes(1));

    // Mid-flight: the SAME button (now showing "...", disabled) is clicked
    // again — since it's the same, already-disabled DOM node, this proves a
    // real duplicate click on the actual control cannot fire a second request.
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(adminService.forceLogoutUser).toHaveBeenCalledTimes(1);

    resolveCall({ revokedSessions: 0 });
    await screen.findByText(/לא היו התחברויות פעילות/);
  });

  it('is disabled for the acting superadmin\'s own row (backend allows it; UI keeps it consistent with the existing self-action-disable pattern)', async () => {
    const self = makeUser({ _id: 'superadmin-self', name: 'Me Myself', role: 'superadmin' });
    adminService.listUsers.mockResolvedValue({ users: [self], meta: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText(self.name)).toBeInTheDocument());

    const row = screen.getByText(self.name).closest('tr');
    const button = within(row).getByText('התנתק מכל המכשירים');
    expect(button).toBeDisabled();
  });

  it('existing user-management actions (activate/deactivate) remain intact alongside the new action', async () => {
    const victim = makeUser({ isActive: true });
    adminService.listUsers.mockResolvedValue({ users: [victim], meta: {} });
    adminService.updateUser.mockResolvedValue({ ...victim, isActive: false });

    renderPage();
    await waitFor(() => expect(screen.getByText(victim.name)).toBeInTheDocument());

    fireEvent.click(screen.getByText('השבת'));
    await waitFor(() => expect(adminService.updateUser).toHaveBeenCalledWith(victim._id, { isActive: false }));
  });
});
