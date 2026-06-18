import { useEffect, useState } from 'react';
import { TrendingDown, Package, Heart, Star, AlertTriangle, TrendingUp } from 'lucide-react';
import { adminService } from '../api/admin.service';
import { useTranslation } from '../../../context/LanguageContext';

const SEVERITY_COLOR = {
  critical: '#ef4444',
  warning:  '#fbbf24',
  info:     '#6366f1',
};

const INSIGHT_ICONS = {
  low_stock_risk:    Package,
  sales_drop:        TrendingDown,
  cancellation_spike: AlertTriangle,
};

function InsightAlert({ alert, t }) {
  const Icon  = INSIGHT_ICONS[alert.type] ?? AlertTriangle;
  const color = SEVERITY_COLOR[alert.severity] ?? SEVERITY_COLOR.info;
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-border transition-all">
      <div className="p-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-foreground text-xs font-medium">{alert.message}</p>
        <p className="text-muted-foreground/70 text-xs mt-0.5">{alert.count} {t('admin.sip.items')}</p>
      </div>
      <span
        className="text-xs px-2 py-0.5 rounded-full border flex-shrink-0"
        style={{ color, backgroundColor: `${color}15`, borderColor: `${color}30` }}
      >
        {alert.severity === 'critical' ? t('notif.severity.critical') : t('notif.severity.warning')}
      </span>
    </div>
  );
}

function ListRow({ icon: Icon, color, label, value }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border/40 last:border-0">
      <div className="p-1 rounded flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-3 h-3" style={{ color }} />
      </div>
      <span className="text-xs text-foreground flex-1 truncate">{label}</span>
      <span className="text-xs font-semibold text-foreground/80 flex-shrink-0">{value}</span>
    </div>
  );
}

export function SmartInsightsPanel() {
  const t = useTranslation();
  const [insights, setInsights] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    adminService.getInsights()
      .then(setInsights)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5" dir="rtl">
        <p className="text-muted-foreground text-xs text-center py-6">{t('admin.sip.loading')}</p>
      </div>
    );
  }

  const alerts       = insights?.alerts          ?? [];
  const wishlisted   = insights?.mostWishlisted  ?? [];
  const rated        = insights?.highestRated    ?? [];
  const revOpps      = insights?.revenueOpportunities ?? [];

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 bg-[#6366f1]/10 rounded-lg">
          <TrendingUp className="w-4 h-4 text-[#6366f1]" />
        </div>
        <h3 className="text-base text-foreground">{t('admin.sip.heading')}</h3>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('admin.sip.alerts')}</p>
          {alerts.map((a, i) => <InsightAlert key={i} alert={a} t={t} />)}
        </div>
      )}

      {wishlisted.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t('admin.sip.most_wishlisted')}
          </p>
          {wishlisted.slice(0, 5).map(p => (
            <ListRow
              key={p.productId}
              icon={Heart}
              color="#f43f5e"
              label={p.name}
              value={`${p.wishlistCount} ♥`}
            />
          ))}
        </div>
      )}

      {revOpps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t('admin.sip.revenue_opps')}
          </p>
          {revOpps.slice(0, 4).map(p => (
            <ListRow
              key={p.productId}
              icon={TrendingUp}
              color="#fbbf24"
              label={p.name}
              value={`${t('admin.sip.stock')} ${p.stock}`}
            />
          ))}
        </div>
      )}

      {rated.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t('admin.sip.top_rated')}
          </p>
          {rated.slice(0, 4).map(p => (
            <ListRow
              key={p._id}
              icon={Star}
              color="#fbbf24"
              label={p.name}
              value={`${p.ratings?.average?.toFixed(1) ?? '—'} ★`}
            />
          ))}
        </div>
      )}

      {!alerts.length && !wishlisted.length && !rated.length && !revOpps.length && (
        <p className="text-muted-foreground text-xs text-center py-4">{t('admin.sip.empty')}</p>
      )}
    </div>
  );
}

export default SmartInsightsPanel;
