import { Bell, Package, Truck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import { warehouseService } from '../../features/warehouse/api/warehouse.service';

// Must match server/services/settings.service.js's DEFAULTS_BY_SCOPE.warehouse.
const DEFAULT_SETTINGS = {
  minStockDefault: 10,
  alertEmail: '',
  lowStockAlert: true,
  supplierNotify: true,
  autoOrder: false,
};

export default function WarehouseSettingsPage() {
  const { toast } = useToast();

  const [settings, setSettings]   = useState(DEFAULT_SETTINGS);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    let alive = true;
    warehouseService.getSettings()
      .then((data) => { if (alive) setSettings({ ...DEFAULT_SETTINGS, ...data }); })
      .catch((err) => { if (alive) setLoadError(err?.message ?? 'שגיאה בטעינת ההגדרות'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await warehouseService.updateSettings({
        minStockDefault: Number.parseInt(settings.minStockDefault, 10) || 0,
        alertEmail:      settings.alertEmail,
        lowStockAlert:   settings.lowStockAlert,
        supplierNotify:  settings.supplierNotify,
        autoOrder:       settings.autoOrder,
      });
      setSettings({ ...DEFAULT_SETTINGS, ...saved });
      toast.success('הגדרות המחסן נשמרו בהצלחה');
    } catch (err) {
      toast.error(err?.message ?? 'שמירת ההגדרות נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground" dir="rtl">טוען הגדרות...</div>;
  }

  if (loadError) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-red-400 text-sm">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">הגדרות מחסן</h1>
        <p className="text-muted-foreground text-sm mt-1">הגדרות ניהול מלאי והתראות</p>
      </div>

      {/* Stock thresholds */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-[#2563eb]" />
          <h2 className="font-semibold text-foreground">סף מלאי</h2>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground mb-1">מלאי מינימלי ברירת מחדל (יחידות)</label>
          <input
            type="number"
            value={settings.minStockDefault}
            disabled={saving}
            onChange={(e) => setSettings((prev) => ({ ...prev, minStockDefault: e.target.value }))}
            className="w-32 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb] disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground mt-1">
            העדפה נשמרת. הסף שנאכף בפועל להתראת מלאי נמוך הוא שדה "מלאי מינימלי" הנקבע לכל מוצר בנפרד במסך ניהול מלאי.
          </p>
        </div>
      </section>

      {/* Alerts */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#2563eb]" />
          <h2 className="font-semibold text-foreground">התראות</h2>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">כתובת מייל להתראות</label>
          <input
            type="email"
            value={settings.alertEmail}
            disabled={saving}
            onChange={(e) => setSettings((prev) => ({ ...prev, alertEmail: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb] disabled:opacity-50"
          />
        </div>

        {[
          { key: 'lowStockAlert',  label: 'התראה על מלאי נמוך' },
          { key: 'supplierNotify', label: 'התראה על קבלת סחורה מספק' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-foreground">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              disabled={saving}
              onClick={() => setSettings((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${settings[key] ? 'bg-[#2563eb]' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings[key] ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </label>
        ))}
      </section>

      {/* Auto order */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#2563eb]" />
          <h2 className="font-semibold text-foreground">הזמנות אוטומטיות</h2>
        </div>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm text-foreground">הזמנה אוטומטית מספק בהגעה לסף מינימלי</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              העדפה נשמרת בלבד — יצירת הזמנת רכש אוטומטית בפועל אינה מיושמת עדיין במערכת.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoOrder}
            disabled={saving}
            onClick={() => setSettings((prev) => ({ ...prev, autoOrder: !prev.autoOrder }))}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mr-4 disabled:opacity-50 ${settings.autoOrder ? 'bg-[#2563eb]' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.autoOrder ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </label>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-[#2563eb]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'שומר...' : 'שמור הגדרות'}
      </button>
    </div>
  );
}
