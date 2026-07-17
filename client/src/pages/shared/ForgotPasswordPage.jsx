import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import AuthBackground from './AuthBackground';
import AuthCloseButton from '../../components/ui/AuthCloseButton/AuthCloseButton';
import { authService } from '../../features/auth/api/auth.service';
import { useTranslation } from '../../context/LanguageContext';
import s from './ForgotPasswordPage.module.css';

function TechVaultLogo() {
  return (
    <svg width="22" height="24" viewBox="0 0 133 142" fill="none" aria-hidden="true">
      <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
      <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
    </svg>
  );
}

export default function ForgotPasswordPage() {
  const t = useTranslation();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || t('auth.forgot_generic_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.bgLayer} aria-hidden="true">
        <AuthBackground />
      </div>
      <div className={s.overlay} aria-hidden="true" />

      <div className={s.cardWrap}>
        <div className={s.card}>
          <AuthCloseButton />

          <Link to="/" className={s.logo} aria-label={t('auth.logo_home_label')}>
            <TechVaultLogo />
            <span>Tech<span className={s.logoAccent}>Vault</span></span>
          </Link>

          <h1 className={s.title}>{t('auth.forgot_title')}</h1>
          <p className={s.subtitle}>{t('auth.forgot_subtitle')}</p>

          {sent ? (
            <div className={s.success}>
              <div className={s.successIcon}>✉️</div>
              <p><strong>{t('auth.forgot_success_title')}</strong></p>
              <p>{t('auth.forgot_success_message')}</p>
              <p className={s.successNote}>{t('auth.forgot_success_hint')}</p>
            </div>
          ) : (
            <form className={s.form} onSubmit={submit} noValidate>
              {error && <div className={s.error} role="alert">{error}</div>}
              <div className={s.field}>
                <label className={s.label} htmlFor="forgot-email">{t('auth.forgot_email_label')}</label>
                <input
                  id="forgot-email"
                  className={s.input}
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  dir="ltr"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className={s.submit}
                disabled={loading}
                aria-busy={loading}
              >
                <Mail size={16} />
                {loading ? t('auth.forgot_sending') : t('auth.forgot_submit_btn')}
              </button>
            </form>
          )}

          <div className={s.footer}>
            <Link to="/login" className={s.backLink}>
              <ArrowLeft size={14} />
              {t('auth.forgot_back_to_login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
