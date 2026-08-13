import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

// Real data, same source as Admin's own "פעילות מערכת" (AdminActivityPage.jsx
// → GET /admin/audit-logs) — but scoped to privileged/security-relevant
// action types only (role/account changes, auth/session events), not every
// business action. This is intentionally a DIFFERENT view of the same real
// log, not a duplicate of Admin's general activity page — see the final
// report for why the two need to stay distinct.
const PRIVILEGED_ACTIONS = new Set([
  'user.role_changed', 'user.deactivated', 'user.activated',
  'admin.login', 'auth.login', 'auth.login_failed', 'auth.logout',
  'auth.logout_all', 'auth.session_revoked', 'auth.password_changed',
]);

const ACTION_LABELS = {
  'user.role_changed':    'שינוי תפקיד משתמש',
  'user.deactivated':     'השבתת משתמש',
  'user.activated':       'הפעלת משתמש',
  'admin.login':          'התחברות מנהל',
  'auth.login':           'התחברות',
  'auth.login_failed':    'ניסיון התחברות כושל',
  'auth.logout':          'התנתקות',
  'auth.logout_all':      'התנתקות מכל המכשירים',
  'auth.session_revoked': 'ביטול session',
  'auth.password_changed':'שינוי סיסמה',
};

const SEVERE = new Set(['auth.login_failed', 'user.role_changed', 'user.deactivated', 'auth.session_revoked']);

export default function SuperAdminAuditPage() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // No multi-value `action` filter exists server-side (single exact
      // match only) — fetch a real recent batch and filter client-side to
      // the privileged subset, rather than firing 10 parallel requests.
      const { logs: data } = await adminService.listAuditLogs({ limit: 100 });
      setLogs((data ?? []).filter(l => PRIVILEGED_ACTIONS.has(l.action)));
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת יומן פעילות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">פעילות רגישה</h1>
          <p className="text-muted-foreground text-sm mt-1">
            שינויי הרשאות, ניהול משתמשים ואירועי אבטחה — תת-קבוצה של יומן הפעילות המלא (הזמין ל-Admin תחת "פעילות מערכת")
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLogs}
          className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="רענן"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-4 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-foreground font-medium">אין אירועי אבטחה/הרשאות בטווח האחרון</p>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {logs.map(log => (
            <div key={log._id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className={`w-4 h-4 ${SEVERE.has(log.action) ? 'text-[#ef4444]' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm text-foreground font-medium">{ACTION_LABELS[log.action] ?? log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.actorId?.name ?? log.actorId?.email ?? 'מערכת'}
                    {log.entity ? ` · ${log.entity}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString('he-IL')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
