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
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    authService.getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
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
