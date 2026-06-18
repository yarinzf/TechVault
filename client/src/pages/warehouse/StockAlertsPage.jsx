import { AlertTriangle, TrendingDown, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { productService } from '../../features/products/api/product.service';
import { useTranslation } from '../../context/LanguageContext';

function getSeverity(stock, minStock) {
  if (stock === 0) return 'critical';
  if (stock / minStock < 0.4) return 'high';
  return 'medium';
}

export default function StockAlertsPage() {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const t = useTranslation();

  const severityConfig = {
    critical: { label: t('warehouse.stock.critical'), bar: 'bg-red-500',    text: 'text-red-400',    border: 'border-red-500/30 bg-red-500/5' },
    high:     { label: t('warehouse.stock.high'),     bar: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/30 bg-orange-500/5' },
    medium:   { label: t('warehouse.stock.medium'),   bar: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/30 bg-yellow-500/5' },
  };

  useEffect(() => {
    productService.list({ limit: 100 })
      .then(({ products }) => {
        const lowStock = products
          .filter((p) => p.stock <= (p.minStock ?? 5))
          .map((p) => {
            const min = p.minStock ?? 5;
            return { ...p, _minStock: min, severity: getSeverity(p.stock, min) };
          });
        setAlerts(lowStock);
      })
      .catch((err) => setError(err?.message ?? t('warehouse.stock.load_error')))
      .finally(() => setLoading(false));
  }, []);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const highCount     = alerts.filter((a) => a.severity === 'high').length;
  const mediumCount   = alerts.filter((a) => a.severity === 'medium').length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('warehouse.stock.alerts_title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('warehouse.stock.alerts_sub')}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('warehouse.stock.critical_zero'), count: criticalCount, style: 'text-red-400' },
          { label: t('warehouse.stock.high_level'),    count: highCount,     style: 'text-orange-400' },
          { label: t('warehouse.stock.medium_level'),  count: mediumCount,   style: 'text-yellow-400' },
        ].map(({ label, count, style }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${style}`}>{loading ? '—' : count}</p>
          </div>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('warehouse.stock.loading')}</div>
      )}

      {!loading && error && (
        <div className="text-center py-12 text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('warehouse.stock.no_alerts')}</div>
      )}

      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((item) => {
            const { label, bar, text, border } = severityConfig[item.severity];
            const pct = item.stock === 0 ? 0 : Math.round((item.stock / item._minStock) * 100);
            return (
              <div key={item._id} className={`rounded-xl border p-4 ${border}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className={`w-4 h-4 ${text}`} />
                    <span className="font-medium text-foreground text-sm">{item.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">({item.sku ?? '—'})</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${text} bg-current/10`}>{label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className={`text-sm font-bold ${text}`}>{item.stock} / {item._minStock}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('warehouse.stock.in_stock_min')}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
