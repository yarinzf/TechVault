import { useState, useEffect } from 'react';
import { Search, Users, ShieldCheck, Warehouse, UserCheck, UserX } from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import { useAuth } from '../../hooks/useAuth';

const ROLE_CONFIG = {
  user:       { label: 'לקוח',       badge: 'bg-[#2563eb]/10 text-[#2563eb]' },
  admin:      { label: 'מנהל',       badge: 'bg-[#7c3aed]/10 text-[#7c3aed]' },
  superadmin: { label: 'מנהל ראשי', badge: 'bg-[#ef4444]/10 text-[#ef4444]' },
  warehouse:  { label: 'מחסן',       badge: 'bg-[#10b981]/10 text-[#10b981]' },
};

const ALL_ROLES = ['user', 'admin', 'superadmin', 'warehouse'];

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AdminUsersPage() {
  const { user: authUser } = useAuth();

  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [successId, setSuccessId] = useState(null);

  useEffect(() => {
    adminService.listUsers({ limit: 100 })
      .then(({ users: data }) => setUsers(data))
      .catch((err) => setError(err?.message ?? 'שגיאה בטעינת משתמשים'))
      .finally(() => setLoading(false));
  }, []);

  const markSuccess = (id) => {
    setSuccessId(id);
    setTimeout(() => setSuccessId((prev) => (prev === id ? null : prev)), 2000);
  };

  const handleRoleChange = async (userId, newRole) => {
    setPendingId(userId);
    setRowErrors((prev) => ({ ...prev, [userId]: null }));
    try {
      const updated = await adminService.updateUser(userId, { role: newRole });
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, role: updated.role } : u)));
      markSuccess(userId);
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [userId]: err?.message ?? 'שגיאת עדכון תפקיד' }));
    } finally {
      setPendingId(null);
    }
  };

  const handleToggleActive = async (userId, currentActive) => {
    setPendingId(userId);
    setRowErrors((prev) => ({ ...prev, [userId]: null }));
    try {
      const updated = await adminService.updateUser(userId, { isActive: !currentActive });
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, isActive: updated.isActive } : u))
      );
      markSuccess(userId);
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [userId]: err?.message ?? 'שגיאת עדכון סטטוס' }));
    } finally {
      setPendingId(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  // Stats derived from loaded data
  const counts = ALL_ROLES.reduce((acc, r) => {
    acc[r] = users.filter((u) => u.role === r).length;
    return acc;
  }, {});

  if (!loading && error?.includes('403') || (!loading && !error && users.length === 0 && error)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64" dir="rtl">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">גישה מוגבלת</p>
          <p className="text-muted-foreground text-sm mt-1">ניהול משתמשים זמין למנהלים ראשיים בלבד</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ניהול משתמשים</h1>
        <p className="text-muted-foreground text-sm mt-1">ניהול תפקידים וגישות למשתמשי המערכת</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'מנהלים ראשיים', count: counts.superadmin, icon: ShieldCheck, color: '#ef4444' },
          { label: 'מנהלים',        count: counts.admin,      icon: Users,       color: '#7c3aed' },
          { label: 'מחסנאים',       count: counts.warehouse,  icon: Warehouse,   color: '#10b981' },
          { label: 'לקוחות',        count: counts.user,       icon: UserCheck,   color: '#2563eb' },
        ].map(({ label, count, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{label}</p>
              <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}15` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {loading ? '—' : count}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 right-3 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="חיפוש לפי שם או אימייל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pr-9 pl-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
        />
      </div>

      {/* States */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">טוען משתמשים...</div>
      )}

      {!loading && error && (
        <div className="text-center py-12 space-y-2">
          <UserX className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-red-400 text-sm">{error}</p>
          {error.toLowerCase().includes('403') || error.toLowerCase().includes('permission') ? (
            <p className="text-muted-foreground text-xs">נדרשת גישת מנהל ראשי</p>
          ) : null}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {['משתמש', 'תפקיד', 'סטטוס', 'הצטרפות', 'פעולות'].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">לא נמצאו משתמשים</td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isSelf    = authUser?._id === u._id || authUser?.id === u._id;
                  const isPending = pendingId === u._id;
                  const roleConf  = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.user;

                  return (
                    <tr key={u._id} className="hover:bg-muted/20 transition-colors">

                      {/* User cell */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{
                              backgroundColor: `${
                                u.role === 'superadmin' ? '#ef4444'
                                : u.role === 'admin'   ? '#7c3aed'
                                : u.role === 'warehouse' ? '#10b981'
                                : '#2563eb'
                              }20`,
                              color:
                                u.role === 'superadmin' ? '#ef4444'
                                : u.role === 'admin'   ? '#7c3aed'
                                : u.role === 'warehouse' ? '#10b981'
                                : '#2563eb',
                            }}
                          >
                            {getInitials(u.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          {isSelf && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md flex-shrink-0">אתה</span>
                          )}
                        </div>
                      </td>

                      {/* Role dropdown */}
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isSelf || isPending}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed ${roleConf.badge}`}
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r} className="bg-card text-foreground">
                              {ROLE_CONFIG[r]?.label ?? r}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {successId === u._id ? (
                          <span className="text-xs text-green-400">✓ עודכן</span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.isActive
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {u.isActive ? 'פעיל' : 'מושבת'}
                          </span>
                        )}
                      </td>

                      {/* Join date */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {u.createdAt ? formatDate(u.createdAt) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <button
                            type="button"
                            disabled={isSelf || isPending}
                            onClick={() => handleToggleActive(u._id, u.isActive)}
                            className={`text-xs px-3 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              u.isActive
                                ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                                : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                            }`}
                          >
                            {isPending ? '...' : u.isActive ? 'השבת' : 'הפעל'}
                          </button>
                          {rowErrors[u._id] && (
                            <p className="text-xs text-red-400 max-w-[140px]">{rowErrors[u._id]}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
