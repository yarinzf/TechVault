import { useState, useEffect } from 'react';
import {
    Bell,
    Shield,
    AlertTriangle,
    TrendingDown,
    TrendingUp,
    DollarSign,
    Save,
    RotateCcw,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { adminService } from '../../features/admin/api/admin.service';

// Must match server/services/settings.service.js's DEFAULTS_BY_SCOPE.admin
// exactly — used both to seed a brand-new (never-saved) page load and to
// give "איפוס" a real, well-defined target to persist.
const DEFAULT_SETTINGS = {
    notifications: { email: true, push: true, sms: false },
    alertTypes: {
        criticalAlerts: true, stockAlerts: true, salesAlerts: true,
        orderAlerts: true, securityAlerts: true,
    },
    thresholds: { highSalesIncrease: 100, salesDecrease: 30, priceChange: 10, orderDelay: 24 },
};

function ToggleButton({ checked, onClick, label, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={checked}
            className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-[#2563eb]' : 'bg-border'
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

    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [loading, setLoading]   = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving]     = useState(false);

    useEffect(() => {
        let alive = true;
        adminService.getSettings()
            .then((data) => { if (alive) setSettings({ ...DEFAULT_SETTINGS, ...data }); })
            .catch((err) => { if (alive) setLoadError(err?.message ?? 'שגיאה בטעינת ההגדרות'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const { notifications, alertTypes, thresholds } = settings;

    const setNotifications = (updater) =>
        setSettings((prev) => ({ ...prev, notifications: updater(prev.notifications) }));
    const setAlertTypes = (updater) =>
        setSettings((prev) => ({ ...prev, alertTypes: updater(prev.alertTypes) }));

    const handleThresholdChange = (key, value) => {
        setSettings((prev) => ({
            ...prev,
            thresholds: { ...prev.thresholds, [key]: Number.parseInt(value, 10) || 0 },
        }));
    };

    const persist = async (nextSettings, successMessage) => {
        setSaving(true);
        try {
            const saved = await adminService.updateSettings(nextSettings);
            setSettings({ ...DEFAULT_SETTINGS, ...saved });
            toast.success(successMessage);
        } catch (err) {
            toast.error(err?.message ?? 'שמירת ההגדרות נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => persist(settings, 'ההגדרות נשמרו בהצלחה');

    const handleReset = () => {
        if (!confirm('האם לאפס את כל ההגדרות לברירת מחדל?')) return;
        persist(DEFAULT_SETTINGS, 'ההגדרות אופסו לברירת המחדל ונשמרו');
    };

    if (loading) {
        return (
            <div className="p-8 text-center text-muted-foreground" dir="rtl">
                טוען הגדרות...
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="p-8 text-center" dir="rtl">
                <p className="text-red-400 text-sm">{loadError}</p>
            </div>
        );
    }

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
                        disabled={saving}
                        className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg hover:bg-secondary/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RotateCcw className="w-4 h-4" />
                        איפוס
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2 rounded-lg hover:bg-[#2563eb]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'שומר...' : 'שמור שינויים'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-card border border-border rounded-lg p-6">
                        <h2 className="text-foreground text-lg mb-4 flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            ערוצי התראות
                        </h2>
                        <p className="text-xs text-muted-foreground -mt-2 mb-4">
                            העדפת ערוצים לקבלת התראות — נשמרת במערכת, אך אינה מחוברת עדיין לשליחה בפועל של אימייל/SMS.
                        </p>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                                <div>
                                    <p className="text-foreground">התראות אימייל</p>
                                    <p className="text-xs text-muted-foreground mt-1">קבל עדכונים למייל</p>
                                </div>

                                <ToggleButton
                                    checked={notifications.email}
                                    disabled={saving}
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
                                    disabled={saving}
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
                                    disabled={saving}
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
                        <p className="text-xs text-muted-foreground -mt-2 mb-4">
                            אילו סוגי התראות מעניינים אותך — העדפה נשמרת, טרם מסננת את פיד ההתראות בפועל.
                        </p>

                        <div className="space-y-4">
                            <AlertToggleRow
                                icon={<AlertTriangle className="w-4 h-4 text-[#ef4444]" />}
                                iconBg="bg-[#ef4444]/10"
                                title="התראות קריטיות"
                                description="בעיות דחופות הדורשות טיפול מיידי"
                                checked={alertTypes.criticalAlerts}
                                disabled={saving}
                                onClick={() => setAlertTypes((prev) => ({ ...prev, criticalAlerts: !prev.criticalAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<Bell className="w-4 h-4 text-[#fbbf24]" />}
                                iconBg="bg-[#fbbf24]/10"
                                title="התראות מלאי"
                                description="מלאי נמוך, מלאי אזל ועוד"
                                checked={alertTypes.stockAlerts}
                                disabled={saving}
                                onClick={() => setAlertTypes((prev) => ({ ...prev, stockAlerts: !prev.stockAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<DollarSign className="w-4 h-4 text-[#10b981]" />}
                                iconBg="bg-[#10b981]/10"
                                title="התראות מכירות"
                                description="עליות וירידות במכירות"
                                checked={alertTypes.salesAlerts}
                                disabled={saving}
                                onClick={() => setAlertTypes((prev) => ({ ...prev, salesAlerts: !prev.salesAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<Bell className="w-4 h-4 text-[#3b82f6]" />}
                                iconBg="bg-[#3b82f6]/10"
                                title="התראות הזמנות"
                                description="הזמנות חדשות ועיכובים"
                                checked={alertTypes.orderAlerts}
                                disabled={saving}
                                onClick={() => setAlertTypes((prev) => ({ ...prev, orderAlerts: !prev.orderAlerts }))}
                            />

                            <AlertToggleRow
                                icon={<Shield className="w-4 h-4 text-[#7c3aed]" />}
                                iconBg="bg-[#7c3aed]/10"
                                title="התראות אבטחה"
                                description="פעילויות חשודות וגישה לא מורשית"
                                checked={alertTypes.securityAlerts}
                                disabled={saving}
                                onClick={() => setAlertTypes((prev) => ({ ...prev, securityAlerts: !prev.securityAlerts }))}
                                highlight
                            />
                        </div>
                    </section>
                </div>

                <div className="space-y-6">
                    {/* Note: critical/low stock thresholds are intentionally NOT
                        editable here — the real, currently-enforced low-stock
                        threshold is Product.minStock, set per-product in Inventory
                        Management. Duplicating it here would create a second,
                        conflicting source of truth. */}
                    <ThresholdCard
                        icon={<TrendingDown className="w-5 h-5 text-[#fbbf24]" />}
                        title="סף אזהרה (העדפה אישית)"
                        description="נשמר במערכת — טרם מחובר למנוע זיהוי החריגות בפועל"
                    >
                        <ThresholdInput
                            label="ירידה במכירות"
                            value={thresholds.salesDecrease}
                            unit="%"
                            disabled={saving}
                            help={`הערך המועדף עליך לירידה של ${thresholds.salesDecrease}% או יותר`}
                            onChange={(value) => handleThresholdChange('salesDecrease', value)}
                        />

                        <ThresholdInput
                            label="שינוי מחיר"
                            value={thresholds.priceChange}
                            unit="%"
                            disabled={saving}
                            help={`הערך המועדף עליך לשינוי מחיר של ${thresholds.priceChange}% או יותר`}
                            onChange={(value) => handleThresholdChange('priceChange', value)}
                        />

                        <ThresholdInput
                            label="עיכוב בהזמנה"
                            value={thresholds.orderDelay}
                            unit="שעות"
                            disabled={saving}
                            help={`הערך המועדף עליך לאחר ${thresholds.orderDelay} שעות ללא טיפול`}
                            onChange={(value) => handleThresholdChange('orderDelay', value)}
                        />
                    </ThresholdCard>

                    <ThresholdCard
                        icon={<TrendingUp className="w-5 h-5 text-[#10b981]" />}
                        title="סף הצלחה (העדפה אישית)"
                        description="נשמר במערכת — טרם מחובר למנוע זיהוי החריגות בפועל"
                    >
                        <ThresholdInput
                            label="עלייה במכירות"
                            value={thresholds.highSalesIncrease}
                            unit="%"
                            disabled={saving}
                            help={`הערך המועדף עליך לעלייה של ${thresholds.highSalesIncrease}% או יותר`}
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
    disabled,
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

            <ToggleButton checked={checked} onClick={onClick} label={title} disabled={disabled} />
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

function ThresholdInput({ label, value, unit, help, onChange, disabled }) {
    return (
        <div>
            <label className="text-sm text-foreground mb-2 block">{label}</label>

            <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <span className="text-muted-foreground text-sm">{unit}</span>
            </div>

            <p className="text-xs text-muted-foreground mt-1">{help}</p>
        </div>
    );
}
