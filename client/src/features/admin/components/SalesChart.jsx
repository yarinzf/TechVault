import { useState, useEffect } from 'react';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { adminService } from '../api/admin.service';
import { useLanguage } from '../../../context/LanguageContext';

function isoToDisplay(periodStr, uiPeriod, language) {
    if (uiPeriod === 'week') {
        const d = new Date(periodStr + 'T00:00:00');
        return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'he-IL', { weekday: 'short' }).format(d);
    }
    if (uiPeriod === 'month') {
        const d = new Date(periodStr + 'T00:00:00');
        return `${d.getDate()}/${d.getMonth() + 1}`;
    }
    const month = parseInt(periodStr.split('-')[1], 10) - 1;
    const d = new Date(2000, month, 1);
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'he-IL', { month: 'short' }).format(d);
}

function getApiParams(uiPeriod) {
    const now    = new Date();
    const dateTo = now.toISOString().slice(0, 10);

    if (uiPeriod === 'week') {
        const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        return { period: 'day', dateFrom: from.toISOString().slice(0, 10), dateTo };
    }
    if (uiPeriod === 'month') {
        const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        return { period: 'day', dateFrom: from.toISOString().slice(0, 10), dateTo };
    }
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - 1);
    from.setDate(1);
    return { period: 'month', dateFrom: from.toISOString().slice(0, 10), dateTo };
}

export function SalesChart() {
    const { language, t } = useLanguage();
    const [period, setPeriod]       = useState('week');
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading]     = useState(true);

    const periods = [
        { value: 'week',  label: t('admin.chart.weekly') },
        { value: 'month', label: t('admin.chart.monthly') },
        { value: 'year',  label: t('admin.chart.yearly') },
    ];

    useEffect(() => {
        setLoading(true);
        adminService
            .getRevenue(getApiParams(period))
            .then((raw) => {
                const mapped = (Array.isArray(raw) ? raw : []).map((item, idx) => ({
                    id:       `${period}-${idx}`,
                    name:     isoToDisplay(item.period, period, language),
                    sales:    item.revenue,
                    orders:   item.orders,
                    avgOrder: item.orders > 0 ? Math.round(item.revenue / item.orders) : 0,
                }));
                setChartData(mapped);
            })
            .finally(() => setLoading(false));
    }, [period, language]);

    const currentTotal  = chartData.reduce((acc, d) => acc + d.sales, 0);
    const totalOrders   = chartData.reduce((acc, d) => acc + d.orders, 0);
    const avgOrderValue = chartData.length > 0 && totalOrders > 0
        ? Math.round(currentTotal / totalOrders)
        : 0;

    const periodLabel = periods.find(p => p.value === period)?.label ?? period;

    return (
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-lg text-foreground flex items-center gap-2">
                        {t('admin.chart.heading')}
                        <span className="text-xs bg-[#2563eb]/10 text-[#2563eb] px-2 py-1 rounded-full">
                            Live
                        </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('admin.chart.subtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-lg border border-border/50">
                    {periods.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setPeriod(item.value)}
                            className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                                period === item.value
                                    ? 'bg-[#2563eb] text-[#0a0a0f]'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="h-[420px] flex items-center justify-center">
                    <p className="text-muted-foreground text-sm">{t('admin.chart.loading')}</p>
                </div>
            ) : chartData.length === 0 ? (
                <div className="h-[420px] flex items-center justify-center">
                    <p className="text-muted-foreground text-sm">{t('admin.chart.empty')}</p>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={420}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                        <XAxis
                            dataKey="name"
                            stroke="#8b8b99"
                            tick={{ fill: '#8b8b99', fontSize: 12 }}
                            interval={period === 'month' ? 4 : 0}
                        />
                        <YAxis
                            stroke="#8b8b99"
                            tick={{ fill: '#8b8b99', fontSize: 12 }}
                            tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#15151d',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '8px',
                                color: '#e5e5ea',
                                fontSize: '13px',
                            }}
                            formatter={(value, name) => {
                                if (name === 'sales')  return [`₪${Number(value).toLocaleString('he-IL')}`, t('admin.chart.revenue')];
                                if (name === 'orders') return [Number(value).toLocaleString('he-IL'), t('admin.chart.orders')];
                                return [value, name];
                            }}
                        />

                        <Area
                            type="monotone"
                            dataKey="sales"
                            stroke="#2563eb"
                            strokeWidth={3}
                            fill="url(#colorSales)"
                            dot={period === 'month' ? false : { fill: '#2563eb', r: 4 }}
                            activeDot={{ r: 6 }}
                            name="sales"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-border/50">
                <SummaryBox
                    label={`${t('admin.chart.total_revenue')} (${periodLabel})`}
                    value={`₪${Math.round(currentTotal).toLocaleString('he-IL')}`}
                />
                <SummaryBox
                    label={t('admin.chart.total_orders')}
                    value={totalOrders.toLocaleString('he-IL')}
                />
                <SummaryBox
                    label={t('admin.chart.avg_order')}
                    value={`₪${avgOrderValue.toLocaleString('he-IL')}`}
                />
            </div>
        </div>
    );
}

function SummaryBox({ label, value, sub }) {
    return (
        <div className="text-center p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
            <p className="text-muted-foreground text-xs mb-1">{label}</p>
            <p className="text-foreground text-lg">{value}</p>
            {sub && <p className="text-[#7c3aed] text-xs mt-1">{sub}</p>}
        </div>
    );
}

export default SalesChart;
