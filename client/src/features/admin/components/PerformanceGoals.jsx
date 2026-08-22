import { useEffect, useState } from 'react';
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
import { adminService } from '../api/admin.service';
import { BusinessTargetsModal } from './BusinessTargetsModal';

const fmtRevenue = (n) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
    return `₪${Math.round(n).toLocaleString('he-IL')}`;
};
const fmtPercent = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const fmtCount   = (n) => (n == null ? '—' : n.toLocaleString('he-IL'));

const clamp = (n) => Math.min(100, Math.max(0, Math.round(n)));

// Builds one tile from a real /admin/targets/goals progress entry — never
// falls back to a hardcoded number. A metric with no BusinessTarget row yet
// (progressPercent: null) shows "—" and an empty bar, not a fabricated 87%.
function tileFrom(entry, { title, color, icon }, formatter) {
    if (!entry) return null;
    return {
        title, color, icon,
        current:  formatter(entry.actual),
        target:   entry.target != null ? formatter(entry.target) : '—',
        progress: entry.progressPercent != null ? clamp(entry.progressPercent) : 0,
        hasTarget: entry.target != null,
    };
}

export function PerformanceGoals() {
    const { language, t } = useLanguage();
    const [goalsData, setGoalsData] = useState(null);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(false);
    const [showTargetsModal, setShowTargetsModal] = useState(false);

    const load = () => {
        setLoading(true);
        setError(false);
        adminService.getGoalsProgress()
            .then(setGoalsData)
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const byMetric = (list, metric) => list?.find((g) => g.metric === metric) ?? null;

    const goals = goalsData ? [
        tileFrom(byMetric(goalsData.daily, 'conversion_rate'),      { title: t('admin.goals.conversion'),    color: '#fbbf24', icon: TrendingUp },  fmtPercent),
        tileFrom(byMetric(goalsData.monthly, 'monthly_orders'),     { title: t('admin.goals.order_count'),   color: '#10b981', icon: ShoppingCart }, fmtCount),
        tileFrom(byMetric(goalsData.monthly, 'monthly_revenue'),    { title: t('admin.goals.monthly_rev'),   color: '#2563eb', icon: DollarSign },   fmtRevenue),
        tileFrom(byMetric(goalsData.monthly, 'new_customers'),      { title: t('admin.goals.new_customers'), color: '#7c3aed', icon: Users },        fmtCount),
        tileFrom(byMetric(goalsData.daily, 'abandoned_cart_rate'),  { title: t('admin.goals.abandoned'),     color: '#ef4444', icon: ShoppingBag },   fmtPercent),
        tileFrom(byMetric(goalsData.monthly, 'cancellation_rate'),  { title: t('admin.goals.cancellations'), color: '#ef4444', icon: XCircle },       fmtPercent),
    ].filter(Boolean) : [];

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
                    onClick={() => setShowTargetsModal(true)}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                    aria-label={t('admin.goals.settings')}
                >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>

            {showTargetsModal && (
                <BusinessTargetsModal onClose={() => { setShowTargetsModal(false); load(); }} />
            )}

            {loading ? (
                <p className="text-muted-foreground text-xs text-center py-6">{t('admin.chart.loading')}</p>
            ) : error ? (
                <p className="text-[#ef4444] text-xs text-center py-6">{t('admin.goals.error')}</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {goals.map((goal) => {
                        const Icon = goal.icon;

                        return (
                            <div
                                key={goal.title}
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
                                        <p className="text-xs text-muted-foreground">
                                            {goal.hasTarget ? `/ ${goal.target}` : t('admin.goals.no_target')}
                                        </p>
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
            )}
        </div>
    );
}

export default PerformanceGoals;
