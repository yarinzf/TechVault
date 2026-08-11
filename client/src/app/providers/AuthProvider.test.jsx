import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContext } from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, AuthContext, AUTH_STATUS } from './AuthProvider';

vi.mock('../../features/auth/api/auth.service', () => ({
  authService: { getMe: vi.fn() },
}));
// eslint-disable-next-line import/first
import { authService } from '../../features/auth/api/auth.service';

function Consumer() {
  const { user, loading, authStatus } = useContext(AuthContext);
  if (loading) return <div data-testid="state" data-status={authStatus}>loading</div>;
  return (
    <div data-testid="state" data-status={authStatus}>
      {user ? `user:${user.email}` : 'no-user'}
    </div>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <AuthProvider><Consumer /></AuthProvider>
    </MemoryRouter>
  );
}

function transientError(status, retryAfter) {
  const err = new Error('transient');
  if (status != null) err.status = status;
  if (retryAfter != null) err.retryAfter = retryAfter;
  return err;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AuthProvider — three-state auth model (authStatus: unknown | authenticated | guest)', () => {
  it('13. normal reload/bootstrap with a valid token: getMe succeeds and the user remains AUTHENTICATED (not unknown, not guest)', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe.mockResolvedValue({ email: 'alice@example.com', role: 'user' });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:alice@example.com'));
    expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.AUTHENTICATED);
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
  });

  it('1. getMe() returns 429 TWICE: token remains, authStatus settles on UNKNOWN — never guest — and no auth:expired fires', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe.mockRejectedValue(transientError(429, 1));

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    renderProvider();

    await waitFor(() => expect(authService.getMe).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.UNKNOWN));

    expect(screen.getByTestId('state').dataset.status).not.toBe(AUTH_STATUS.GUEST);
    expect(localStorage.getItem('accessToken')).toBe('valid-token'); // NOT cleared
    expect(expiredHandler).not.toHaveBeenCalled();

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('2. getMe() returns 500 TWICE: same expectation — token remains, UNKNOWN not guest, no auth:expired', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe.mockRejectedValue(transientError(500));

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    renderProvider();

    await waitFor(() => expect(authService.getMe).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.UNKNOWN));

    expect(screen.getByTestId('state').dataset.status).not.toBe(AUTH_STATUS.GUEST);
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
    expect(expiredHandler).not.toHaveBeenCalled();

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('3. a raw network failure (no status at all) during bootstrap: same expectation — UNKNOWN, token intact, no auth:expired', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe.mockRejectedValue(new TypeError('Failed to fetch')); // no .status property at all

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    renderProvider();

    await waitFor(() => expect(authService.getMe).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.UNKNOWN));

    expect(screen.getByTestId('state').dataset.status).not.toBe(AUTH_STATUS.GUEST);
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
    expect(expiredHandler).not.toHaveBeenCalled();

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('4a. an authoritative 401 correctly transitions to GUEST and clears the token', async () => {
    localStorage.setItem('accessToken', 'stale-token');
    authService.getMe.mockRejectedValue(transientError(401));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.GUEST));
    expect(screen.getByTestId('state').textContent).toBe('no-user');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(authService.getMe).toHaveBeenCalledTimes(1); // no retry for an authoritative failure
  });

  it('4b. an authoritative 403 (e.g. account deactivated) ALSO correctly transitions to GUEST', async () => {
    localStorage.setItem('accessToken', 'stale-token');
    authService.getMe.mockRejectedValue(transientError(403));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.GUEST));
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('5. a transient failure followed by a successful retry returns to normal AUTHENTICATED state', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe
      .mockRejectedValueOnce(transientError(429, 1))
      .mockResolvedValueOnce({ email: 'alice@example.com', role: 'user' });

    renderProvider();

    await waitFor(
      () => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.AUTHENTICATED),
      { timeout: 3000 }
    );
    expect(screen.getByTestId('state').textContent).toBe('user:alice@example.com');
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
    expect(authService.getMe).toHaveBeenCalledTimes(2);
  });

  it('6. multiple rapid reload/bootstrap simulations (repeated transient failures across remounts) never trigger a logout transition', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe.mockRejectedValue(transientError(429, 1));

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    // Simulate 3 rapid "F5" reloads — each one mounts a fresh AuthProvider
    // (exactly what a real page reload does), each hitting a transient 429.
    for (let i = 0; i < 3; i++) {
      renderProvider();
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.UNKNOWN), { timeout: 3000 });
      expect(screen.getByTestId('state').dataset.status).not.toBe(AUTH_STATUS.GUEST);
      expect(localStorage.getItem('accessToken')).toBe('valid-token');
      cleanup();
    }

    expect(expiredHandler).not.toHaveBeenCalled();
    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('no stored token at all: bootstrap does not call getMe, and authStatus resolves immediately to GUEST', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state').dataset.status).toBe(AUTH_STATUS.GUEST));
    expect(screen.getByTestId('state').textContent).toBe('no-user');
    expect(authService.getMe).not.toHaveBeenCalled();
  });
});
