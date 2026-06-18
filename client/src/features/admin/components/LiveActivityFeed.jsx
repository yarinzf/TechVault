import { ShoppingCart, AlertTriangle, RotateCcw, Package } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

const ORDER_STATUS_COLOR = {
    pending:    '#fbbf24',
    confirmed:  '#10b981',
    processing: '#3b82f6',
    shipped:    '#2563eb',
    delivered:  '#10b981',
    cancelled:  '#ef4444',
    refunded:   '#ef4444',
};

function activityToRow(item, timeAgo) {
    if (item.type === 'order') {
        const Icon  = item.status === 'cancelled' ? RotateCcw
            : item.status === 'shipped' || item.status === 'delivered' ? Package
            : ShoppingCart;
        const color = ORDER_STATUS_COLOR[item.status] ?? '#2563eb';
        return {
            id:       item._id,
            Icon,
            color,
            title:    item.title,
            subtitle: `${item.subtitle} • ${item.statusHe ?? item.status}`,
            amount:   item.amount != null
                ? `₪${Math.round(item.amount).toLocaleString('he-IL')}`
                : null,
            time:     timeAgo(item.createdAt),
        };
    }
    const color = item.severity === 'critical' ? '#ef4444' : '#fbbf24';
    return {
        id:       item._id,
        Icon:     AlertTriangle,
        color,
        title:    item.title,
        subtitle: item.subtitle ?? '',
        amount:   null,
        time:     timeAgo(item.createdAt),
    };
}

export function LiveActivityFeed({ activities = null }) {
    const { language, t } = useLanguage();

    const timeAgo = (dateStr) => {
        const relFmt = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
        const diff = new Date(dateStr).getTime() - Date.now();
        const diffSec = Math.floor(diff / 1000);
        const diffMin = Math.floor(diffSec / 60);
        if (Math.abs(diffMin) < 1) return relFmt.format(0, 'seconds');
        if (Math.abs(diffMin) < 60) return relFmt.format(diffMin, 'minutes');
        const diffH = Math.floor(diffMin / 60);
        if (Math.abs(diffH) < 24) return relFmt.format(diffH, 'hours');
        return relFmt.format(Math.floor(diffH / 24), 'days');
    };

    const rows = activities ? activities.map(item => activityToRow(item, timeAgo)) : null;

    return (
        <section className="bg-card border border-border rounded-xl p-6 h-full" dir="rtl">
            <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl text-foreground">{t('admin.feed.heading')}</h2>

                <div className="flex items-center gap-1.5 bg-[#10b981]/10 border border-[#10b981]/20 px-2 py-1 rounded-full">
                    <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
                    <span className="text-xs text-[#10b981]">Live</span>
                </div>
            </div>

            {rows == null ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg animate-pulse">
                            <div className="w-9 h-9 rounded-lg bg-secondary flex-shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 bg-secondary rounded w-2/3" />
                                <div className="h-2 bg-secondary rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('admin.feed.empty')}</p>
            ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin">
                    {rows.map((row) => {
                        const Icon = row.Icon;

                        return (
                            <article
                                key={row.id}
                                className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors"
                            >
                                <div
                                    className="p-2 rounded-lg flex-shrink-0"
                                    style={{ backgroundColor: `${row.color}15` }}
                                >
                                    <Icon className="w-4 h-4" style={{ color: row.color }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground mb-0.5">{row.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{row.subtitle}</p>
                                </div>

                                <div className="text-left flex-shrink-0">
                                    {row.amount && (
                                        <p className="text-sm text-foreground mb-0.5">{row.amount}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">{row.time}</p>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <div className="mt-4 pt-4 border-t border-border">
                <a href="/admin/activity" className="text-sm text-[#2563eb] hover:underline">
                    {t('admin.feed.view_all')}
                </a>
            </div>
        </section>
    );
}
