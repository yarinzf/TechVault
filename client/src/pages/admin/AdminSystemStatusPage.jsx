import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Database,
  HardDrive,
  Server,
  Clock,
  Shield,
  CloudOff,
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import { useTranslation } from '../../context/LanguageContext';

function StatusBadge({ status }) {
  const map = {
    healthy:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'תקין' },
    connected:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'מחובר' },
    warning:    { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   icon: AlertTriangle, label: 'אזהרה' },
    degraded:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   icon: AlertTriangle, label: 'מופחת' },
    unhealthy:  { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     icon: XCircle,       label: 'תקלה' },
    disconnected: { bg: 'bg-red-500/10',   border: 'border-red-500/30',     text: 'text-red-400',     icon: XCircle,       label: 'מנותק' },
  };
  const s = map[status] || map.warning;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.border} ${s.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {s.label}
    </span>
  );
}

function Card({ icon: Icon, title, children, accent = '#2563eb' }) {
  return (
    <div className="bg-card rounded-xl border border-white/[0.06] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${accent}15` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} ימים, ${h} שעות`;
  if (h > 0) return `${h} שעות, ${m} דקות`;
  return `${m} דקות`;
}

export default function AdminSystemStatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const t = useTranslation();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await adminService.getSystemStatus();
      setData(result);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load system status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={load} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  const backupHealthy = data?.backups?.local?.latest?.healthy;
  const backupStatus = !data?.backups?.local?.available ? 'unhealthy' : backupHealthy ? 'healthy' : 'warning';

  return (
    <div className="p-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('admin.qa.system_status')}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            ניטור שרת, בסיס נתונים וגיבויים
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              עודכן: {lastRefresh.toLocaleTimeString('he-IL')}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            רענון
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${
        data?.status === 'healthy'
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-red-500/5 border-red-500/20'
      }`}>
        <div className="flex items-center gap-3">
          <StatusBadge status={data?.status} />
          <span className="text-sm text-foreground">
            {data?.status === 'healthy' ? 'כל המערכות פעילות ותקינות' : 'בעיה זוהתה — נדרשת בדיקה'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">v{data?.version}</span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Backend */}
        <Card icon={Server} title="Backend" accent="#2563eb">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={data?.status} />
            </div>
            <InfoRow label="Uptime" value={formatUptime(data?.uptime)} />
            <InfoRow label="Node.js" value={data?.node} mono />
            <InfoRow label="סביבה" value={data?.environment} />
          </div>
        </Card>

        {/* MongoDB */}
        <Card icon={Database} title="MongoDB" accent="#10b981">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">חיבור</span>
              <StatusBadge status={data?.mongodb?.status} />
            </div>
            <InfoRow label="readyState" value={data?.mongodb?.readyState} mono />
          </div>
        </Card>

        {/* Memory */}
        <Card icon={Cpu} title="זיכרון Node.js" accent="#7c3aed">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Heap</span>
              <StatusBadge status={data?.memory?.warning ? 'warning' : 'healthy'} />
            </div>
            <InfoRow label="RSS" value={data?.memory?.rss} mono />
            <InfoRow label="Heap Used" value={data?.memory?.heapUsed} mono />
            <InfoRow label="Heap Total" value={data?.memory?.heapTotal} mono />
            <InfoRow label="שימוש" value={data?.memory?.heapUsedPct} mono />
          </div>
        </Card>

        {/* System */}
        <Card icon={HardDrive} title="שרת" accent="#f97316">
          <div className="space-y-0.5">
            <InfoRow label="RAM" value={data?.system?.ramUsedPct} mono />
            <InfoRow label="RAM פנוי" value={data?.system?.ramFree} mono />
            <InfoRow label="מעבדים" value={data?.system?.cpus} />
            {data?.system?.disk && (
              <>
                <InfoRow label="דיסק" value={data.system.disk.usedPct} mono />
                <InfoRow label="דיסק פנוי" value={data.system.disk.available} mono />
              </>
            )}
          </div>
        </Card>

        {/* Local Backups */}
        <Card icon={Shield} title="גיבויים" accent="#14b8a6">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={backupStatus} />
            </div>
            {data?.backups?.local?.available ? (
              <>
                <InfoRow label="גיבוי אחרון" value={data.backups.local.latest.filename} mono />
                <InfoRow label="גודל" value={data.backups.local.latest.size} mono />
                <InfoRow label="גיל" value={`${data.backups.local.latest.ageHours} שעות`} />
                <InfoRow label="סה״כ גיבויים" value={data.backups.local.totalBackups} />
              </>
            ) : (
              <p className="text-xs text-red-400 py-1.5">לא נמצאו גיבויים</p>
            )}
            {data?.backups?.lastLogEntry && (
              <div className="mt-2 pt-2 border-t border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground font-mono leading-relaxed truncate" title={data.backups.lastLogEntry}>
                  {data.backups.lastLogEntry}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* S3 */}
        <Card icon={data?.backups?.s3?.configured ? Cloud : CloudOff} title="גיבוי S3" accent="#6366f1">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={
                !data?.backups?.s3?.configured ? 'warning'
                  : data.backups.s3.reachable ? 'healthy'
                  : 'unhealthy'
              } />
            </div>
            {data?.backups?.s3?.configured ? (
              <>
                <InfoRow label="Bucket" value={data.backups.s3.bucket} mono />
                <InfoRow label="נגיש" value={data.backups.s3.reachable ? 'כן' : 'לא'} />
                {data.backups.s3.lastUpload && (
                  <InfoRow label="העלאה אחרונה" value={data.backups.s3.lastUpload} mono />
                )}
              </>
            ) : (
              <p className="text-xs text-amber-400 py-1.5">S3_BACKUP_BUCKET לא מוגדר</p>
            )}
          </div>
        </Card>

        {/* Health Check */}
        <Card icon={Activity} title="בדיקת בריאות" accent="#ec4899">
          <div className="space-y-0.5">
            {data?.healthCheck?.lastResult ? (
              <div className="mt-1">
                <p className="text-[10px] text-muted-foreground font-mono leading-relaxed" title={data.healthCheck.lastResult}>
                  {data.healthCheck.lastResult}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-1.5">אין נתוני בדיקה זמינים</p>
            )}
          </div>
        </Card>

        {/* Timestamp */}
        <Card icon={Clock} title="זמן שרת" accent="#8b5cf6">
          <div className="space-y-0.5">
            <InfoRow
              label="תאריך ושעה"
              value={data?.timestamp ? new Date(data.timestamp).toLocaleString('he-IL') : '—'}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
