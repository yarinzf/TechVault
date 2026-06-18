import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../context/LanguageContext';
import AuthBackground from './AuthBackground';
import s from './LoginPage.module.css';

const COUNTRIES = [
  { code: '+972', label: '🇮🇱 +972' },
  { code: '+1',   label: '🇺🇸 +1'   },
  { code: '+44',  label: '🇬🇧 +44'  },
];

function TechVaultLogo() {
  return (
    <svg width="22" height="24" viewBox="0 0 133 142" fill="none" aria-hidden="true">
      <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
      <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

export default function RegisterPage() {
  const { register, loginWithGoogle, loginWithApple } = useAuth();
  const navigate     = useNavigate();
  const t            = useTranslation();

  const [form,    setForm]    = useState({ name: '', email: '', password: '', phone: '', country: '+972' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  // ── Google Sign In via renderButton overlay ───────────────────────────────
  const gsiContainerRef = useRef(null);
  const gsiCallbackRef  = useRef(null);

  gsiCallbackRef.current = async (response) => {
    setLoading(true);
    setError('');
    try {
      await loginWithGoogle(response.credential);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || t('auth.google_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return;
    const tryRender = () => {
      if (!window.google?.accounts?.id || !gsiContainerRef.current) return false;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: (r) => gsiCallbackRef.current?.(r),
        auto_select: false,
        cancel_on_tap_outside: false,
      });
      window.google.accounts.id.renderButton(gsiContainerRef.current, {
        type: 'standard',
        size: 'large',
        width: gsiContainerRef.current.offsetWidth || 120,
      });
      return true;
    };
    if (tryRender()) return;
    const script = document.querySelector('script[src*="accounts.google.com/gsi"]');
    if (!script) return;
    script.addEventListener('load', tryRender);
    return () => {
      script.removeEventListener('load', tryRender);
      window.google?.accounts?.id?.cancel?.();
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError(t('auth.password_min_8')); return; }
    setLoading(true);
    try {
      const fullPhone = form.phone ? `${form.country}${form.phone}` : undefined;
      await register(form.name, form.email, form.password, fullPhone);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || t('auth.register_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    if (!window.AppleID?.auth) {
      setError(t('auth.apple_script_error'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      window.AppleID.auth.init({
        clientId:    import.meta.env.VITE_APPLE_CLIENT_ID,
        scope:       'name email',
        redirectURI: import.meta.env.VITE_APPLE_REDIRECT_URI || window.location.origin + '/register',
        usePopup:    true,
      });
      const response = await window.AppleID.auth.signIn();
      await loginWithApple(response.authorization.id_token);
      navigate('/', { replace: true });
    } catch (err) {
      if (err?.error !== 'popup_closed_by_user') {
        setError(err.message || t('auth.apple_failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      {/* Real storefront rendered behind the blur */}
      <div className={s.bgLayer} aria-hidden="true">
        <AuthBackground />
      </div>
      <div className={s.overlay} aria-hidden="true" />

      <div className={s.cardWrap}>
      <div className={s.card}>

        {/* Logo */}
        <Link to="/" className={s.logo} aria-label="TechVault - עמוד הבית">
          <TechVaultLogo />
          <span>Tech<span className={s.logoAccent}>Vault</span></span>
        </Link>

        {/* Pill tabs */}
        <div className={s.tabs} role="tablist">
          <Link to="/login" className={s.tab} role="tab" aria-selected="false">
            {t('auth.login_btn')}
          </Link>
          <span className={`${s.tab} ${s.tabActive}`} role="tab" aria-selected="true">
            {t('auth.create_btn')}
          </span>
        </div>

        {/* Form */}
        <form className={s.form} onSubmit={submit} noValidate>
          {error && <div className={s.error} role="alert">{error}</div>}

          <div className={s.field}>
            <label className={s.label} htmlFor="reg-name">{t('auth.full_name')}</label>
            <input
              id="reg-name"
              className={s.input}
              placeholder="ישראל ישראלי"
              value={form.name}
              onChange={handle('name')}
              required
              autoComplete="name"
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="reg-email">{t('auth.email')}</label>
            <input
              id="reg-email"
              className={s.input}
              type="email"
              placeholder="your@email.com"
              value={form.email}
              onChange={handle('email')}
              required
              autoComplete="email"
              dir="ltr"
            />
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="reg-phone">מספר טלפון</label>
            <div className={s.phoneRow}>
              <select
                className={`${s.input} ${s.countrySelect}`}
                value={form.country}
                onChange={handle('country')}
                dir="ltr"
                aria-label="קידומת מדינה"
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input
                id="reg-phone"
                className={`${s.input} ${s.phoneInput}`}
                type="tel"
                placeholder="05X-XXXXXXX"
                value={form.phone}
                onChange={handle('phone')}
                autoComplete="tel"
                dir="ltr"
              />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="reg-password">{t('auth.password')}</label>
            <input
              id="reg-password"
              className={s.input}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handle('password')}
              required
              autoComplete="new-password"
              dir="ltr"
            />
          </div>

          <button
            type="submit"
            className={s.submit}
            disabled={loading}
            aria-busy={loading}
          >
            <UserPlus size={16} />
            {loading ? t('auth.creating') : t('auth.create_btn')}
          </button>
        </form>

        {/* divider */}
        <div className={s.divider}>{t('auth.or_continue_with')}</div>

        {/* OAuth row: Google · Apple */}
        <div className={s.oauth}>
          <div className={s.oauthGoogleWrap}>
            <button
              type="button"
              className={s.oauthBtn}
              disabled={loading}
              aria-label="הרשמה עם Google"
              tabIndex={-1}
            >
              <GoogleIcon /> Google
            </button>
            <div
              ref={gsiContainerRef}
              className={s.gsiOverlay}
              style={loading ? { pointerEvents: 'none' } : undefined}
              aria-hidden="true"
            />
          </div>
          <button
            type="button"
            className={`${s.oauthBtn} ${!import.meta.env.VITE_APPLE_CLIENT_ID ? s.oauthBtnDisabled : ''}`}
            onClick={handleApple}
            disabled={loading || !import.meta.env.VITE_APPLE_CLIENT_ID}
            aria-label="הרשמה עם Apple"
            title={!import.meta.env.VITE_APPLE_CLIENT_ID ? t('auth.apple_not_configured') : undefined}
          >
            <AppleIcon /> Apple
          </button>
        </div>

        {/* Terms */}
        <div className={s.terms}>
          בהרשמה אתם מסכימים ל<Link to="/terms">תנאי השימוש</Link> ו<Link to="/privacy">מדיניות הפרטיות</Link>
        </div>

        {/* Footer */}
        <div className={s.footer}>
          {t('auth.have_account')}{' '}
          <Link to="/login" className={s.link}>{t('auth.login_btn')}</Link>
        </div>

      </div>
      </div>{/* cardWrap */}
    </div>
  );
}
