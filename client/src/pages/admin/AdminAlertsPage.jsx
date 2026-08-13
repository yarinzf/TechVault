import { useState, useEffect, useCallback } from 'react';
import {
  Bell, AlertTriangle, TrendingDown, Package, DollarSign, Search,
  CheckCircle2, X, RefreshCw, Loader2,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

// Real Alert model fields only (server/models/Alert.js via
// GET/PATCH /admin/alerts) — type: low_stock | refund_spike | ranking_drop |
// system; severity: info | warning | critical; isResolved. The previous
// version of this page was a fully hardcoded mock with fabricated
// "order stock" / "analyze data" / "update system" action flows that never
// called any API — replaced here with the same real data + resolve action
// WarehouseAlertsPage.jsx already correctly uses, since both pages read the
// same live Alert list.

const TYPE_META = {
  low_stock:    { label: 'מלאי נמוך',      icon: Package,       color: '#fbbf24' },
  refund_spike: { label: 'עלייה בזיכויים', icon: DollarSign,    color: '#ef4444' },
  ranking_drop: { label: 'ירידה בביצועים', icon: TrendingDown,  color: '#3b82f6' },
  system:       { label: 'מערכת',          icon: Bell,          color: '#8b5cf6' },
};
const SEVERITY_META = {
  critical: { label: 'קריטי', color: '#ef4444', bg: '#ef444415', border: '#ef444440' },
  warning:  { label: 'אזהרה', color: '#fbbf24', bg: '#fbbf2415', border: '#fbbf2440' },
  info:     { label: 'מידע',  color: '#3b82f6', bg: '#3b82f615', border: '#3b82f640' },
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דקות`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שעות`;
  return `לפני ${Math.floor(h / 24)} ימים`;
};

function TypeIcon({ type, size = 18 }) {
  const meta = TYPE_META[type] ?? TYPE_META.system;
  const Icon = meta.icon;
  return <Icon size={size} style={{ color: meta.color }} />;
}

function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity] ?? SEVERITY_META.info;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
      style={{ background: m.bg, borderColor: m.border, color: m.color }}
    >
      {m.label}
    </span>
  );
}

export default function AdminAlertsPage() {
  const [alerts, setAlerts]     = useState([]);
  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [severity, setSeverity] = useState('');
  const [resolved, setResolved] = useState('false');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState(null);
  const [resolving, setResolving] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page: 1, limit: 50 };
      if (severity) params.severity = severity;
      if (resolved !== '') params.isResolved = resolved;
      const { alerts: data, meta: m } = await adminService.listAlerts(params);
      setAlerts(data);
      setMeta(m);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת התראות');
    } finally {
      setLoading(false);
    }
  }, [severity, resolved]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleResolve = async (alert) => {
    setResolving(alert._id);
    try {
      const updated = await adminService.resolveAlert(alert._id);
      setAlerts(prev => prev.map(a => a._id === alert._id ? { ...a, ...updated, isResolved: true } : a));
      setSelected(prev => prev?._id === alert._id ? { ...prev, isResolved: true } : prev);
    } catch (err) {
      setError(err.message || 'שגיאה בסימון ההתראה כטופלה');
    } finally {
      setResolving(null);
    }
  };

  const filtered = alerts.filter(a =>
    !search || a.title?.includes(search) || a.message?.includes(search)
  );

  const openCount = alerts.filter(a => !a.isResolved).length;

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl text-foreground mb-2">התראות עסקיות</h1>
          <p className="text-muted-foreground">
            מלאי, זיכויים וביצועי מוצרים • {openCount} התראות פתוחות
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAlerts}
          className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg hover:bg-secondary/70 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          רענן
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש התראות..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
            />
          </div>
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
          >
            <option value="">כל הרמות</option>
            <option value="critical">קריטי</option>
            <option value="warning">אזהרה</option>
            <option value="info">מידע</option>
          </select>
          <select
            value={resolved}
            onChange={e => setResolved(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
          >
            <option value="false">פתוחות</option>
            <option value="true">טופלו</option>
            <option value="">הכל</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-4 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-400px)]">
            {filtered.map(alert => (
              <article
                key={alert._id}
                onClick={() => setSelected(alert)}
                className={`bg-card border rounded-lg p-3 transition-all cursor-pointer ${
                  selected?._id === alert._id ? 'border-[#2563eb] shadow-sm' : alert.isResolved ? 'border-border opacity-60' : 'border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg border" style={{ borderColor: `${(SEVERITY_META[alert.severity] ?? SEVERITY_META.info).color}40` }}>
                    <TypeIcon type={alert.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm text-foreground font-medium">{alert.title}</h3>
                      <SeverityBadge severity={alert.severity} />
                      {alert.isResolved && (
                        <span className="flex items-center gap-1 text-xs text-[#10b981]">
                          <CheckCircle2 size={12} /> טופל
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                    <span className="text-xs text-muted-foreground mt-1 block">{fmtTime(alert.createdAt)}</span>
                  </div>
                </div>
              </article>
            ))}

            {filtered.length === 0 && (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm text-foreground mb-1">אין התראות</p>
                <p className="text-xs text-muted-foreground">לא נמצאו התראות התואמות לסינון</p>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-6 sticky top-8 h-fit min-h-[300px]">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center">
                <Bell className="w-10 h-10 text-muted-foreground opacity-30 mb-4" />
                <p className="text-foreground mb-1">לא נבחרה התראה</p>
                <p className="text-muted-foreground text-sm">בחר התראה מהרשימה כדי לראות פרטים</p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between mb-6 pb-4 border-b border-border">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-3 rounded-lg border" style={{ borderColor: `${(SEVERITY_META[selected.severity] ?? SEVERITY_META.info).color}40` }}>
                      <TypeIcon type={selected.type} size={22} />
                    </div>
                    <div>
                      <h2 className="text-xl text-foreground mb-2">{selected.title}</h2>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={selected.severity} />
                        <span className="text-xs text-muted-foreground">{fmtTime(selected.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelected(null)} className="p-2 hover:bg-secondary rounded-lg transition-colors" aria-label="סגור">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm text-muted-foreground mb-2">פרטי ההתראה</h3>
                  <p className="text-sm text-foreground leading-relaxed">{selected.message}</p>
                </div>

                {!selected.isResolved ? (
                  <button
                    type="button"
                    onClick={() => handleResolve(selected)}
                    disabled={resolving === selected._id}
                    className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {resolving === selected._id ? 'מסמן...' : 'סמן כטופל'}
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-sm text-[#10b981] py-2">
                    <CheckCircle2 className="w-4 h-4" /> התראה זו טופלה
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
