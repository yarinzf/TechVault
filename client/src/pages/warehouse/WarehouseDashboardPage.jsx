import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Package, ShoppingCart, TrendingDown } from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import { useTranslation } from '../../context/LanguageContext';

export default function WarehouseDashboardPage() {
  const [stats, setStats]           = useState(null);
  const [pendingOrders, setPending]  = useState(null);
  const [loading, setLoading]        = useState(true);
  const [error, setError]            = useState('');
  const t = useTranslation();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [health, confirmed] = await Promise.all([
          adminService.getInventoryHealth(),
          adminService.listAllOrders({ status: 'confirmed', limit: 1 }),
        ]);
        setStats(health);
        setPending(confirmed.meta?.total ?? 0);
      } catch (err) {
        setError(err.message || t('warehouse.dashboard.load_error'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const lowStock = (stats?.outOfStockCount ?? 0) + (stats?.lowStockCount ?? 0);

  const statCards = [
    {
      label: t('warehouse.dashboard.pending_orders'),
      value: pendingOrders ?? '—',
      color: '#2563eb',
      icon:  <ShoppingCart className="w-5 h-5" />,
    },
    {
      label: t('warehouse.dashboard.low_stock'),
      value: loading ? '—' : lowStock,
      color: '#ef4444',
      icon:  <AlertCircle className="w-5 h-5" />,
    },
    {
      label: t('warehouse.dashboard.total_products'),
      value: stats?.totalProducts ?? '—',
      color: '#10b981',
      icon:  <Package className="w-5 h-5" />,
    },
  ];

  return (
    <div className="p-6" dir="rtl">
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('warehouse.dashboard.title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t('warehouse.dashboard.subtitle')}</p>

      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {statCards.map(({ label, value, color, icon }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">{label}</p>
              <span style={{ color }}>{icon}</span>
            </div>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin mt-1" style={{ color }} />
            ) : (
              <p className="text-3xl font-bold mt-2" style={{ color }}>{value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-foreground font-semibold mb-4 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-[#ef4444]" />
          {t('warehouse.dashboard.attention')}
        </h2>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
          </div>
        )}

        {!loading && !error && (stats?.outOfStockProducts?.length > 0 || stats?.lowStockProducts?.length > 0) ? (
          <div className="space-y-2">
            {[...(stats.outOfStockProducts ?? []), ...(stats.lowStockProducts ?? [])].slice(0, 10).map(p => (
              <div
                key={p._id}
                className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
              >
                <div>
                  <p className="text-foreground text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>
                </div>
                <span className={`text-sm font-medium ${p.stock === 0 ? 'text-[#ef4444]' : 'text-[#f97316]'}`}>
                  {p.stock === 0
                    ? t('warehouse.dashboard.out_of_stock')
                    : `${p.stock} ${t('warehouse.dashboard.units_left')}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          !loading && !error && (
            <p className="text-sm text-muted-foreground">{t('warehouse.dashboard.all_good')}</p>
          )
        )}
      </div>
    </div>
  );
}
