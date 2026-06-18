import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';

function buildInsights(anomalies, t) {
    const HEALTHY_INSIGHT = {
        id: 'healthy',
        type: 'positive',
        title: t('admin.bi.healthy_title'),
        description: t('admin.bi.healthy_desc'),
        metric: null,
    };

    const ANOMALY_META = {
        sales_drop:   { titleKey: 'admin.bi.sales_drop',   type: 'negative' },
        cancel_spike: { titleKey: 'admin.bi.cancel_spike',  type: 'negative' },
        refund_spike: { titleKey: 'admin.bi.refund_spike',  type: 'negative' },
    };

    if (!anomalies || anomalies.length === 0) return [HEALTHY_INSIGHT];
    return anomalies.map((a, i) => ({
        id: i + 1,
        type: 'negative',
        title: ANOMALY_META[a.type]?.titleKey ? t(ANOMALY_META[a.type].titleKey) : a.type,
        description: a.message,
        metric: a.severity === 'critical' ? t('notif.severity.critical') : t('notif.severity.warning'),
    }));
}

export function BusinessInsights({ insights: anomalies = null }) {
    const t = useTranslation();
    const insights = buildInsights(anomalies, t);

    return (
        <div className="bg-card border border-border rounded-lg p-6" dir="rtl">
            <h3 className="text-foreground mb-4">{t('admin.bi.heading')}</h3>

            <div className="space-y-3">
                {insights.map((insight) => {
                    const Icon  = getInsightIcon(insight.type);
                    const color = getInsightColor(insight.type);

                    return (
                        <div
                            key={insight.id}
                            className="p-4 rounded-lg bg-secondary/20 border border-border/50 hover:bg-secondary/30 transition-colors"
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className="p-2 rounded-lg flex-shrink-0"
                                    style={{ backgroundColor: `${color}20` }}
                                >
                                    <Icon className="w-4 h-4" style={{ color }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-foreground text-sm">{insight.title}</p>
                                            <p className="text-muted-foreground text-xs mt-1">
                                                {insight.description}
                                            </p>
                                        </div>

                                        {insight.metric && (
                                            <span className="text-sm flex-shrink-0" style={{ color }}>
                                                {insight.metric}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getInsightIcon(type) {
    if (type === 'positive') return CheckCircle;
    if (type === 'negative') return AlertCircle;
    return TrendingUp;
}

function getInsightColor(type) {
    if (type === 'positive') return '#10b981';
    if (type === 'negative') return '#ef4444';
    return '#8b8b99';
}

export default BusinessInsights;
