import { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../features/auth/api/auth.service';
import { getToken, clearToken } from '../../services/api';

export const AuthContext = createContext(null);

// Three explicit, mutually-exclusive states — deliberately distinct from
// plain `user` truthiness so a transient failure can never be mistaken for
// an authoritative "you are logged out":
//   'unknown'       — not yet confirmed either way (initial load, or a
//                      transient 429/5xx/network failure that couldn't be
//                      resolved after retrying). NOT the same as guest.
//   'authenticated' — a real profile was confirmed by the server.
//   'guest'         — authoritatively confirmed: no token, or the server
//                      explicitly said the session is invalid (401/403).
export const AUTH_STATUS = { UNKNOWN: 'unknown', AUTHENTICATED: 'authenticated', GUEST: 'guest' };

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [authStatus, setAuthStatus] = useState(AUTH_STATUS.UNKNOWN);
  const [loading,    setLoading]    = useState(true);
  const navigate = useNavigate();

  // ── Restore session on mount ───────────────────────────────────────────────
  // A transient failure (429 rate limit, 5xx, network error/timeout) must
  // NEVER clear the stored token, fire a logout, or resolve authStatus to
  // 'guest' — it just means we couldn't confirm the profile on THIS attempt.
  // Only an authoritative auth failure (401/403 — token/session actually
  // invalid, or the account was deactivated) transitions to 'guest'.
  // Transient failures get one short retry (respecting Retry-After when the
  // server supplied one); if that retry ALSO fails transiently, authStatus
  // settles on 'unknown' — never 'guest' — and the token stays in
  // localStorage, so the next successful call (this session or a future
  // reload) restores 'authenticated' normally. Route guards (see App.jsx)
  // treat 'unknown' as "can't confirm yet", not as logged out.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) { setAuthStatus(AUTH_STATUS.GUEST); setLoading(false); return undefined; }

    const bootstrap = async (attempt = 0) => {
      try {
        const u = await authService.getMe();
        if (!cancelled) { setUser(u); setAuthStatus(AUTH_STATUS.AUTHENTICATED); }
      } catch (err) {
        const authoritative = err?.status === 401 || err?.status === 403;
        if (authoritative) {
          clearToken();
          if (!cancelled) { setUser(null); setAuthStatus(AUTH_STATUS.GUEST); }
        } else if (attempt === 0) {
          const retrySeconds = Math.min(Number(err?.retryAfter) || 1, 5);
          await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
          if (!cancelled) return bootstrap(1);
        } else if (!cancelled) {
          // Second transient failure in a row: token intact, stay 'unknown'
          // — do not force a logout or guest-looking UI.
          setAuthStatus(AUTH_STATUS.UNKNOWN);
        }
      }
      if (!cancelled) setLoading(false);
    };

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // ── Listen for token expiry dispatched by api.js ───────────────────────────
  // Only fired for an AUTHORITATIVE refresh failure (see services/api/index.js)
  // — a transient 429/5xx/network error on /auth/refresh never reaches this.
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setAuthStatus(AUTH_STATUS.GUEST);
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [navigate]);

  const login = useCallback(async (email, password) => {
    const u = await authService.login(email, password);
    setUser(u);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    return u;
  }, []);

  const register = useCallback(async (name, email, password, phone) => {
    const u = await authService.register(name, email, password, phone);
    setUser(u);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setAuthStatus(AUTH_STATUS.GUEST);
    navigate('/login');
  }, [navigate]);

  const refreshProfile = useCallback(async () => {
    const u = await authService.getMe();
    setUser(u);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    return u;
  }, []);

  // ── OAuth / Social ─────────────────────────────────────────────────────────

  const loginWithGoogle = useCallback(async (idToken) => {
    const u = await authService.loginWithGoogle(idToken);
    setUser(u);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    return u;
  }, []);

  const loginWithApple = useCallback(async (idToken) => {
    const u = await authService.loginWithApple(idToken);
    setUser(u);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    return u;
  }, []);

  // ── SMS ────────────────────────────────────────────────────────────────────

  const smsStart = useCallback(async (phone) => {
    return authService.smsStart(phone);
  }, []);

  const smsVerify = useCallback(async (phone, code) => {
    const u = await authService.smsVerify(phone, code);
    setUser(u);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    return u;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, authStatus,
      login, register, logout, refreshProfile,
      loginWithGoogle, loginWithApple,
      smsStart, smsVerify,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
