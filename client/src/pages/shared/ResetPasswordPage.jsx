import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import AuthBackground from './AuthBackground';
import { authService } from '../../features/auth/api/auth.service';
import s from './ResetPasswordPage.module.css';

function TechVaultLogo() {
  return (
    <svg width="22" height="24" viewBox="0 0 133 142" fill="none" aria-hidden="true">
      <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
      <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
    </svg>
  );
}

function PageShell({ children }) {
  return (
    <div className={s.page}>
      <div className={s.bgLayer} aria-hidden="true"><AuthBackground /></div>
      <div className={s.overlay} aria-hidden="true" />
      <div className={s.cardWrap}>
        <div className={s.card}>
          <Link to="/" className={s.logo} aria-label="TechVault - עמוד הבית">
            <TechVaultLogo />
            <span>Tech<span className={s.logoAccent}>Vault</span></span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const token          = searchParams.get('token');

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState('');

  if (!token) {
    return (
      <PageShell>
        <h1 className={s.title}>קישור לא תקין</h1>
        <div className={s.error} role="alert">
          קישור האיפוס חסר או לא תקין. בקש קישור חדש.
        </div>
        <div className={s.footer}>
          <Link to="/forgot-password" className={s.link}>שלח קישור חדש</Link>
        </div>
      </PageShell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError(err.message || 'הקישור אינו תקין או שפג תוקפו. בקש קישור חדש.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <h1 className={s.title}>איפוס סיסמה</h1>
      <p className={s.subtitle}>הגדר סיסמה חדשה לחשבונך</p>

      {done ? (
        <div className={s.success}>
          <div className={s.successIcon}>✅</div>
          <p>הסיסמה אופסה בהצלחה!</p>
          <p className={s.successNote}>מועבר לדף ההתחברות...</p>
        </div>
      ) : (
        <form className={s.form} onSubmit={submit} noValidate>
          {error && <div className={s.error} role="alert">{error}</div>}

          <div className={s.field}>
            <label className={s.label} htmlFor="reset-password">סיסמה חדשה</label>
            <div className={s.inputWrap}>
              <input
                id="reset-password"
                className={s.input}
                type={showPassword ? 'text' : 'password'}
                placeholder="לפחות 8 תווים"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                dir="ltr"
                autoFocus
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="reset-confirm">אימות סיסמה</label>
            <input
              id="reset-confirm"
              className={s.input}
              type={showPassword ? 'text' : 'password'}
              placeholder="חזור על הסיסמה"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
            <Lock size={16} />
            {loading ? 'מאפס...' : 'אפס סיסמה'}
          </button>
        </form>
      )}

      <div className={s.footer}>
        <Link to="/login" className={s.link}>חזרה להתחברות</Link>
      </div>
    </PageShell>
  );
}
