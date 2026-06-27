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
  Info,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import { useTranslation } from '../../context/LanguageContext';

const BADGE = {
  healthy:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2,  label: 'תקין' },
  connected:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2,  label: 'מחובר' },
  info:         { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-400',    icon: Info,          label: 'מידע' },
  warning:      { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   icon: AlertTriangle, label: 'אזהרה' },
  critical:     { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     icon: XCircle,       label: 'תקלה' },
  unhealthy:    { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     icon: XCircle,       label: 'תקלה' },
  disconnected: { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     icon: XCircle,       label: 'מנותק' },
  unavailable:  { bg: 'bg-zinc-500/10',    border: 'border-zinc-500/30',    text: 'text-zinc-400',    icon: Info,          label: 'לא זמין' },
};

function StatusBadge({ status }) {
  const s = BADGE[status] || BADGE.info;
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

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function LogLine({ line }) {
  if (!line) return null;
  return (
    <div className="mt-2 pt-2 border-t border-white/[0.06]">
      <p className="text-[10px] text-muted-foreground font-mono leading-relaxed truncate" title={line}>{line}</p>
    </div>
  );
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} ימים, ${h} שעות`;
  if (h > 0) return `${h} שעות, ${m} דקות`;
  return `${m} דקות`;
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtAge(hours) {
  if (hours == null) return '—';
  if (hours < 1) return 'פחות משעה';
  if (hours < 24) return `${hours} שעות`;
  const d = Math.floor(hours / 24);
  return `${d} ימים, ${hours % 24} שעות`;
}

function fmtMinutes(min) {
  if (min == null) return '—';
  if (min < 1) return 'פחות מדקה';
  if (min < 60) return `${min} דקות`;
  const h = Math.floor(min / 60);
  return `${h} שעות, ${min % 60} דקות`;
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
      setData(await adminService.getSystemStatus());
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת סטטוס מערכת');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  if (loading && !data) return (
    <div className="p-8 flex items-center justify-center h-64">
      <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );

  if (error && !data) return (
    <div className="p-8">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={load} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">נסה שוב</button>
      </div>
    </div>
  );

  const bk = data?.backups?.local;
  const s3 = data?.backups?.s3;
  const hc = data?.healthCheck;
  const mem = data?.memory;
  const sys = data?.system;
  const overallOk = data?.status === 'healthy';

  return (
    <div className="p-8 space-y-6" dir="rtl">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('admin.qa.system_status')}</h1>
          <p className="text-xs text-muted-foreground mt-1">ניטור שרת, בסיס נתונים וגיבויים</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && <span className="text-xs text-muted-foreground">עודכן: {lastRefresh.toLocaleTimeString('he-IL')}</span>}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-foreground transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            רענון
          </button>
        </div>
      </div>

      {/* ── Overall banner ────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${
        overallOk ? 'bg-emerald-500/5 border-emerald-500/20'
          : data?.status === 'warning' ? 'bg-amber-500/5 border-amber-500/20'
          : 'bg-red-500/5 border-red-500/20'
      }`}>
        <div className="flex items-center gap-3">
          <StatusBadge status={data?.status} />
          <span className="text-sm text-foreground">
            {overallOk ? 'כל המערכות פעילות ותקינות'
              : data?.status === 'warning' ? 'יש פריטים הדורשים תשומת לב'
              : 'בעיה קריטית זוהתה — נדרשת בדיקה'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">v{data?.version}</span>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Backend */}
        <Card icon={Server} title="Backend" accent="#2563eb">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={data?.status === 'critical' ? 'critical' : 'healthy'} />
            </div>
            <Row label="Uptime" value={fmtUptime(data?.uptime)} />
            <Row label="Node.js" value={data?.node} mono />
            <Row label="סביבה" value={data?.environment} />
          </div>
        </Card>

        {/* MongoDB */}
        <Card icon={Database} title="MongoDB" accent="#10b981">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">חיבור</span>
              <StatusBadge status={data?.mongodb?.status} />
            </div>
            <Row label="readyState" value={data?.mongodb?.readyState} mono />
          </div>
        </Card>

        {/* Memory */}
        <Card icon={Cpu} title="זיכרון" accent="#7c3aed">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={mem?.status} />
            </div>
            <Row label="RSS" value={mem?.rss} mono />
            <Row label="Heap" value={`${mem?.heapUsed} / ${mem?.heapTotal}`} mono />
            <Row label="Heap %" value={mem?.heapUsedPct} mono />
            <Row label="RAM מערכת" value={sys?.ramUsedPct} mono />
            <Row label="RAM פנוי" value={sys?.ramFree} mono />
          </div>
        </Card>

        {/* System */}
        <Card icon={HardDrive} title="שרת" accent="#f97316">
          <div className="space-y-0.5">
            <Row label="פלטפורמה" value={sys?.platform} />
            <Row label="מעבדים" value={sys?.cpus} />
            <Row label="RAM כולל" value={sys?.ramTotal} mono />
            {sys?.disk && (
              <>
                <Row label="דיסק" value={sys.disk.usedPct} mono />
                <Row label="דיסק פנוי" value={sys.disk.available} mono />
              </>
            )}
          </div>
        </Card>

        {/* Local Backups */}
        <Card icon={Shield} title="גיבויים מקומיים" accent="#14b8a6">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={bk?.status} />
            </div>
            {bk?.available ? (
              <>
                <Row label="קובץ אחרון" value={bk.latest.filename} mono />
                <Row label="גודל" value={bk.latest.size} mono />
                <Row label="תאריך" value={fmtDate(bk.latest.date)} />
                <Row label="גיל" value={fmtAge(bk.latest.ageHours)} />
                <Row label="סה״כ גיבויים" value={bk.totalBackups} />
              </>
            ) : (
              <p className="text-xs text-zinc-400 py-1.5">
                {bk?.status === 'warning' ? 'לא נמצאו קבצי גיבוי' : 'תיקיית גיבויים לא זמינה'}
              </p>
            )}
            <LogLine line={data?.backups?.lastLogEntry} />
          </div>
        </Card>

        {/* S3 */}
        <Card icon={s3?.configured ? Cloud : CloudOff} title="גיבוי S3" accent="#6366f1">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={s3?.status} />
            </div>
            {s3?.configured ? (
              <>
                <Row label="Bucket" value={s3.bucket} mono />
                {s3.lastUploadTime && <Row label="העלאה אחרונה" value={s3.lastUploadTime} mono />}
                {!s3.lastUploadLog && (
                  <p className="text-xs text-amber-400 py-1.5">לא נמצאה העלאה מוצלחת בלוג</p>
                )}
                <LogLine line={s3.lastUploadLog} />
              </>
            ) : (
              <p className="text-xs text-zinc-400 py-1.5">S3_BACKUP_BUCKET לא מוגדר</p>
            )}
          </div>
        </Card>

        {/* Health Check */}
        <Card icon={Activity} title="בדיקת בריאות" accent="#ec4899">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">סטטוס</span>
              <StatusBadge status={hc?.status} />
            </div>
            {hc?.lastResult ? (
              <>
                {hc.lastRunTime && <Row label="הרצה אחרונה" value={hc.lastRunTime} mono />}
                {hc.ageMinutes != null && <Row label="לפני" value={fmtMinutes(hc.ageMinutes)} />}
                <LogLine line={hc.lastResult} />
              </>
            ) : (
              <p className="text-xs text-zinc-400 py-1.5">לוג בדיקה לא זמין</p>
            )}
          </div>
        </Card>

        {/* Timestamp */}
        <Card icon={Clock} title="זמן שרת" accent="#8b5cf6">
          <div className="space-y-0.5">
            <Row label="תאריך ושעה" value={fmtDate(data?.timestamp)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
