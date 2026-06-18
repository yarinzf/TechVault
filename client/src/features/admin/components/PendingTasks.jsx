import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

function getPriority(order) {
    if (order.status === 'pending_payment') return 'high';
    if (order.status === 'pending' && order.paymentStatus === 'unpaid') return 'high';
    if (order.status === 'pending') return 'medium';
    return 'low';
}

export function PendingTasks({ recentOrders = [], pendingCount = 0 }) {
    const { language, t } = useLanguage();
    const urgentCount = recentOrders.filter((o) => getPriority(o) === 'high').length;

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
        <div className="bg-card border border-border rounded-xl p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#ef4444]/10 rounded-lg">
                        <Clock className="w-5 h-5 text-[#ef4444]" />
                    </div>
                    <h3 className="text-lg text-foreground">{t('admin.pending.heading')}</h3>
                </div>

                <span className="text-xs bg-[#ef4444]/10 text-[#ef4444] px-3 py-1.5 rounded-full border border-[#ef4444]/20">
                    {pendingCount} {t('admin.pending.badge_suffix')}
                </span>
            </div>

            {recentOrders.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-4">{t('admin.pending.empty')}</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {recentOrders.map((order) => {
                        const priority = getPriority(order);
                        return (
                            <div
                                key={order._id}
                                className={`p-4 rounded-lg border border-border/40 border-r-4 ${getPriorityColor(priority)} transition-all cursor-pointer group`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="text-foreground text-sm">{order.orderNumber}</h4>
                                            {priority === 'high' && (
                                                <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-[#10b981]/10 rounded-md"
                                        aria-label={t('admin.pending.mark_handled')}
                                    >
                                        <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                                    </button>
                                </div>

                                <p className="text-xs text-muted-foreground mb-2">
                                    {t(`order.status.${order.status}`) ?? order.status} · ₪{Math.round(order.total).toLocaleString('he-IL')}
                                </p>

                                <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {relativeTime(order.createdAt)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function getPriorityColor(priority) {
    switch (priority) {
        case 'high':
            return 'border-r-[#ef4444] bg-[#ef4444]/5 hover:bg-[#ef4444]/10';
        case 'medium':
            return 'border-r-[#fbbf24] bg-[#fbbf24]/5 hover:bg-[#fbbf24]/10';
        case 'low':
            return 'border-r-[#2563eb] bg-[#2563eb]/5 hover:bg-[#2563eb]/10';
        default:
            return 'border-r-border bg-secondary/20 hover:bg-secondary/30';
    }
}

export default PendingTasks;
