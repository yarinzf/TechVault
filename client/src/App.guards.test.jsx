import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth, RequireAdmin, RequireWarehouse, RequireSuperadmin } from './App';
import { AUTH_STATUS } from './app/providers/AuthProvider';

// These are the exact same guard components App.jsx wires into every admin/
// warehouse/superadmin route (see role architecture reorg). Testing them in
// isolation — rather than rendering the full <App/>, which would require the
// entire provider tree (Cart/Wishlist/Compare/etc.) — exercises the real
// production authorization logic without the fragility of a full-app mount.
vi.mock('./hooks/useAuth');
// eslint-disable-next-line import/first
import { useAuth } from './hooks/useAuth';

function renderGuarded(Guard, { initialPath = '/target' } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/" element={<div>home-page</div>} />
        <Route path="/target" element={<Guard><div>protected-content</div></Guard>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App.jsx route guards — direct URL authorization (hiding a nav link is not enough)', () => {
  describe('RequireAuth', () => {
    it('renders protected content for an authenticated user of any role', () => {
      useAuth.mockReturnValue({ user: { role: 'user' }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireAuth);
      expect(screen.getByText('protected-content')).toBeInTheDocument();
    });

    it('redirects a guest to /login', () => {
      useAuth.mockReturnValue({ user: null, loading: false, authStatus: AUTH_STATUS.GUEST });
      renderGuarded(RequireAuth);
      expect(screen.getByText('login-page')).toBeInTheDocument();
    });

    it('does not decide (stays on loader) while authStatus is unknown', () => {
      useAuth.mockReturnValue({ user: null, loading: false, authStatus: AUTH_STATUS.UNKNOWN });
      renderGuarded(RequireAuth);
      expect(screen.queryByText('protected-content')).not.toBeInTheDocument();
      expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    });
  });

  describe('RequireAdmin — admin can access Admin, warehouse and customer cannot', () => {
    it.each([['admin'], ['superadmin']])('allows role=%s', (role) => {
      useAuth.mockReturnValue({ user: { role }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireAdmin);
      expect(screen.getByText('protected-content')).toBeInTheDocument();
    });

    it.each([['warehouse'], ['user']])('blocks role=%s (redirects to /)', (role) => {
      useAuth.mockReturnValue({ user: { role }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireAdmin);
      expect(screen.getByText('home-page')).toBeInTheDocument();
      expect(screen.queryByText('protected-content')).not.toBeInTheDocument();
    });

    it('redirects an unauthenticated user to /login, not /', () => {
      useAuth.mockReturnValue({ user: null, loading: false, authStatus: AUTH_STATUS.GUEST });
      renderGuarded(RequireAdmin);
      expect(screen.getByText('login-page')).toBeInTheDocument();
    });
  });

  describe('RequireWarehouse — warehouse, admin and superadmin can access Warehouse; plain customer cannot', () => {
    it.each([['warehouse'], ['admin'], ['superadmin']])('allows role=%s', (role) => {
      useAuth.mockReturnValue({ user: { role }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireWarehouse);
      expect(screen.getByText('protected-content')).toBeInTheDocument();
    });

    it('blocks role=user (redirects to /)', () => {
      useAuth.mockReturnValue({ user: { role: 'user' }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireWarehouse);
      expect(screen.getByText('home-page')).toBeInTheDocument();
    });
  });

  describe('RequireSuperadmin — exclusive to superadmin, NOT inherited by plain admin or warehouse', () => {
    it('allows role=superadmin', () => {
      useAuth.mockReturnValue({ user: { role: 'superadmin' }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireSuperadmin);
      expect(screen.getByText('protected-content')).toBeInTheDocument();
    });

    it.each([['admin'], ['warehouse'], ['user']])('blocks role=%s (redirects to /)', (role) => {
      useAuth.mockReturnValue({ user: { role }, loading: false, authStatus: AUTH_STATUS.AUTHENTICATED });
      renderGuarded(RequireSuperadmin);
      expect(screen.getByText('home-page')).toBeInTheDocument();
      expect(screen.queryByText('protected-content')).not.toBeInTheDocument();
    });

    it('redirects an unauthenticated user to /login', () => {
      useAuth.mockReturnValue({ user: null, loading: false, authStatus: AUTH_STATUS.GUEST });
      renderGuarded(RequireSuperadmin);
      expect(screen.getByText('login-page')).toBeInTheDocument();
    });
  });
});
