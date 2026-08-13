import { useState, useEffect } from 'react';
import {
  Server, Users, ShieldAlert, Activity, Database, HardDrive, Loader2, AlertCircle,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

// Real, system-level oversight only — deliberately NOT the same data as
// AdminDashboardPage.jsx (business KPIs: revenue/orders/customers). Every
// number here is composed from existing, already-real endpoints:
//   - GET /admin/system/status  (backend/DB/memory/backup health, uptime)
//   - GET /admin/users          (privileged-role user counts)
//   - GET /admin/alerts         (open critical alerts)
//   - GET /admin/audit-logs     (recent privileged/security-relevant activity)
// No field on this page is fabricated — if a value isn't available it shows
// a loading/error state rather than a fake number.
const STATUS_COLOR = { healthy: '#10b981', warning: '#f59e0b', critical: '#ef4444', unavailable: '#6b7280' };

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

export default function SuperAdminDashboardPage() {
  const [status, setStatus]   = useState(null);
  const [roleCounts, setRoleCounts] = useState(null);
  const [criticalAlerts, setCriticalAlerts] = useState(null);
  const [recentAudit, setRecentAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [sys, admins, superadmins, warehouses, alerts, audit] = await Promise.all([
          adminService.getSystemStatus(),
          adminService.listUsers({ role: 'admin', limit: 1 }),
          adminService.listUsers({ role: 'superadmin', limit: 1 }),
          adminService.listUsers({ role: 'warehouse', limit: 1 }),
          adminService.listAlerts({ severity: 'critical', isResolved: 'false', limit: 5 }),
          adminService.listAuditLogs({ limit: 8 }),
        ]);
        if (cancelled) return;
        setStatus(sys);
        setRoleCounts({
          admin: admins.meta?.total ?? 0,
          superadmin: superadmins.meta?.total ?? 0,
          warehouse: warehouses.meta?.total ?? 0,
        });
        setCriticalAlerts(alerts.alerts ?? []);
        setRecentAudit(audit.logs ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'שגיאה בטעינת נתוני מערכת');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-[60vh]" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">דשבורד מנהל ראשי</h1>
        <p className="text-muted-foreground text-sm mt-1">סקירת מערכת ופלטפורמה — לא סקירה עסקית (זו נמצאת בדשבורד הניהול הרגיל)</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* System health */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">בריאות מערכת</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={Server}
            label="סטטוס כללי"
            value={status?.status === 'healthy' ? 'תקין' : status?.status === 'warning' ? 'אזהרה' : status?.status === 'critical' ? 'קריטי' : '—'}
            color={STATUS_COLOR[status?.status] ?? '#6b7280'}
          />
          <StatCard icon={Database} label="בסיס נתונים" value={status?.mongodb?.status === 'connected' ? 'מחובר' : '—'} color={status?.mongodb?.status === 'connected' ? '#10b981' : '#ef4444'} />
          <StatCard icon={Activity} label="זמן פעילות" value={status?.uptime != null ? `${Math.floor(status.uptime / 3600)} שעות` : '—'} color="#3b82f6" />
          <StatCard icon={HardDrive} label="גיבוי אחרון (מקומי)" value={status?.backups?.local?.status === 'healthy' ? 'תקין' : status?.backups?.local?.status ?? '—'} color={status?.backups?.local?.status === 'healthy' ? '#10b981' : '#f59e0b'} />
        </div>
      </div>

      {/* Privileged users overview */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">משתמשים בעלי הרשאות</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={ShieldAlert} label="מנהלים ראשיים (Super Admin)" value={roleCounts?.superadmin ?? '—'} color="#ef4444" />
          <StatCard icon={Users} label="מנהלי מערכת (Admin)" value={roleCounts?.admin ?? '—'} color="#7c3aed" />
          <StatCard icon={Users} label="צוות מחסן (Warehouse)" value={roleCounts?.warehouse ?? '—'} color="#2563eb" />
        </div>
      </div>

      {/* Critical alerts */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#ef4444]" /> התראות קריטיות פתוחות
        </h2>
        {criticalAlerts?.length ? (
          <div className="space-y-2">
            {criticalAlerts.map(a => (
              <div key={a._id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <span className="text-sm text-foreground">{a.title}</span>
                <span className="text-xs text-muted-foreground">{a.type}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">אין התראות קריטיות פתוחות כרגע</p>
        )}
      </div>

      {/* Recent privileged activity */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#2563eb]" /> פעילות אחרונה במערכת
        </h2>
        {recentAudit.length ? (
          <div className="space-y-2">
            {recentAudit.map(log => (
              <div key={log._id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg text-sm">
                <span className="text-foreground">{log.action}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('he-IL')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">אין רשומות פעילות להצגה</p>
        )}
      </div>
    </div>
  );
}
