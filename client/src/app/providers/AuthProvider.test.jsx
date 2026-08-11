import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, AuthContext } from './AuthProvider';

vi.mock('../../features/auth/api/auth.service', () => ({
  authService: { getMe: vi.fn() },
}));
// eslint-disable-next-line import/first
import { authService } from '../../features/auth/api/auth.service';

function Consumer() {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div data-testid="state">loading</div>;
  return <div data-testid="state">{user ? `user:${user.email}` : 'no-user'}</div>;
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <AuthProvider><Consumer /></AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AuthProvider — bootstrap resilience (Part B / Part E item 13)', () => {
  it('13. normal reload/bootstrap with a valid token: getMe succeeds and the user remains authenticated', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    authService.getMe.mockResolvedValue({ email: 'alice@example.com', role: 'user' });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:alice@example.com'));
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
    expect(authService.getMe).toHaveBeenCalledTimes(1);
  });

  it('a transient bootstrap failure (429) does not clear the token, retries once, and recovers without a forced logout', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    const transientErr = new Error('rate limited');
    transientErr.status = 429;
    transientErr.retryAfter = 1;
    authService.getMe
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce({ email: 'alice@example.com', role: 'user' });

    renderProvider();

    // First render tick: still "loading" or transiently failed — token must
    // never disappear at any point during this sequence.
    expect(localStorage.getItem('accessToken')).toBe('valid-token');

    await waitFor(
      () => expect(screen.getByTestId('state').textContent).toBe('user:alice@example.com'),
      { timeout: 3000 }
    );
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
    expect(authService.getMe).toHaveBeenCalledTimes(2); // one retry, then success
  });

  it('two consecutive transient bootstrap failures (5xx) give up quietly WITHOUT clearing the token or forcing a logout', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    const serverErr = new Error('server error');
    serverErr.status = 500;
    authService.getMe.mockRejectedValue(serverErr);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('no-user'), { timeout: 3000 });
    // Critical assertion: even though we couldn't confirm the profile, the
    // stored token is NOT destroyed — this is not a logout, just an
    // unconfirmed profile for this page load.
    expect(localStorage.getItem('accessToken')).toBe('valid-token');
    expect(authService.getMe).toHaveBeenCalledTimes(2); // initial + one retry, then give up
  });

  it('an authoritative bootstrap failure (401) DOES clear the token — a genuinely invalid/expired session', async () => {
    localStorage.setItem('accessToken', 'stale-token');
    const authErr = new Error('unauthorized');
    authErr.status = 401;
    authService.getMe.mockRejectedValue(authErr);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('no-user'));
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(authService.getMe).toHaveBeenCalledTimes(1); // no retry for an authoritative failure
  });

  it('no stored token at all: bootstrap does not call getMe, and loading resolves immediately to no-user', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('no-user'));
    expect(authService.getMe).not.toHaveBeenCalled();
  });
});
