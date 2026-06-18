import { AlertTriangle, TrendingDown, Package, RefreshCcw, Bell } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

function getIcon(type) {
    switch (type) {
        case 'low_stock':    return Package;
        case 'refund_spike': return RefreshCcw;
        case 'ranking_drop': return TrendingDown;
        default:             return Bell;
    }
}

function getAlertColor(severity) {
    if (severity === 'critical') return '#ef4444';
    if (severity === 'warning')  return '#fbbf24';
    return '#8b8b99';
}

export function AlertsPanel({ alerts = [] }) {
    const { language, t } = useLanguage();
    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

    const relativeTime = (dateStr) => {
        const relFmt = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
        const diff = new Date(dateStr).getTime() - Date.now();
        const diffSec = Math.floor(diff / 1000);
        const diffMin = Math.floor(diffSec / 60);
        if (Math.abs(diffMin) < 60) return relFmt.format(diffMin, 'minutes');
        const diffH = Math.floor(diffMin / 60);
        if (Math.abs(diffH) < 24) return relFmt.format(diffH, 'hours');
        return relFmt.format(Math.floor(diffH / 24), 'days');
    };

    return (
        <div className="bg-card border border-border rounded-xl p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#ef4444]/10 rounded-lg">
                        <Bell className="w-4 h-4 text-[#ef4444]" />
                    </div>
                    <h3 className="text-base text-foreground">{t('admin.alerts.heading')}</h3>
                </div>

                <span className="text-xs text-[#ef4444] bg-[#ef4444]/10 px-2.5 py-1 rounded-full border border-[#ef4444]/20">
                    {criticalCount} {t('admin.alerts.urgent')}
                </span>
            </div>

            {alerts.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-6">{t('admin.alerts.empty')}</p>
            ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20">
                    {alerts.slice(0, 6).map((alert) => {
                        const Icon = getIcon(alert.type);
                        const color = getAlertColor(alert.severity);

                        return (
                            <div
                                key={alert._id}
                                className="flex items-start gap-2.5 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-border hover:bg-secondary/40 transition-all group"
                            >
                                <div
                                    className="p-1.5 rounded-lg flex-shrink-0"
                                    style={{ backgroundColor: `${color}20` }}
                                >
                                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-foreground text-xs">{alert.title}</p>
                                    <p className="text-muted-foreground text-xs mt-1">{alert.message}</p>
                                    <p className="text-muted-foreground/70 text-xs mt-1.5">{relativeTime(alert.createdAt)}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default AlertsPanel;
