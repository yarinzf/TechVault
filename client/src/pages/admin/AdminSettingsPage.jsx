import { useState } from 'react';
import {
    Moon,
    Sun,
    Bell,
    Shield,
    AlertTriangle,
    TrendingDown,
    TrendingUp,
    Package,
    DollarSign,
    Save,
    RotateCcw,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

const defaultThresholds = {
    criticalStock: 5,
    lowStock: 20,
    highSalesIncrease: 100,
    salesDecrease: 30,
    priceChange: 10,
    orderDelay: 24,
};

function ToggleButton({ checked, onClick, label }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={checked}
            className={`relative w-14 h-8 rounded-full transition-colors ${checked ? 'bg-[#2563eb]' : 'bg-border'
                }`}
        >
            <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${checked ? 'translate-x-[-28px]' : 'translate-x-[-4px]'
                    }`}
            />
        </button>
    );
}

export default function AdminSettingsPage() {
    const { toast } = useToast();
    const [darkMode, setDarkMode] = useState(true);

    const [notifications, setNotifications] = useState({
        email: true,
        push: true,
        sms: false,
    });

    const [alertSettings, setAlertSettings] = useState({
        criticalAlerts: true,
        stockAlerts: true,
        salesAlerts: true,
        orderAlerts: true,
        securityAlerts: true,
    });

    const [thresholds, setThresholds] = useState(defaultThresholds);

    const handleThresholdChange = (key, value) => {
        setThresholds((prev) => ({
            ...prev,
            [key]: Number.parseInt(value, 10) || 0,
        }));
    };

    const handleSave = () => {
        toast.success('ההגדרות נשמרו בהצלחה');
    };

    const handleReset = () => {
        if (confirm('האם לאפס את כל ההגדרות לברירת מחדל?')) {
            setThresholds(defaultThresholds);
        }
    };

    return (
        <div className="p-8" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl text-foreground mb-2">הגדרות</h1>
                    <p className="text-muted-foreground">התאמה אישית של המערכת והתראות</p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg hover:bg-secondary/70 transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        איפוס
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2 rounded-lg hover:bg-[#2563eb]/90 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        שמור שינויים
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-card border border-border rounded-lg p-6">
                        <h2 className="text-foreground text-lg mb-4 flex items-center gap-2">
                            {darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                            מראה ותצוגה
                        </h2>

                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                            <div>
                                <p className="text-foreground">מצב כהה (Dark Mode)</p>
                                <p className="text-xs text-muted-foreground mt-1">מעבר בין מצב כהה לבהיר</p>
                            </div>

                            <ToggleButton
                                checked={darkMode}
                                onClick={() => setDarkMode((prev) => !prev)}
                                label="החלפת מצב כהה"
                            />
                        </div>
                    </section>

                    <section className="bg-card border border-border rounded-lg p-6">
                        <h2 className="text-foreground text-lg mb-4 flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            ערוצי התראות
                        </h2>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                                <div>
                                    <p className="text-foreground">התראות אימייל</p>
                                    <p className="text-xs text-muted-foreground mt-1">קבל עדכונים למייל</p>
                                </div>

                                <ToggleButton
                                    checked={notifications.email}
                                    onClick={() => setNotifications((prev) => ({ ...prev, email: !prev.email }))}
                                    label="התראות אימייל"
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                                <div>
                                    <p className="text-foreground">התראות Push</p>
                                    <p className="text-xs text-muted-foreground mt-1">התראות בזמן אמת בדפדפן</p>
                                </div>

                                <ToggleButton
                                    checked={notifications.push}
                                    onClick={() => setNotifications((prev) => ({ ...prev, push: !prev.push }))}
                                    label="התראות Push"
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                                <div>
                                    <p className="text-foreground">התראות SMS</p>
                                    <p className="text-xs text-muted-foreground mt-1">הודעות טקסט לנייד</p>
                                </div>

                                <ToggleButton
                                    checked={notifications.sms}
                                    onClick={() => setNotifications((prev) => ({ ...prev, sms: !prev.sms }))}
                                    label="התראות SMS"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="bg-card border border-border rounded-lg p-6">
                        <h2 className="text-foreground text-lg mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            סוגי התראות
                        </h2>

                        <div className="space-y-4">
                            <AlertToggleRow
                                icon={<AlertTriangle className="w-4 h-4 text-[#ef4444]" />}
                                iconBg="bg-[#ef4444]/10"
                                title="התראות קריטיות"
                                description="בעיות דחופות הדורשות טיפול מיידי"
                                checked={alertSettings.criticalAlerts}
                                onClick={() => setAlertSettings((prev) => ({ ...prev, criticalAlerts: !prev.criticalAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<Package className="w-4 h-4 text-[#fbbf24]" />}
                                iconBg="bg-[#fbbf24]/10"
                                title="התראות מלאי"
                                description="מלאי נמוך, מלאי אזל ועוד"
                                checked={alertSettings.stockAlerts}
                                onClick={() => setAlertSettings((prev) => ({ ...prev, stockAlerts: !prev.stockAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<DollarSign className="w-4 h-4 text-[#10b981]" />}
                                iconBg="bg-[#10b981]/10"
                                title="התראות מכירות"
                                description="עליות וירידות במכירות"
                                checked={alertSettings.salesAlerts}
                                onClick={() => setAlertSettings((prev) => ({ ...prev, salesAlerts: !prev.salesAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<Bell className="w-4 h-4 text-[#3b82f6]" />}
                                iconBg="bg-[#3b82f6]/10"
                                title="התראות הזמנות"
                                description="הזמנות חדשות ועיכובים"
                                checked={alertSettings.orderAlerts}
                                onClick={() => setAlertSettings((prev) => ({ ...prev, orderAlerts: !prev.orderAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<Shield className="w-4 h-4 text-[#7c3aed]" />}
                                iconBg="bg-[#7c3aed]/10"
                                title="התראות אבטחה"
                                description="פעילויות חשודות וגישה לא מורשית"
                                checked={alertSettings.securityAlerts}
                                onClick={() => setAlertSettings((prev) => ({ ...prev, securityAlerts: !prev.securityAlerts }))}
                                highlight
                            />
                        </div>
                    </section>
                </div>

                <div className="space-y-6">
                    <ThresholdCard
                        icon={<AlertTriangle className="w-5 h-5 text-[#ef4444]" />}
                        title="סף קריטי"
                        description="הגדר מתי להתריע על בעיות קריטיות"
                    >
                        <ThresholdInput
                            label="מלאי קריטי"
                            value={thresholds.criticalStock}
                            unit="יח׳"
                            help={`התראה כאשר נותרו פחות מ-${thresholds.criticalStock} יחידות`}
                            onChange={(value) => handleThresholdChange('criticalStock', value)}
                        />

                        <ThresholdInput
                            label="עיכוב בהזמנה"
                            value={thresholds.orderDelay}
                            unit="שעות"
                            help={`התראה אחרי ${thresholds.orderDelay} שעות ללא טיפול`}
                            onChange={(value) => handleThresholdChange('orderDelay', value)}
                        />
                    </ThresholdCard>

                    <ThresholdCard
                        icon={<TrendingDown className="w-5 h-5 text-[#fbbf24]" />}
                        title="סף אזהרה"
                        description="הגדר מתי להתריע על מצבים חריגים"
                    >
                        <ThresholdInput
                            label="מלאי נמוך"
                            value={thresholds.lowStock}
                            unit="יח׳"
                            help={`אזהרה כאשר נותרו פחות מ-${thresholds.lowStock} יחידות`}
                            onChange={(value) => handleThresholdChange('lowStock', value)}
                        />

                        <ThresholdInput
                            label="ירידה במכירות"
                            value={thresholds.salesDecrease}
                            unit="%"
                            help={`אזהרה על ירידה של ${thresholds.salesDecrease}% או יותר`}
                            onChange={(value) => handleThresholdChange('salesDecrease', value)}
                        />

                        <ThresholdInput
                            label="שינוי מחיר"
                            value={thresholds.priceChange}
                            unit="%"
                            help={`אזהרה על שינוי מחיר של ${thresholds.priceChange}% או יותר`}
                            onChange={(value) => handleThresholdChange('priceChange', value)}
                        />
                    </ThresholdCard>

                    <ThresholdCard
                        icon={<TrendingUp className="w-5 h-5 text-[#10b981]" />}
                        title="סף הצלחה"
                        description="הגדר מתי להתריע על הצלחות"
                    >
                        <ThresholdInput
                            label="עלייה במכירות"
                            value={thresholds.highSalesIncrease}
                            unit="%"
                            help={`התראת הצלחה על עלייה של ${thresholds.highSalesIncrease}% או יותר`}
                            onChange={(value) => handleThresholdChange('highSalesIncrease', value)}
                        />
                    </ThresholdCard>
                </div>
            </div>
        </div>
    );
}

function AlertToggleRow({
    icon,
    iconBg,
    title,
    description,
    checked,
    onClick,
    highlight = false,
}) {
    return (
        <div
            className={`flex items-center justify-between p-4 rounded-lg ${highlight
                    ? 'bg-[#7c3aed]/5 border border-[#7c3aed]/20'
                    : 'bg-secondary/30'
                }`}
        >
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>

                <div>
                    <p className="text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
                </div>
            </div>

            <ToggleButton checked={checked} onClick={onClick} label={title} />
        </div>
    );
}

function ThresholdCard({ icon, title, description, children }) {
    return (
        <section className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-foreground text-lg mb-4 flex items-center gap-2">
                {icon}
                {title}
            </h2>

            <p className="text-xs text-muted-foreground mb-4">{description}</p>

            <div className="space-y-4">{children}</div>
        </section>
    );
}

function ThresholdInput({ label, value, unit, help, onChange }) {
    return (
        <div>
            <label className="text-sm text-foreground mb-2 block">{label}</label>

            <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                />

                <span className="text-muted-foreground text-sm">{unit}</span>
            </div>

            <p className="text-xs text-muted-foreground mt-1">{help}</p>
        </div>
    );
}
