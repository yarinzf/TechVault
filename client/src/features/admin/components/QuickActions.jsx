import { Activity, Clock, AlertTriangle, CheckCircle2, WifiOff } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';

export function QuickActions({
    pendingCount  = null,
    alertCount    = null,
    unreadCount   = 0,
    isConnected   = false,
}) {
    const t = useTranslation();

    const actions = [
        {
            title: t('admin.qa.pending_tasks'),
            value: pendingCount != null ? pendingCount.toLocaleString('he-IL') : '—',
            description: pendingCount > 0 ? `${pendingCount} ${t('admin.qa.orders_pending')}` : t('admin.qa.no_pending'),
            badge: t('admin.alerts.urgent'),
            color: '#ef4444',
            icon: Clock,
            showBadge: pendingCount > 0,
        },
        {
            title: t('admin.qa.open_alerts'),
            value: alertCount != null ? alertCount.toLocaleString('he-IL') : '—',
            description: alertCount > 0 ? t('admin.qa.active_alerts') : t('admin.qa.no_open_alerts'),
            badge: alertCount > 0 ? t('admin.qa.open_badge') : t('admin.qa.clean_badge'),
            color: alertCount > 0 ? '#fbbf24' : '#10b981',
            icon: AlertTriangle,
            showBadge: true,
        },
        {
            title: t('admin.qa.new_updates'),
            value: unreadCount.toLocaleString('he-IL'),
            description: t('admin.qa.events_received'),
            badge: 'Live',
            color: '#10b981',
            icon: Activity,
            isLive: true,
        },
        {
            title: t('admin.qa.system_status'),
            value: isConnected ? '100%' : '—',
            description: isConnected ? t('admin.qa.services_ok') : t('admin.qa.checking'),
            badge: isConnected ? t('admin.qa.active_badge') : t('admin.qa.disconnected'),
            color: isConnected ? '#2563eb' : '#6b7280',
            icon: isConnected ? CheckCircle2 : WifiOff,
            isLive: isConnected,
        },
    ];

    return (
        <div className="bg-card/30 border border-border/40 rounded-lg p-4" dir="rtl">
            <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm text-muted-foreground">{t('admin.qa.system_status')}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {actions.map((item) => {
                    const Icon = item.icon;

                    return (
                        <div
                            key={item.title}
                            className="bg-secondary/20 border border-border/30 rounded-lg p-3 hover:bg-secondary/30 transition-all cursor-pointer"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="p-1.5 rounded" style={{ backgroundColor: `${item.color}1a` }}>
                                    <Icon className="w-4 h-4" style={{ color: item.color }} />
                                </div>

                                {item.isLive ? (
                                    <div className="flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
                                        <span className="text-xs text-[#10b981]">{item.badge}</span>
                                    </div>
                                ) : item.showBadge !== false ? (
                                    <span
                                        className="text-xs px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: `${item.color}1a`, color: item.color }}
                                    >
                                        {item.badge}
                                    </span>
                                ) : null}
                            </div>

                            <h4 className="text-xs text-muted-foreground mb-1">{item.title}</h4>
                            <p className="text-xl text-foreground mb-1">{item.value}</p>
                            <p className="text-xs text-muted-foreground/60">{item.description}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default QuickActions;
