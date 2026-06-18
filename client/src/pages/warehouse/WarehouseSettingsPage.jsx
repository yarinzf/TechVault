import { Settings, Bell, Package, Truck } from 'lucide-react';
import { useState } from 'react';

export default function WarehouseSettingsPage() {
  const [minStockDefault, setMinStockDefault] = useState('10');
  const [alertEmail, setAlertEmail]           = useState('warehouse@techvault.co.il');
  const [autoOrder, setAutoOrder]             = useState(false);
  const [lowStockAlert, setLowStockAlert]     = useState(true);
  const [supplierNotify, setSupplierNotify]   = useState(true);

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
            value={minStockDefault}
            onChange={(e) => setMinStockDefault(e.target.value)}
            className="w-32 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
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
            value={alertEmail}
            onChange={(e) => setAlertEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>

        {[
          { label: 'התראה על מלאי נמוך', value: lowStockAlert, set: setLowStockAlert },
          { label: 'התראה על קבלת סחורה מספק', value: supplierNotify, set: setSupplierNotify },
        ].map(({ label, value, set }) => (
          <label key={label} className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-foreground">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={value}
              onClick={() => set((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-[#2563eb]' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
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
            <p className="text-xs text-muted-foreground mt-0.5">ידרוש אישור מנהל לפני שליחה</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoOrder}
            onClick={() => setAutoOrder((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mr-4 ${autoOrder ? 'bg-[#2563eb]' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${autoOrder ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </label>
      </section>

      <button
        type="button"
        className="px-6 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-[#2563eb]/90 transition-colors"
      >
        שמור הגדרות
      </button>
    </div>
  );
}
