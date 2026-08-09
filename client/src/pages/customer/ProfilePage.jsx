import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Lock, Bell, Zap, BarChart2, Crown, Package, ShoppingBag,
  MapPin, CreditCard, Calendar, Mail, Phone, Clock, PackageCheck,
  XCircle, Pencil, Trash2, Plus,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useMembership } from '../../hooks/useMembership';
import { useWishlist } from '../../hooks/useWishlist';
import { authService } from '../../features/auth/api/auth.service';
import { membershipService } from '../../features/membership/api/membership.service';
import { orderService } from '../../features/orders/api/order.service';
import { formatExpiryDate, formatPlanLabel } from '../../features/membership/utils/membershipDisplay';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import { useTranslation, useLanguage } from '../../context/LanguageContext';
import s from './ProfilePage.module.css';

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function monthYear(iso, language) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', { year: 'numeric', month: 'long' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Personal dashboard — info grid, quick actions, stats, club banner, activity
// ═══════════════════════════════════════════════════════════════════════════
function PersonalDashboard({ user, refreshProfile, toast, onOpenAddresses, onOpenPayment }) {
  const t = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const membership = useMembership();
  const { ids: wishIds } = useWishlist();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => splitName(user?.name));
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState({ orderCount: null, totalSpent: null });
  const [activity, setActivity] = useState({ loading: true, orders: [] });

  useEffect(() => {
    let cancelled = false;
    orderService.listMine({ limit: 100 }).then(({ orders, meta }) => {
      if (cancelled) return;
      const paidTotal = (orders || [])
        .filter(o => o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + (o.total || 0), 0);
      setStats({ orderCount: meta?.total ?? orders.length, totalSpent: paidTotal });
      setActivity({ loading: false, orders: (orders || []).slice(0, 3) });
    }).catch(() => {
      if (!cancelled) { setStats({ orderCount: 0, totalSpent: 0 }); setActivity({ loading: false, orders: [] }); }
    });
    return () => { cancelled = true; };
  }, []);

  const startEdit = () => {
    setForm(splitName(user?.name));
    setPhone(user?.phone ?? '');
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = `${form.firstName} ${form.lastName}`.trim();
    if (name.length < 2) { toast.error(t('profile.name_too_short')); return; }
    setSaving(true);
    try {
      await authService.updateMe({ name, phone });
      await refreshProfile();
      toast.success(t('profile.updated'));
      setEditing(false);
    } catch (err) {
      toast.error(err.message || t('profile.update_failed'));
    } finally {
      setSaving(false);
    }
  };

  const fmtAgo = (iso) => {
    if (!iso) return '—';
    const relFmt = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    const diffMs  = new Date(iso) - Date.now();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    if (Math.abs(diffMin) < 60) return relFmt.format(Math.ceil(diffMin), 'minutes');
    const diffH = Math.floor(diffMin / 60);
    if (Math.abs(diffH) < 24) return relFmt.format(Math.ceil(diffH), 'hours');
    const diffD = Math.floor(diffH / 24);
    return relFmt.format(Math.ceil(diffD), 'days');
  };

  const orderIcon = (status) => (status === 'cancelled' || status === 'refunded')
    ? <XCircle />
    : <PackageCheck />;

  const QUICK_ACTIONS = [
    { key: 'orders',   icon: <Package />,     color: 'blue',   label: t('profile.quick.orders'),   onClick: () => navigate('/orders') },
    { key: 'shop',     icon: <ShoppingBag />, color: 'green',  label: t('profile.quick.shop'),     onClick: () => navigate('/') },
    { key: 'address',  icon: <MapPin />,      color: 'gold',   label: t('profile.quick.addresses'),onClick: onOpenAddresses },
    { key: 'payment',  icon: <CreditCard />,  color: 'violet', label: t('profile.quick.payment'),  onClick: onOpenPayment },
  ];

  return (
    <>
      {/* Personal info */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><User /> {t('profile.personal_info')}</div>
          {!editing && <button type="button" className={s.cardAction} onClick={startEdit}>{t('profile.edit')}</button>}
        </div>

        {editing ? (
          <form onSubmit={handleSave}>
            <div className={s.infoGrid}>
              <div className={s.infoItem}>
                <label className={s.infoLabel} htmlFor="profile-first-name">{t('profile.first_name')}</label>
                <input
                  id="profile-first-name"
                  className={s.infoEditInput}
                  value={form.firstName}
                  onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className={s.infoItem}>
                <label className={s.infoLabel} htmlFor="profile-last-name">{t('profile.last_name')}</label>
                <input
                  id="profile-last-name"
                  className={s.infoEditInput}
                  value={form.lastName}
                  onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))}
                />
              </div>
              <div className={s.infoItem}>
                <div className={s.infoLabel}>{t('profile.email')}</div>
                <div className={s.infoVal}>{user?.email}</div>
              </div>
              <div className={s.infoItem}>
                <label className={s.infoLabel} htmlFor="profile-phone">{t('profile.phone')}</label>
                <input
                  id="profile-phone"
                  className={s.infoEditInput}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="050-1234567"
                />
              </div>
              <div className={s.infoItem}>
                <div className={s.infoLabel}>{t('profile.birth_date')}</div>
                <div className={`${s.infoVal} ${s.infoValEmpty}`}>{t('profile.not_set')}</div>
              </div>
              <div className={s.infoItem}>
                <div className={s.infoLabel}>{t('profile.customer_since')}</div>
                <div className={s.infoVal}>{monthYear(user?.createdAt, language) ?? '—'}</div>
              </div>
            </div>
            <div style={{ display: 'flex' }}>
              <button type="button" className={s.cancelBtn} onClick={() => setEditing(false)} disabled={saving}>
                {t('profile.cancel')}
              </button>
              <button type="submit" className={s.saveBtn} disabled={saving}>
                {saving ? t('profile.saving') : t('profile.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className={s.infoGrid}>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('profile.first_name')}</div>
              <div className={s.infoVal}>{splitName(user?.name).firstName || '—'}</div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('profile.last_name')}</div>
              <div className={s.infoVal}>{splitName(user?.name).lastName || '—'}</div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('profile.email')}</div>
              <div className={s.infoVal}>{user?.email}</div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('profile.phone')}</div>
              <div className={user?.phone ? s.infoVal : `${s.infoVal} ${s.infoValEmpty}`}>{user?.phone || t('profile.not_set')}</div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('profile.birth_date')}</div>
              <div className={`${s.infoVal} ${s.infoValEmpty}`}>{t('profile.not_set')}</div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('profile.customer_since')}</div>
              <div className={s.infoVal}>{monthYear(user?.createdAt, language) ?? '—'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><Zap /> {t('profile.quick_actions')}</div>
        </div>
        <div className={s.quickGrid}>
          {QUICK_ACTIONS.map(qa => (
            <button key={qa.key} type="button" className={s.quickBtn} onClick={qa.onClick}>
              <span className={`${s.quickBtnIcon} ${s[qa.color]}`}>{qa.icon}</span>
              <span className={s.quickBtnLabel}>{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><BarChart2 /> {t('profile.stats')}</div>
        </div>
        <div className={s.statsGrid}>
          <div className={s.stat}>
            <div className={`${s.statNum} ${s.blue}`}>{stats.orderCount ?? '—'}</div>
            <div className={s.statLabel}>{t('profile.stat_orders')}</div>
          </div>
          <div className={s.stat}>
            <div className={`${s.statNum} ${s.gold}`}>{wishIds.size}</div>
            <div className={s.statLabel}>{t('profile.stat_favorites')}</div>
          </div>
          <div className={s.stat}>
            <div className={`${s.statNum} ${s.success}`}>
              {stats.totalSpent != null ? `₪${stats.totalSpent.toLocaleString()}` : '—'}
            </div>
            <div className={s.statLabel}>{t('profile.stat_spent')}</div>
          </div>
        </div>
      </div>

      {/* Club status */}
      <div className={s.club}>
        <span className={s.clubIcon}><Crown /></span>
        <div className={s.clubBody}>
          {membership.isMember ? (
            <>
              <div className={s.clubTitle}>{t('profile.club_member_title')}</div>
              <div className={s.clubDesc}>
                {formatPlanLabel(membership.plan, language) && (
                  <>{t('profile.club_plan_label')} {formatPlanLabel(membership.plan, language)}
                    {membership.expiresAt && <> · {t('profile.club_renews_label')} {formatExpiryDate(membership.expiresAt, language)}</>}
                    <br />
                  </>
                )}
                {membership.points.toLocaleString()} {t('profile.club_points_label')} · <strong>✔ {t('profile.club_active')}</strong>
              </div>
            </>
          ) : (
            <>
              <div className={s.clubTitle}>{t('profile.club_nonmember_title')}</div>
              <div className={s.clubDesc}>{t('profile.club_nonmember_desc')}</div>
            </>
          )}
        </div>
        <button type="button" className={s.clubCta} onClick={() => navigate(membership.isMember ? '/club' : '/club/join')}>
          {membership.isMember ? t('profile.club_cta_details') : t('profile.club_cta_join')}
        </button>
      </div>

      {/* Recent activity — sourced from real orders only (no recently-viewed
          or wishlist-add tracking exists in the backend, so those Sapir
          activity types are intentionally omitted rather than faked). */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><Clock /> {t('profile.recent_activity')}</div>
        </div>
        {activity.loading ? (
          <div className={s.activityEmpty}>{t('profile.loading')}</div>
        ) : activity.orders.length === 0 ? (
          <div className={s.activityEmpty}>{t('profile.no_activity')}</div>
        ) : (
          <div className={s.activityList}>
            {activity.orders.map(order => (
              <div key={order._id} className={s.activityItem}>
                <span className={`${s.activityIcon} ${order.status === 'cancelled' || order.status === 'refunded' ? s.cancelled : s.order}`}>
                  {orderIcon(order.status)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={s.activityText}>
                    {t('profile.activity_order_prefix')} <strong>{order.orderNumber}</strong> {t(`order.status.${order.status}`)}
                  </div>
                  <div className={s.activityTime}>{fmtAgo(order.updatedAt || order.createdAt)}</div>
                </div>
                <div className={s.activityPrice}>₪{Number(order.total || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Addresses — real CRUD against User.addresses[] (PATCH /auth/me)
// ═══════════════════════════════════════════════════════════════════════════
const EMPTY_ADDRESS = { label: '', street: '', city: '', zip: '', country: 'Israel', isDefault: false };

function AddressesPanel({ user, refreshProfile, toast }) {
  const t = useTranslation();
  const addresses = user?.addresses ?? [];
  const [editingIdx, setEditingIdx] = useState(null); // null = not editing, -1 = adding new, N = editing index N
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);

  const persist = async (nextAddresses) => {
    setSaving(true);
    try {
      await authService.updateMe({ addresses: nextAddresses });
      await refreshProfile();
      return true;
    } catch (err) {
      toast.error(err.message || t('profile.update_failed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => { setForm(EMPTY_ADDRESS); setEditingIdx(-1); };
  const startEdit = (idx) => { setForm({ ...EMPTY_ADDRESS, ...addresses[idx] }); setEditingIdx(idx); };
  const cancelEdit = () => setEditingIdx(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.street.trim() || !form.city.trim()) {
      toast.error(t('profile.address_required'));
      return;
    }
    // The backend's address schema uses plain Joi.string() for label/zip/
    // country (no .allow('')) — an empty string is rejected as invalid,
    // unlike an omitted key. Trim every field and drop the ones left blank
    // rather than sending empty strings for optional fields.
    const sanitized = Object.fromEntries(
      Object.entries({ ...form, label: form.label.trim(), street: form.street.trim(), city: form.city.trim(), zip: form.zip.trim(), country: form.country.trim() })
        .filter(([key, val]) => key === 'isDefault' || val !== '')
    );

    let next = addresses.map((a, i) => (form.isDefault ? { ...a, isDefault: i === editingIdx } : a));
    if (editingIdx === -1) {
      next = [...next, { ...sanitized, isDefault: form.isDefault || next.length === 0 }];
    } else {
      next = next.map((a, i) => (i === editingIdx ? { ...sanitized } : a));
    }
    const ok = await persist(next);
    if (ok) { toast.success(t('profile.updated')); setEditingIdx(null); }
  };

  const handleDelete = async (idx) => {
    if (!window.confirm(t('profile.address_delete_confirm'))) return;
    const wasDefault = addresses[idx]?.isDefault;
    let next = addresses.filter((_, i) => i !== idx);
    if (wasDefault && next.length > 0) next = next.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
    const ok = await persist(next);
    if (ok) toast.success(t('profile.updated'));
  };

  const handleSetDefault = async (idx) => {
    const next = addresses.map((a, i) => ({ ...a, isDefault: i === idx }));
    const ok = await persist(next);
    if (ok) toast.success(t('profile.updated'));
  };

  return (
    <div className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}><MapPin /> {t('profile.addresses_title')}</div>
      </div>

      {editingIdx !== null ? (
        <form onSubmit={handleSubmit}>
          <div className={s.formGrid}>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="addr-label">{t('profile.address_label')}</label>
              <input id="addr-label" className={s.fieldInput} value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder={t('profile.address_label_ph')} />
            </div>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="addr-country">{t('profile.address_country')}</label>
              <input id="addr-country" className={s.fieldInput} value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
            </div>
            <div className={`${s.formGroup} ${s.formGroupFull}`}>
              <label className={s.fieldLabel} htmlFor="addr-street">{t('profile.address_street')}</label>
              <input id="addr-street" className={s.fieldInput} value={form.street} onChange={(e) => setForm(f => ({ ...f, street: e.target.value }))} required />
            </div>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="addr-city">{t('profile.address_city')}</label>
              <input id="addr-city" className={s.fieldInput} value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} required />
            </div>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="addr-zip">{t('profile.address_zip')}</label>
              <input id="addr-zip" className={s.fieldInput} value={form.zip} onChange={(e) => setForm(f => ({ ...f, zip: e.target.value }))} />
            </div>
            <div className={`${s.formGroup} ${s.formGroupFull}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="addr-default" checked={form.isDefault} onChange={(e) => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
              <label htmlFor="addr-default" className={s.fieldLabel} style={{ margin: 0 }}>{t('profile.address_set_default')}</label>
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            <button type="button" className={s.cancelBtn} onClick={cancelEdit} disabled={saving}>{t('profile.cancel')}</button>
            <button type="submit" className={s.saveBtn} disabled={saving}>{saving ? t('profile.saving') : t('profile.save')}</button>
          </div>
        </form>
      ) : (
        <>
          {addresses.length === 0 ? (
            <div className={s.addressEmpty}>{t('profile.no_addresses')}</div>
          ) : (
            <div className={s.addressList}>
              {addresses.map((addr, idx) => (
                <div key={idx} className={s.addressCard}>
                  <div className={s.addressCardHead}>
                    <span className={s.addressLabel}>
                      {addr.label || t('profile.address_label_ph')}
                      {addr.isDefault && <span className={s.addressDefaultPill}>{t('profile.address_default')}</span>}
                    </span>
                  </div>
                  <div className={s.addressText}>
                    {[addr.street, addr.city, addr.zip, addr.country].filter(Boolean).join(', ')}
                  </div>
                  <div className={s.addressActions}>
                    <button type="button" className={s.addressActionBtn} onClick={() => startEdit(idx)}><Pencil size={12} /> {t('profile.edit')}</button>
                    {!addr.isDefault && (
                      <button type="button" className={s.addressActionBtn} onClick={() => handleSetDefault(idx)}>{t('profile.address_set_default')}</button>
                    )}
                    <button type="button" className={`${s.addressActionBtn} ${s.addressActionBtnDanger}`} onClick={() => handleDelete(idx)}><Trash2 size={12} /> {t('profile.delete')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={s.addAddressBtn} onClick={startAdd} style={{ marginTop: 12 }}>
            <Plus size={14} style={{ verticalAlign: 'middle' }} /> {t('profile.address_add')}
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Payment methods — no real backend capability (mock/one-time PaymentIntents
// only, no saved cards). Matches Sapir's own "coming soon" placeholder 1:1.
// ═══════════════════════════════════════════════════════════════════════════
function PaymentComingSoon() {
  const t = useTranslation();
  return (
    <div className={s.card}>
      <div className={s.comingSoon}>
        <Clock />
        <div className={s.comingSoonTitle}>{t('profile.payment_title')} — {t('profile.coming_soon')}</div>
        <div className={s.comingSoonDesc}>{t('profile.coming_soon_desc')}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Password — real change-password flow; hidden for non-email auth providers
// (Google/Apple/SMS accounts have no password to change).
// ═══════════════════════════════════════════════════════════════════════════
function PasswordPanel({ user, toast }) {
  const t = useTranslation();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const handleChange = (e) => { setErr(''); setForm(f => ({ ...f, [e.target.name]: e.target.value })); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.currentPassword || !form.newPassword || !form.confirm) { setErr(t('profile.password_all_required')); return; }
    if (form.newPassword !== form.confirm) { setErr(t('profile.password_mismatch')); return; }
    if (form.newPassword.length < 8) { setErr(t('profile.password_short')); return; }
    setSaving(true);
    try {
      await authService.changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err2) {
      setErr(err2.message || t('profile.password_failed'));
    } finally {
      setSaving(false);
    }
  };

  const isEmailAuth = (user?.authProvider ?? 'email') === 'email';

  return (
    <div className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}><Lock /> {t('profile.password_title')}</div>
      </div>

      {!isEmailAuth ? (
        <p className={s.fieldHint}>{t('profile.password_oauth_notice').replace('{provider}', t(`auth.provider.${user.authProvider}`))}</p>
      ) : (
        <form onSubmit={handleSave}>
          <div className={s.formGridNarrow}>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="pw-current">{t('profile.current_password')}</label>
              <input id="pw-current" className={s.fieldInput} type="password" name="currentPassword" value={form.currentPassword} onChange={handleChange} autoComplete="current-password" />
            </div>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="pw-new">{t('profile.new_password')}</label>
              <input id="pw-new" className={s.fieldInput} type="password" name="newPassword" value={form.newPassword} onChange={handleChange} autoComplete="new-password" />
            </div>
            <div className={s.formGroup}>
              <label className={s.fieldLabel} htmlFor="pw-confirm">{t('profile.confirm_password')}</label>
              <input id="pw-confirm" className={s.fieldInput} type="password" name="confirm" value={form.confirm} onChange={handleChange} autoComplete="new-password" />
            </div>
          </div>
          {err && <p className={s.fieldError}>{err}</p>}
          {saved && <p className={s.fieldSuccess}>{t('profile.password_changed')}</p>}
          <button type="submit" className={s.saveBtn} disabled={saving}>
            {saving ? t('profile.saving') : t('profile.update_password')}
          </button>
        </form>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Notifications — real membership.notificationPreference
// ═══════════════════════════════════════════════════════════════════════════
function NotificationsPanel({ toast }) {
  const t = useTranslation();
  const { isMember, notificationPreference } = useMembership();
  const [value, setValue] = useState(notificationPreference && notificationPreference !== 'none' ? notificationPreference : 'email');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(notificationPreference && notificationPreference !== 'none' ? notificationPreference : 'email');
  }, [notificationPreference]);

  const OPTIONS = [
    { value: 'email', label: t('profile.pref_email') },
    { value: 'sms',   label: t('profile.pref_sms') },
    { value: 'both',  label: t('profile.pref_both') },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await membershipService.updateNotificationPreference(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err.message || t('profile.update_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}><Bell /> {t('profile.notifications_title')}</div>
      </div>
      {isMember && <div className={s.vipPill}>✔ {t('profile.pref_vip_note')}</div>}
      <div className={s.prefPrompt}>{t('profile.pref_prompt')}</div>
      <div className={s.prefGrid}>
        {OPTIONS.map(opt => (
          <label key={opt.value} className={`${s.prefOption} ${value === opt.value ? s.prefOptionActive : ''}`}>
            <input type="radio" name="notifPref" value={opt.value} checked={value === opt.value} onChange={() => setValue(opt.value)} />
            {opt.label}
          </label>
        ))}
      </div>
      {saved && <p className={s.fieldSuccess}>{t('profile.pref_saved')}</p>}
      <button type="button" className={s.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? t('profile.saving') : t('profile.save_preferences')}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page shell — hero + sidebar + routed main content
// ═══════════════════════════════════════════════════════════════════════════
export default function ProfilePage() {
  const { user, logout, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate  = useNavigate();
  const t = useTranslation();
  const { language } = useLanguage();
  const membership = useMembership();

  const [tab, setTab] = useState('personal');
  const [personalView, setPersonalView] = useState('dashboard'); // dashboard | addresses | payment

  const handleTabClick = (id) => { setTab(id); setPersonalView('dashboard'); };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  const SIDEBAR = [
    { id: 'personal',      icon: '👤', label: t('profile.nav.personal') },
    { id: 'password',      icon: '🔒', label: t('profile.nav.password') },
    { id: 'notifications', icon: '🔔', label: t('profile.nav.notifications') },
  ];

  return (
    <div className={s.page}>
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Breadcrumb
            items={[{ label: t('profile.breadcrumb_home'), href: '/' }, { label: t('profile.breadcrumb_current') }]}
            className={s.breadcrumbNav}
          />
        </div>
      </div>

      <div className={s.acPage}>
        {/* Hero */}
        <div className={s.hero}>
          <div className={s.heroInner}>
            <div className={s.avatar}>{initials(user.name)}</div>
            <div>
              <div className={s.heroName}>{t('profile.hello')}, {splitName(user.name).firstName || user.name} 👋</div>
              <div className={s.heroMeta}>
                <span className={s.heroMetaItem}><Calendar /> {t('profile.customer_since_prefix')} {monthYear(user.createdAt, language) ?? '—'}</span>
                <span className={s.heroMetaItem}><Mail /> {user.email}</span>
                {user.phone && <span className={s.heroMetaItem}><Phone /> {user.phone}</span>}
              </div>
              {membership.isMember && (
                <div className={s.heroBadge}><Crown /> {t('profile.hero_vip_badge')}</div>
              )}
            </div>
          </div>
        </div>

        <div className={s.layout}>
          {/* Sidebar */}
          <nav className={s.sidebar}>
            {SIDEBAR.map(item => (
              <button
                key={item.id}
                type="button"
                className={`${s.navItem}${tab === item.id ? ' ' + s.navItemActive : ''}`}
                onClick={() => handleTabClick(item.id)}
              >
                <span className={s.navItemIcon} aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button type="button" className={`${s.navItem} ${s.navItemDanger}`} onClick={handleLogout}>
              <span className={s.navItemIcon} aria-hidden="true">🚪</span>
              {t('profile.nav.logout')}
            </button>
          </nav>

          {/* Main */}
          <div className={s.main}>
            {tab === 'personal' && personalView === 'dashboard' && (
              <PersonalDashboard
                user={user}
                refreshProfile={refreshProfile}
                toast={toast}
                onOpenAddresses={() => setPersonalView('addresses')}
                onOpenPayment={() => setPersonalView('payment')}
              />
            )}
            {tab === 'personal' && personalView === 'addresses' && (
              <AddressesPanel user={user} refreshProfile={refreshProfile} toast={toast} />
            )}
            {tab === 'personal' && personalView === 'payment' && <PaymentComingSoon />}
            {tab === 'password' && <PasswordPanel user={user} toast={toast} />}
            {tab === 'notifications' && <NotificationsPanel toast={toast} />}
          </div>
        </div>
      </div>
    </div>
  );
}
