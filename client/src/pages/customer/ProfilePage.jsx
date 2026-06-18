import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { authService } from '../../features/auth/api/auth.service';
import Button from '../../components/ui/Button/Button';
import { useTranslation, useLanguage } from '../../context/LanguageContext';
import s from './ProfilePage.module.css';

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function InfoTab({ user, refreshProfile, toast }) {
  const t = useTranslation();
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName:  user?.lastName  ?? '',
    phone:     user?.phone     ?? '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await authService.updateMe(form);
      await refreshProfile();
      toast.success(t('profile.updated'));
    } catch (err) {
      toast.error(err.message || t('profile.update_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div className={s.formGrid}>
        <div className={s.formGroup}>
          <label className={s.label}>{t('profile.first_name')}</label>
          <input className="input" name="firstName" value={form.firstName} onChange={handleChange} />
        </div>
        <div className={s.formGroup}>
          <label className={s.label}>{t('profile.last_name')}</label>
          <input className="input" name="lastName" value={form.lastName} onChange={handleChange} />
        </div>
        <div className={`${s.formGroup} ${s.formGroupFull}`}>
          <label className={s.label}>{t('profile.email')}</label>
          <input className="input" value={user?.email ?? ''} disabled style={{ opacity: 0.5 }} />
        </div>
        <div className={`${s.formGroup} ${s.formGroupFull}`}>
          <label className={s.label}>{t('profile.phone')}</label>
          <input className="input" name="phone" value={form.phone} onChange={handleChange} placeholder="050-1234567" />
        </div>
      </div>
      <div className={s.formActions}>
        <Button type="submit" disabled={saving}>{saving ? t('profile.saving') : t('profile.save')}</Button>
      </div>
    </form>
  );
}

function PasswordTab({ toast }) {
  const t = useTranslation();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleChange = e => { setErr(''); setForm(f => ({ ...f, [e.target.name]: e.target.value })); };

  const handleSave = async e => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) { setErr(t('profile.password_mismatch')); return; }
    if (form.newPassword.length < 6) { setErr(t('profile.password_short')); return; }
    setSaving(true);
    try {
      await authService.changePassword(form.currentPassword, form.newPassword);
      toast.success(t('profile.password_changed'));
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err2) {
      setErr(err2.message || t('profile.password_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div className={s.formGrid}>
        <div className={`${s.formGroup} ${s.formGroupFull}`}>
          <label className={s.label}>{t('profile.current_password')}</label>
          <input className="input" type="password" name="currentPassword" value={form.currentPassword} onChange={handleChange} autoComplete="current-password" />
        </div>
        <div className={s.formGroup}>
          <label className={s.label}>{t('profile.new_password')}</label>
          <input className="input" type="password" name="newPassword" value={form.newPassword} onChange={handleChange} autoComplete="new-password" />
        </div>
        <div className={s.formGroup}>
          <label className={s.label}>{t('profile.confirm_password')}</label>
          <input className="input" type="password" name="confirm" value={form.confirm} onChange={handleChange} autoComplete="new-password" />
        </div>
      </div>
      {err && <p style={{ color: 'var(--error)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>{err}</p>}
      <div className={s.formActions}>
        <Button type="submit" disabled={saving}>{saving ? t('profile.saving') : t('profile.update_password')}</Button>
      </div>
    </form>
  );
}

function SecurityTab({ user, toast }) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const fmtDate = iso => new Date(iso).toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', { year: 'numeric', month: 'long', day: 'numeric' });

  const fmtAgo = iso => {
    if (!iso) return '—';
    const relFmt = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    const diffMs  = new Date(iso) - Date.now();
    const diffSec = Math.floor(diffMs / 1000);
    if (Math.abs(diffSec) < 60)  return diffSec >= 0 ? t('profile.just_now') : relFmt.format(Math.ceil(diffSec), 'seconds');
    const diffMin = Math.floor(diffSec / 60);
    if (Math.abs(diffMin) < 60)  return relFmt.format(Math.ceil(diffMin), 'minutes');
    const diffH = Math.floor(diffMin / 60);
    if (Math.abs(diffH) < 24)   return relFmt.format(Math.ceil(diffH), 'hours');
    return fmtDate(iso);
  };

  const [sessions,        setSessions]        = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revoking,        setRevoking]        = useState('');
  const [loggingOutAll,   setLoggingOutAll]   = useState(false);

  useEffect(() => {
    authService.getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  const handleRevoke = async (sessionId) => {
    setRevoking(sessionId);
    try {
      await authService.revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s._id !== sessionId));
      toast.success(t('profile.session_ended'));
    } catch (err) {
      toast.error(err.message || t('profile.revoke_error'));
    } finally {
      setRevoking('');
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm(t('profile.logout_all_confirm'))) return;
    setLoggingOutAll(true);
    try {
      await authService.logoutAllDevices();
      navigate('/login');
    } catch (err) {
      toast.error(err.message);
      setLoggingOutAll(false);
    }
  };

  const DEVICE_ICONS = { Mobile: '📱', Tablet: '📟', Desktop: '🖥️', Unknown: '💻' };
  const deviceIcon = (name) => {
    if (/mobile/i.test(name)) return DEVICE_ICONS.Mobile;
    if (/tablet/i.test(name)) return DEVICE_ICONS.Tablet;
    return DEVICE_ICONS.Desktop;
  };

  return (
    <>
      {/* Account info summary */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div className={s.infoRow}>
          <span className={s.infoKey}>{t('profile.role')}</span>
          <span className={s.roleBadge}>{t(`role.${user?.role}`) || user?.role || t('role.user')}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoKey}>{t('profile.joined')}</span>
          <span className={s.infoVal}>{user?.createdAt ? fmtDate(user.createdAt) : '—'}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoKey}>{t('profile.account_status')}</span>
          <span className={s.infoVal} style={{ color: user?.isActive === false ? 'var(--error)' : 'var(--success)' }}>
            {user?.isActive === false ? t('profile.suspended') : t('profile.active')}
          </span>
        </div>
      </div>

      {/* Active sessions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {t('profile.active_sessions')}
          </h3>
          <button
            type="button"
            onClick={handleLogoutAll}
            disabled={loggingOutAll}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
          >
            {loggingOutAll ? t('profile.logging_out_all') : t('profile.logout_all')}
          </button>
        </div>

        {sessionsLoading ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            {t('profile.loading_sessions')}
          </p>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            {t('profile.no_sessions')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {sessions.map(session => (
              <div
                key={session._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 10,
                  border: session.isCurrent
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border)',
                  background: session.isCurrent
                    ? 'color-mix(in srgb, var(--primary) 6%, transparent)'
                    : 'var(--bg-elevated)',
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{deviceIcon(session.deviceName)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {session.deviceName || t('profile.unknown_device')}
                    </span>
                    {session.isCurrent && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        borderRadius: 999, background: 'var(--primary)',
                        color: '#fff', letterSpacing: '0.04em',
                      }}>
                        {t('profile.current_session')}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {session.ip && <span>{session.ip} · </span>}
                    {t('profile.last_used')} {fmtAgo(session.lastUsedAt)}
                    {session.createdAt && <span> · {t('profile.created_at')} {fmtDate(session.createdAt)}</span>}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(session._id)}
                    disabled={!!revoking}
                    style={{
                      flexShrink: 0,
                      fontSize: 'var(--text-xs)',
                      color: revoking === session._id ? 'var(--text-muted)' : 'var(--error)',
                      background: 'none', border: '1px solid currentColor',
                      borderRadius: 6, padding: '4px 10px',
                      cursor: revoking ? 'not-allowed' : 'pointer',
                      opacity: revoking && revoking !== session._id ? 0.5 : 1,
                    }}
                  >
                    {revoking === session._id ? t('profile.revoking') : t('profile.revoke')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function ProfilePage() {
  const { user, logout, refreshProfile } = useAuth();
  const { toast }   = useToast();
  const navigate    = useNavigate();
  const t = useTranslation();
  const [tab, setTab] = useState('info');

  const TABS = [
    { id: 'info',     label: t('profile.tab.info') },
    { id: 'password', label: t('profile.tab.password') },
    { id: 'security', label: t('profile.tab.security') },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || t('role.user');

  return (
    <div className="page">
      <div className={s.layout}>
        {/* Sidebar */}
        <aside className={s.sidebar}>
          <div className={s.avatar}>{initials(fullName)}</div>
          <div className={s.sidebarName}>{fullName}</div>
          <div className={s.sidebarEmail}>{user?.email}</div>
          <nav className={s.sidebarNav}>
            {TABS.map(tabItem => (
              <button
                key={tabItem.id}
                className={`${s.navBtn}${tab === tabItem.id ? ' ' + s.navActive : ''}`}
                onClick={() => setTab(tabItem.id)}
              >
                {tabItem.label}
              </button>
            ))}
            <button className={s.navBtn} onClick={handleLogout} style={{ color: 'var(--error)', marginTop: 'var(--space-3)' }}>
              {t('profile.logout')}
            </button>
          </nav>
        </aside>

        {/* Panel */}
        <div className={s.panel}>
          <h2 className={s.panelTitle}>{TABS.find(tabItem => tabItem.id === tab)?.label}</h2>
          {tab === 'info'     && <InfoTab     user={user} refreshProfile={refreshProfile} toast={toast} />}
          {tab === 'password' && <PasswordTab toast={toast} />}
          {tab === 'security' && <SecurityTab user={user} toast={toast} />}
        </div>
      </div>
    </div>
  );
}
