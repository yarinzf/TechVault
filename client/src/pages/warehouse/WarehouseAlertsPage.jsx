import { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, CheckCircle2, RefreshCw, Package } from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דקות`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שעות`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function AlertCard({ alert, onResolve, resolving }) {
  const isCritical = alert.severity === 'critical';
  const isWarning  = alert.severity === 'warning';

  const colorCls = isCritical
    ? 'bg-red-500/10 border-red-500/20'
    : isWarning
    ? 'bg-yellow-500/10 border-yellow-500/20'
    : 'bg-blue-500/10 border-blue-500/20';

  const iconCls = isCritical ? 'text-red-400'
    : isWarning ? 'text-yellow-400'
    : 'text-blue-400';

  const Icon = isCritical ? AlertTriangle : isWarning ? Bell : Bell;

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border ${colorCls}`}>
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{alert.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.message}</p>
        {alert.isResolved && (
          <p className="text-xs text-green-400 mt-1">נסגרה {formatRelative(alert.resolvedAt)}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(alert.createdAt)}</span>
        {!alert.isResolved && (
          <button
            type="button"
            onClick={() => onResolve(alert._id)}
            disabled={resolving === alert._id}
            className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
          >
            {resolving === alert._id ? 'סוגר...' : 'סגור'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function WarehouseAlertsPage() {
  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [resolving, setResolving] = useState(null);
  const [filter,   setFilter]   = useState('open'); // 'open' | 'all'

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { type: 'low_stock', limit: 50 };
      if (filter === 'open') params.isResolved = 'false';
      const { alerts: data } = await adminService.listAlerts(params);
      setAlerts(data);
    } catch {
      setError('שגיאה בטעינת התראות');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleResolve = async (id) => {
    setResolving(id);
    try {
      await adminService.resolveAlert(id);
      setAlerts(prev => prev.map(a => a._id === id ? { ...a, isResolved: true, resolvedAt: new Date().toISOString() } : a));
    } catch {
      // Silently fail — user can retry
    } finally {
      setResolving(null);
    }
  };

  const critical = alerts.filter(a => a.severity === 'critical' && !a.isResolved);
  const warning  = alerts.filter(a => a.severity === 'warning'  && !a.isResolved);
  const resolved = alerts.filter(a => a.isResolved);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">התראות מחסן</h1>
          <p className="text-muted-foreground text-sm mt-1">התראות מלאי נמוך ואירועי מחסן</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[['open', 'פתוחות'], ['all', 'הכל']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === v
                    ? 'bg-[#2563eb] text-white'
                    : 'bg-card text-muted-foreground hover:bg-secondary'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={fetchAlerts}
            className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
            title="רענן"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">טוען התראות...</div>
      )}

      {!loading && error && (
        <div className="text-center py-16 text-red-400 text-sm">
          {error}
          <button type="button" onClick={fetchAlerts} className="block mx-auto mt-3 text-xs underline">נסה שוב</button>
        </div>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className="flex flex-col items-center py-20 gap-3">
          <CheckCircle2 className="w-10 h-10 text-green-400 opacity-60" />
          <p className="text-muted-foreground text-sm">אין התראות {filter === 'open' ? 'פתוחות' : ''} כרגע</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {critical.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-red-400">קריטי — {critical.length}</span>
              </div>
              <div className="space-y-3">
                {critical.map(a => <AlertCard key={a._id} alert={a} onResolve={handleResolve} resolving={resolving} />)}
              </div>
            </div>
          )}

          {warning.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-400">אזהרה — {warning.length}</span>
              </div>
              <div className="space-y-3">
                {warning.map(a => <AlertCard key={a._id} alert={a} onResolve={handleResolve} resolving={resolving} />)}
              </div>
            </div>
          )}

          {filter === 'all' && resolved.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-muted-foreground">נסגרו — {resolved.length}</span>
              </div>
              <div className="space-y-3 opacity-60">
                {resolved.map(a => <AlertCard key={a._id} alert={a} onResolve={handleResolve} resolving={resolving} />)}
              </div>
            </div>
          )}

          {filter === 'open' && critical.length === 0 && warning.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Package className="w-10 h-10 text-muted-foreground opacity-40" />
              <p className="text-muted-foreground text-sm">אין התראות פתוחות</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
