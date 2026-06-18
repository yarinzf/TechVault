import { useState } from 'react';
import {
    Brain,
    TrendingDown,
    ShoppingCart,
    TrendingUp,
    Users,
    ArrowLeft,
    X,
    Sparkles,
} from 'lucide-react';

const initialInsights = [
    {
        id: '1',
        urgency: 'high',
        icon: TrendingDown,
        title: 'ירידה חריגה בהמרות',
        description: 'יחס ההמרה ירד מ-5.2% ל-4.8% ב-72 שעות — זוהה קשר לעמוד מוצר AirPods Pro 2',
        metric: '-7.7%',
        action: 'בדוק עמוד מוצר',
        color: '#ef4444',
    },
    {
        id: '2',
        urgency: 'high',
        icon: ShoppingCart,
        title: '47 עגלות נטושות',
        description: 'ערך כולל: ₪112,340. שחזור של 20% = ₪22,468 הכנסה פוטנציאלית',
        metric: '₪112K',
        action: 'שלח קמפיין שחזור',
        color: '#fbbf24',
    },
    {
        id: '3',
        urgency: 'info',
        icon: TrendingUp,
        title: 'הזדמנות: מוצר בביקוש גבוה',
        description: "חיפושים ל-iPhone 15 Pro Max עלו 340% — מלאי נמוך (45 יח'). הזמנת ספק מיידית מומלצת",
        metric: '+340%',
        action: 'הזמן מספק',
        color: '#2563eb',
    },
    {
        id: '4',
        urgency: 'medium',
        icon: Users,
        title: '18 לקוחות VIP רדומים',
        description: 'לא ביצעו רכישה 45+ ימים — פוטנציאל השבה: ₪890K',
        metric: '₪890K',
        action: 'שלח קמפיין השבה',
        color: '#7c3aed',
    },
];

function getUrgencyBadge(urgency) {
    switch (urgency) {
        case 'high':
            return {
                text: 'דחוף',
                color: 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20',
            };

        case 'medium':
            return {
                text: 'בינוני',
                color: 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20',
            };

        case 'info':
            return {
                text: 'הזדמנות',
                color: 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/20',
            };

        default:
            return {
                text: '',
                color: '',
            };
    }
}

export function AIInsightsPanel() {
    const [insights, setInsights] = useState(initialInsights);

    const dismissInsight = (id) => {
        setInsights((prev) => prev.filter((insight) => insight.id !== id));
    };

    return (
        <section className="bg-card border border-border rounded-xl p-6" dir="rtl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#7c3aed] to-[#ef4444] rounded-lg">
                    <Brain className="w-5 h-5 text-white" />
                </div>

                <h2 className="text-xl text-foreground">AI תובנות חכמות</h2>

                <div className="flex items-center gap-1.5 bg-[#7c3aed]/10 border border-[#7c3aed]/20 px-3 py-1 rounded-full">
                    <Sparkles className="w-3.5 h-3.5 text-[#7c3aed]" />
                    <span className="text-xs text-[#7c3aed]">מנתח בזמן אמת</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {insights.map((insight) => {
                    const Icon = insight.icon;
                    const badge = getUrgencyBadge(insight.urgency);

                    return (
                        <article
                            key={insight.id}
                            className="relative bg-secondary/30 border border-border rounded-lg p-4 transition-all group"
                            style={{ backgroundColor: `${insight.color}05` }}
                        >
                            <button
                                type="button"
                                onClick={() => dismissInsight(insight.id)}
                                className="absolute top-2 left-2 p-1 rounded-lg hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="סגור תובנה"
                            >
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>

                            <div className="flex items-start gap-3 mb-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{ backgroundColor: `${insight.color}15` }}
                                >
                                    <Icon className="w-5 h-5" style={{ color: insight.color }} />
                                </div>

                                <span className={`text-xs px-2 py-1 rounded-full border ${badge.color}`}>
                                    {badge.text}
                                </span>
                            </div>

                            <h3 className="text-foreground text-sm font-medium mb-2">
                                {insight.title}
                            </h3>

                            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                                {insight.description}
                            </p>

                            <div className="mb-3">
                                <span
                                    className="text-2xl font-bold"
                                    style={{ color: insight.color }}
                                >
                                    {insight.metric}
                                </span>
                            </div>

                            <button
                                type="button"
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-all text-sm"
                                style={{
                                    borderColor: `${insight.color}40`,
                                    color: insight.color,
                                }}
                            >
                                <span>{insight.action}</span>
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
