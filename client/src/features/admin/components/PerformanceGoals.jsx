import {
    Target,
    Settings,
    TrendingUp,
    ShoppingCart,
    DollarSign,
    Users,
    ShoppingBag,
    XCircle,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

const fmtRevenue = (n) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
    return `₪${Math.round(n).toLocaleString('he-IL')}`;
};

const clamp = (n) => Math.min(100, Math.max(0, Math.round(n)));

export function PerformanceGoals({ dashboard = null, ordersThisMonth = null }) {
    const { language, t } = useLanguage();

    const revenue      = dashboard?.revenue ?? {};
    const orders       = dashboard?.orders  ?? {};
    const users        = dashboard?.users   ?? {};

    const monthRevenue    = revenue.thisMonthPaid ?? null;
    const newCustomers    = users.new30d      ?? null;
    const cancelRate      = orders.cancellationRate ?? null;
    const orderCount      = ordersThisMonth ?? null;

    const goals = [
        {
            id: 1,
            title: t('admin.goals.conversion'),
            current: '4.8%',
            target: '5.5%',
            progress: 87,
            color: '#fbbf24',
            icon: TrendingUp,
        },
        {
            id: 2,
            title: t('admin.goals.order_count'),
            current: orderCount != null ? orderCount.toLocaleString('he-IL') : '—',
            target: '1,500',
            progress: orderCount != null ? clamp((orderCount / 1500) * 100) : 0,
            color: '#10b981',
            icon: ShoppingCart,
        },
        {
            id: 3,
            title: t('admin.goals.monthly_rev'),
            current: fmtRevenue(monthRevenue),
            target: '₪3.5M',
            progress: monthRevenue != null ? clamp((monthRevenue / 3_500_000) * 100) : 0,
            color: '#2563eb',
            icon: DollarSign,
        },
        {
            id: 4,
            title: t('admin.goals.new_customers'),
            current: newCustomers != null ? newCustomers.toLocaleString('he-IL') : '—',
            target: '350',
            progress: newCustomers != null ? clamp((newCustomers / 350) * 100) : 0,
            color: '#7c3aed',
            icon: Users,
        },
        {
            id: 5,
            title: t('admin.goals.abandoned'),
            current: '72%',
            target: '60%',
            progress: 83,
            color: '#ef4444',
            icon: ShoppingBag,
        },
        {
            id: 6,
            title: t('admin.goals.cancellations'),
            current: cancelRate != null ? `${cancelRate.toFixed(1)}%` : '—',
            target: '5.0%',
            progress: cancelRate != null && cancelRate > 0
                ? clamp((5 / cancelRate) * 100)
                : cancelRate === 0 ? 100 : 0,
            color: '#ef4444',
            icon: XCircle,
        },
    ];

    const now = new Date();
    const monthLabel = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'he-IL', { month: 'long' }).format(now);

    return (
        <div className="bg-card border border-border rounded-xl p-5" dir="rtl">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#2563eb]/10 rounded-lg">
                        <Target className="w-4 h-4 text-[#2563eb]" />
                    </div>
                    <h3 className="text-lg text-foreground">{t('admin.goals.heading_prefix')} {monthLabel} {now.getFullYear()}</h3>
                </div>

                <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                    aria-label={t('admin.goals.settings')}
                >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {goals.map((goal) => {
                    const Icon = goal.icon;

                    return (
                        <div
                            key={goal.id}
                            className="flex items-start gap-2.5 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-border hover:bg-secondary/40 transition-all group"
                        >
                            <div
                                className="p-1.5 rounded-lg flex-shrink-0"
                                style={{ backgroundColor: `${goal.color}20` }}
                            >
                                <Icon className="w-3.5 h-3.5" style={{ color: goal.color }} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground mb-1">{goal.title}</p>

                                <div className="flex items-baseline gap-2 mb-2">
                                    <p className="text-base text-foreground">{goal.current}</p>
                                    <p className="text-xs text-muted-foreground">/ {goal.target}</p>
                                </div>

                                <div className="w-full bg-secondary rounded-full h-1.5">
                                    <div
                                        className="h-1.5 rounded-full transition-all"
                                        style={{
                                            width: `${goal.progress}%`,
                                            backgroundColor: goal.color,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default PerformanceGoals;
