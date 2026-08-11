import { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../features/auth/api/auth.service';
import { getToken, clearToken } from '../../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // ── Restore session on mount ───────────────────────────────────────────────
  // A transient failure (429 rate limit, 5xx, network error/timeout) must
  // NEVER clear the stored token or otherwise look like a logout — it just
  // means we couldn't confirm the profile on THIS attempt. Only an
  // authoritative auth failure (401/403 — token/session actually invalid,
  // or the account was deactivated) clears it. Transient failures get one
  // short retry (respecting Retry-After when the server supplied one) before
  // giving up for this load; the token stays in localStorage either way, so
  // the next successful call restores the session normally.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) { setLoading(false); return undefined; }

    const bootstrap = async (attempt = 0) => {
      try {
        const u = await authService.getMe();
        if (!cancelled) setUser(u);
      } catch (err) {
        const authoritative = err?.status === 401 || err?.status === 403;
        if (authoritative) {
          clearToken();
        } else if (attempt === 0) {
          const retrySeconds = Math.min(Number(err?.retryAfter) || 1, 5);
          await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
          if (!cancelled) return bootstrap(1);
        }
        // Second transient failure in a row: leave the token intact and
        // give up silently for this page load — do not force a logout.
      }
      if (!cancelled) setLoading(false);
    };

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // ── Listen for token expiry dispatched by api.js ───────────────────────────
  useEffect(() => {
    const handler = () => { setUser(null); navigate('/login', { replace: true }); };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [navigate]);

  const login = useCallback(async (email, password) => {
    const u = await authService.login(email, password);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (name, email, password, phone) => {
    const u = await authService.register(name, email, password, phone);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    navigate('/login');
  }, [navigate]);

  const refreshProfile = useCallback(async () => {
    const u = await authService.getMe();
    setUser(u);
    return u;
  }, []);

  // ── OAuth / Social ─────────────────────────────────────────────────────────

  const loginWithGoogle = useCallback(async (idToken) => {
    const u = await authService.loginWithGoogle(idToken);
    setUser(u);
    return u;
  }, []);

  const loginWithApple = useCallback(async (idToken) => {
    const u = await authService.loginWithApple(idToken);
    setUser(u);
    return u;
  }, []);

  // ── SMS ────────────────────────────────────────────────────────────────────

  const smsStart = useCallback(async (phone) => {
    return authService.smsStart(phone);
  }, []);

  const smsVerify = useCallback(async (phone, code) => {
    const u = await authService.smsVerify(phone, code);
    setUser(u);
    return u;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, logout, refreshProfile,
      loginWithGoogle, loginWithApple,
      smsStart, smsVerify,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
