import { X, TrendingUp, TrendingDown, Package, RefreshCw, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { productService } from '../../features/products/api/product.service';

const TYPE_META = {
  stock_in:   { label: 'כניסת מלאי',   color: 'text-green-400 bg-green-500/15',  Icon: TrendingUp,    sign: '+' },
  stock_out:  { label: 'יציאת מלאי',   color: 'text-red-400 bg-red-500/15',      Icon: TrendingDown,  sign: '−' },
  adjustment: { label: 'התאמה',         color: 'text-blue-400 bg-blue-500/15',    Icon: RefreshCw,     sign: '±' },
  damaged:    { label: 'פגום',           color: 'text-orange-400 bg-orange-500/15', Icon: AlertTriangle, sign: '−' },
  returned:   { label: 'החזרה למלאי',   color: 'text-teal-400 bg-teal-500/15',    Icon: Package,       sign: '+' },
  // Legacy StockMovement format
  increase:   { label: 'הגדלת מלאי',   color: 'text-green-400 bg-green-500/15',  Icon: TrendingUp,    sign: '+' },
  decrease:   { label: 'הקטנת מלאי',   color: 'text-red-400 bg-red-500/15',      Icon: TrendingDown,  sign: '−' },
};

const REASON_LABELS = {
  restock:          'חידוש מלאי',
  sale:             'מכירה',
  cancellation:     'ביטול הזמנה',
  manual_add:       'הוספה ידנית',
  manual_subtract:  'הפחתה ידנית',
  damaged:          'סחורה פגומה',
  return:           'החזרה',
  refund:           'החזר כספי',
  correction:       'תיקון',
};

function formatRelative(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'עכשיו';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export default function StockHistoryModal({ productId, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    productService.getStockHistory(productId)
      .then(setData)
      .catch((err) => setError(err?.message ?? 'שגיאה בטעינת היסטוריה'))
      .finally(() => setLoading(false));
  }, [productId]);

  const movements = data?.movements ?? [];
  const product   = data?.product;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-foreground font-semibold">היסטוריית תנועות מלאי</h2>
            {product && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {product.name}
                {product.sku && <span className="font-mono text-xs mr-2">· {product.sku}</span>}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="סגור"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="text-center py-10 text-muted-foreground text-sm">טוען היסטוריה...</div>}
          {!loading && error && <div className="text-center py-10 text-red-400 text-sm">{error}</div>}
          {!loading && !error && movements.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">אין תנועות מלאי עבור מוצר זה</div>
          )}

          {!loading && !error && movements.length > 0 && (
            <div className="space-y-2">
              {movements.map((m) => {
                const typeKey = m.type ?? (m.amount !== undefined ? (m.amount > 0 ? 'increase' : 'decrease') : 'adjustment');
                const meta    = TYPE_META[typeKey] ?? TYPE_META.adjustment;
                const { Icon, color, sign, label } = meta;

                // Support both new InventoryMovement (quantity/actor) and legacy StockMovement (amount/userId)
                const qty      = m.quantity ?? Math.abs(m.amount ?? 0);
                const actorObj = m.actor ?? m.userId;
                const actorName = actorObj?.name ?? actorObj?.email ?? 'מערכת';
                const reasonLabel = REASON_LABELS[m.reason] ?? m.reason ?? label;

                return (
                  <div key={m._id} className="p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-md flex-shrink-0 ${color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{reasonLabel}</span>
                          <span className={`text-sm font-bold flex-shrink-0 ${
                            ['stock_in', 'returned', 'increase'].includes(typeKey) ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {sign}{qty}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-1 gap-2">
                          <span className="text-xs text-muted-foreground truncate">{actorName}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{formatRelative(m.createdAt)}</span>
                        </div>

                        {/* Before/After stock snapshot */}
                        {(m.beforeStock != null || m.afterStock != null) && (
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                            <span>{m.beforeStock ?? '?'}</span>
                            <span>→</span>
                            <span className="text-foreground">{m.afterStock ?? '?'}</span>
                            <span className="text-muted-foreground">יח׳</span>
                          </div>
                        )}

                        {m.notes && (
                          <p className="mt-1 text-xs text-muted-foreground italic truncate">{m.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && movements.length > 0 && (
          <div className="px-5 py-3 border-t border-border flex-shrink-0">
            <p className="text-xs text-muted-foreground">
              {movements.length === 50 ? 'מציג 50 תנועות אחרונות' : `${movements.length} תנועות סה״כ`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
