import { DollarSign, TrendingUp, ShoppingCart, BarChart2, Users, XCircle } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';

export function QuickSummary({
    todayRevenue = 0,
    monthRevenue = 0,
    openOrders   = 0,
    newCustomers = 0,
    aov              = null,
    cancellationRate = null,
}) {
    const t = useTranslation();
    const fmt    = (n) => Math.round(n).toLocaleString('he-IL');
    const fmtPct = (n) => n === null ? '—' : `${n.toLocaleString('he-IL')}%`;
    const fmtAov = (n) => n === null ? '—' : `₪${fmt(n)}`;

    const summaryData = [
        {
            id: 1,
            title: t('admin.qs.month_revenue'),
            value: `₪${fmt(monthRevenue)}`,
            change: t('admin.qs.this_month'),
            changeType: monthRevenue > 0 ? 'positive' : 'neutral',
            icon: DollarSign,
            color: '#2563eb',
        },
        {
            id: 2,
            title: t('admin.qs.today_sales'),
            value: `₪${fmt(todayRevenue)}`,
            change: t('admin.qs.so_far_today'),
            changeType: todayRevenue > 0 ? 'positive' : 'neutral',
            icon: TrendingUp,
            color: '#10b981',
        },
        {
            id: 3,
            title: t('admin.qs.open_orders'),
            value: openOrders.toLocaleString('he-IL'),
            change: t('admin.qs.awaiting'),
            changeType: openOrders > 0 ? 'neutral' : 'positive',
            icon: ShoppingCart,
            color: '#3b82f6',
        },
        {
            id: 4,
            title: t('admin.qs.aov'),
            value: fmtAov(aov),
            change: aov !== null ? t('admin.qs.from_paid') : t('admin.qs.loading'),
            changeType: aov > 0 ? 'positive' : 'neutral',
            icon: BarChart2,
            color: '#ef4444',
        },
        {
            id: 5,
            title: t('admin.qs.new_customers'),
            value: newCustomers.toLocaleString('he-IL'),
            change: t('admin.qs.last_30d'),
            changeType: newCustomers > 0 ? 'positive' : 'neutral',
            icon: Users,
            color: '#7c3aed',
        },
        {
            id: 6,
            title: t('admin.qs.cancel_rate'),
            value: fmtPct(cancellationRate),
            change: cancellationRate !== null
                ? (cancellationRate === 0 ? t('admin.qs.no_cancellations') : t('admin.qs.of_total_orders'))
                : t('admin.qs.loading'),
            changeType: cancellationRate === null ? 'neutral'
                : cancellationRate === 0 ? 'positive'
                : cancellationRate < 5   ? 'neutral'
                : 'negative',
            icon: XCircle,
            color: '#fbbf24',
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" dir="rtl">
            {summaryData.map((item) => {
                const Icon = item.icon;

                return (
                    <div
                        key={item.id}
                        className="bg-card border border-border rounded-xl p-5 hover:border-opacity-70 transition-all"
                    >
                        <div
                            className="p-2.5 rounded-lg w-fit mb-3"
                            style={{ backgroundColor: `${item.color}15` }}
                        >
                            <Icon className="w-5 h-5" style={{ color: item.color }} />
                        </div>

                        <p className="text-xs text-muted-foreground mb-2">{item.title}</p>
                        <p className="text-2xl text-foreground mb-2">{item.value}</p>

                        <span className={`text-xs ${getChangeClass(item.changeType)}`}>
                            {item.change}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function getChangeClass(changeType) {
    if (changeType === 'positive') return 'text-[#10b981]';
    if (changeType === 'negative') return 'text-[#ef4444]';
    return 'text-muted-foreground';
}

export default QuickSummary;
