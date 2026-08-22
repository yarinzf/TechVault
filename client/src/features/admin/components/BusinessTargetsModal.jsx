import { useEffect, useState } from 'react';
import { X, Target, Save } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../hooks/useToast';
import { adminService } from '../api/admin.service';

// Mirrors businessTarget.service.js's getDailyGoalsProgress/
// getMonthlyGoalsProgress metric lists exactly — the two sections below are
// real BusinessTarget rows for TODAY (Israel calendar day) and THIS MONTH,
// the same periods PerformanceGoals.jsx already displays.
const DAILY_METRICS = ['daily_revenue', 'daily_orders', 'conversion_rate', 'abandoned_cart_rate', 'cancellation_rate'];
const MONTHLY_METRICS = ['monthly_revenue', 'monthly_orders', 'new_customers', 'cancellation_rate'];

const METRIC_LABELS = {
    daily_revenue:       { he: 'הכנסה יומית',      en: 'Daily Revenue',       unit: '₪' },
    daily_orders:        { he: 'הזמנות יומיות',    en: 'Daily Orders',        unit: '' },
    conversion_rate:     { he: 'יחס המרה',         en: 'Conversion Rate',     unit: '%' },
    abandoned_cart_rate: { he: 'עגלות נטושות',     en: 'Abandoned Cart Rate', unit: '%' },
    cancellation_rate:   { he: 'ביטולים',          en: 'Cancellation Rate',   unit: '%' },
    monthly_revenue:     { he: 'הכנסה חודשית',     en: 'Monthly Revenue',     unit: '₪' },
    monthly_orders:      { he: 'הזמנות חודשיות',   en: 'Monthly Orders',      unit: '' },
    new_customers:       { he: 'לקוחות חדשים',     en: 'New Customers',       unit: '' },
};

function fmtActual(value, unit) {
    if (value == null) return '—';
    if (unit === '₪') return `₪${Math.round(value).toLocaleString('he-IL')}`;
    if (unit === '%') return `${value.toFixed(1)}%`;
    return value.toLocaleString('he-IL');
}

function TargetRow({ metric, periodType, entry, onSave, saving, language }) {
    const label = METRIC_LABELS[metric];
    const [draft, setDraft] = useState(entry?.target ?? '');
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!dirty) setDraft(entry?.target ?? '');
    }, [entry?.target, dirty]);

    return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{language === 'en' ? label.en : label.he}</p>
                <p className="text-xs text-muted-foreground mt-1">
                    {language === 'en' ? 'Actual: ' : 'בפועל: '}{fmtActual(entry?.actual, label.unit)}
                    {entry?.progressPercent != null && ` (${Math.round(entry.progressPercent)}%)`}
                </p>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="number"
                    min="0"
                    value={draft}
                    disabled={saving}
                    onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
                    className="w-28 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50 disabled:opacity-50"
                    placeholder={language === 'en' ? 'No target' : 'ללא יעד'}
                />
                <button
                    type="button"
                    disabled={saving || draft === '' || Number(draft) === entry?.target}
                    onClick={() => { onSave(metric, periodType, Number(draft)); setDirty(false); }}
                    className="p-2 rounded-lg bg-[#2563eb] text-white hover:bg-[#2563eb]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={language === 'en' ? 'Save' : 'שמור'}
                >
                    <Save className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

export function BusinessTargetsModal({ onClose }) {
    const { language, t } = useLanguage();
    const { toast } = useToast();

    const [goalsData, setGoalsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [savingMetric, setSavingMetric] = useState(null);

    const load = () => {
        setLoading(true);
        setError(false);
        adminService.getGoalsProgress()
            .then(setGoalsData)
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const handleSave = async (metric, periodType, targetValue) => {
        setSavingMetric(`${periodType}-${metric}`);
        try {
            await adminService.setTarget({
                metric, periodType, periodStart: new Date().toISOString(), targetValue,
            });
            toast.success(t('admin.targets.saved'));
            load(); // real actual/progress recalculated server-side — refetch, never guess client-side
        } catch (err) {
            toast.error(err?.message ?? t('admin.targets.save_error'));
        } finally {
            setSavingMetric(null);
        }
    };

    const byMetric = (list, metric) => list?.find((g) => g.metric === metric) ?? null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
                dir="rtl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-[#2563eb]" />
                        <h3 className="text-lg text-foreground">{t('admin.targets.heading')}</h3>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Close">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {loading ? (
                        <p className="text-muted-foreground text-sm text-center py-6">{t('admin.chart.loading')}</p>
                    ) : error ? (
                        <p className="text-[#ef4444] text-sm text-center py-6">{t('admin.goals.error')}</p>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground">{t('admin.targets.description')}</p>

                            <div>
                                <h4 className="text-sm text-muted-foreground mb-2">{t('admin.targets.daily')}</h4>
                                <div className="space-y-2">
                                    {DAILY_METRICS.map((metric) => (
                                        <TargetRow
                                            key={`daily-${metric}`}
                                            metric={metric}
                                            periodType="day"
                                            entry={byMetric(goalsData?.daily, metric)}
                                            onSave={handleSave}
                                            saving={savingMetric === `day-${metric}`}
                                            language={language}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm text-muted-foreground mb-2">{t('admin.targets.monthly')}</h4>
                                <div className="space-y-2">
                                    {MONTHLY_METRICS.map((metric) => (
                                        <TargetRow
                                            key={`monthly-${metric}`}
                                            metric={metric}
                                            periodType="month"
                                            entry={byMetric(goalsData?.monthly, metric)}
                                            onSave={handleSave}
                                            saving={savingMetric === `month-${metric}`}
                                            language={language}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default BusinessTargetsModal;
