import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './AuthCloseButton.module.css';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isSafeReturnPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  return !AUTH_ROUTES.some((route) => path === route || path.startsWith(`${route}?`));
}

// Shared close affordance for the standalone Login/Register/ForgotPassword
// pages (there's no auth layout wrapper to attach this to once, so it's a
// single component reused by all three instead of duplicated per-page).
// Prefers the internal page the user actually came from (passed via router
// state as `returnTo` at the Link/navigate call site); RequireAuth's own
// `state.from` is deliberately NOT reused here since that points at the
// protected route itself (e.g. /checkout) and would just bounce an
// unauthenticated user straight back to /login — falling back to `/` is the
// safe choice in that case.
export default function AuthCloseButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTranslation();

  const close = useCallback(() => {
    const returnTo = location.state?.returnTo;
    navigate(isSafeReturnPath(returnTo) ? returnTo : '/', { replace: true });
  }, [location.state, navigate]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const label = t('auth.close_screen');

  return (
    <button
      type="button"
      className={s.closeBtn}
      onClick={close}
      aria-label={label}
      title={label}
    >
      <X size={20} />
    </button>
  );
}
