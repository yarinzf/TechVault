import { useState, useEffect } from 'react';
import { Search, Package, AlertCircle, Loader2, Plus, Minus, Wrench, Clock } from 'lucide-react';
import { warehouseService } from '../../features/warehouse/api/warehouse.service';
import StockHistoryModal from './StockHistoryModal';

function getStatus(stock, minStock) {
  if (stock === 0) return 'critical';
  if (stock <= minStock) return 'low';
  return 'ok';
}

const STATUS_STYLE = {
  critical: 'text-red-400 bg-red-500/10',
  low:      'text-yellow-400 bg-yellow-500/10',
  ok:       'text-green-400 bg-green-500/10',
};
const STATUS_LABEL = { critical: 'אזל', low: 'נמוך', ok: 'תקין' };

// ── Action modal ──────────────────────────────────────────────────────────────
function StockActionModal({ product, action, onClose, onSuccess }) {
  const titles = { restock: 'חידוש מלאי', adjust: 'התאמת מלאי', damaged: 'סחורה פגומה' };

  const [qty,    setQty]    = useState('');
  const [reason, setReason] = useState('manual_add');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const submit = async () => {
    const q = parseInt(qty, 10);
    if (!q || q <= 0) { setErr('הכמות חייבת להיות מספר חיובי'); return; }
    setSaving(true);
    setErr('');
    try {
      let updated;
      if (action === 'restock') {
        updated = await warehouseService.restock(product._id, { quantity: q, notes: notes.trim() || undefined });
      } else if (action === 'adjust') {
        const signedQty = reason === 'manual_subtract' ? -q : q;
        updated = await warehouseService.adjust(product._id, { quantity: signedQty, reason, notes: notes.trim() || undefined });
      } else {
        updated = await warehouseService.markDamaged(product._id, { quantity: q, notes: notes.trim() || undefined });
      }
      const newStock = updated?.stock ?? updated?.product?.stock;
      onSuccess(product._id, newStock);
      onClose();
    } catch (e) {
      setErr(e.message || 'שגיאת עדכון');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-foreground">{titles[action]}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{product.name}</p>
        </div>

        {err && (
          <div className="flex items-center gap-2 p-3 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {err}
          </div>
        )}

        {action === 'adjust' && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">סוג התאמה</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            >
              <option value="manual_add">הוספה ידנית</option>
              <option value="manual_subtract">הפחתה ידנית</option>
              <option value="correction">תיקון ספירה</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">כמות</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            disabled={saving}
            placeholder="0"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
          <p className="text-xs text-muted-foreground">
            מלאי נוכחי: <span className="font-medium text-foreground">{product.stock}</span> יח׳
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">הערות (אופציונלי)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={saving}
            placeholder="הערות לתיעוד..."
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm text-foreground transition-colors disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-sm text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'שומר...' : 'אשר'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WarehouseInventoryPage() {
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('all');
  const [modal,     setModal]     = useState(null);
  const [historyId, setHistoryId] = useState(null);

  useEffect(() => {
    warehouseService.listInventory({ limit: 200 })
      .then(({ products: data }) => setProducts(data ?? []))
      .catch(err => setError(err?.message || 'שגיאה בטעינת מלאי'))
      .finally(() => setLoading(false));
  }, []);

  const handleSuccess = (productId, newStock) => {
    if (newStock == null) return;
    setProducts(prev => prev.map(p => p._id === productId ? { ...p, stock: newStock } : p));
  };

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase());
    const status = getStatus(p.stock, p.minStock ?? 5);
    const matchFilter = filter === 'all' || status === filter;
    return matchSearch && matchFilter;
  });

  const criticalCount = products.filter(p => getStatus(p.stock, p.minStock ?? 5) === 'critical').length;
  const lowCount      = products.filter(p => getStatus(p.stock, p.minStock ?? 5) === 'low').length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ניהול מלאי</h1>
        <p className="text-sm text-muted-foreground mt-1">עדכון מלאי, חידוש סחורה ורישום נזקים</p>
      </div>

      {/* Stock summary chips */}
      {!loading && !error && (
        <div className="flex gap-3 flex-wrap">
          {criticalCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20">
              {criticalCount} מוצרים אזלו מהמלאי
            </span>
          )}
          {lowCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-yellow-400 bg-yellow-500/10 border border-yellow-500/20">
              {lowCount} מוצרים במלאי נמוך
            </span>
          )}
          {!criticalCount && !lowCount && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20">
              כל המוצרים במלאי תקין
            </span>
          )}
        </div>
      )}

      {/* Search + filter row */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute top-2.5 right-3 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="חיפוש לפי שם או SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
          {[
            { key: 'all',      label: 'הכל' },
            { key: 'critical', label: 'אזל' },
            { key: 'low',      label: 'נמוך' },
            { key: 'ok',       label: 'תקין' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
        </div>
      ) : !error && filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">לא נמצאו מוצרים</p>
          <p className="text-sm text-muted-foreground mt-1">נסה לשנות את הסינון או מונחי החיפוש</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[580px]">
            <thead className="bg-muted/40">
              <tr>
                {['SKU', 'מוצר', 'מלאי', 'מינימום', 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} className="text-right px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => {
                const min    = p.minStock ?? 5;
                const status = getStatus(p.stock, min);
                return (
                  <tr key={p._id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                      {p.sku ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate max-w-[180px]">{p.name}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 font-bold ${p.stock === 0 ? 'text-red-400' : p.stock <= min ? 'text-yellow-400' : 'text-foreground'}`}>
                      {p.stock}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{min}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setModal({ product: p, action: 'restock' })}
                          title="חידוש מלאי"
                          className="w-7 h-7 rounded-md bg-muted hover:bg-green-500/20 text-muted-foreground hover:text-green-400 transition-colors flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ product: p, action: 'adjust' })}
                          title="התאמת מלאי"
                          className="w-7 h-7 rounded-md bg-muted hover:bg-blue-500/20 text-muted-foreground hover:text-blue-400 transition-colors flex items-center justify-center"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ product: p, action: 'damaged' })}
                          title="סחורה פגומה"
                          className="w-7 h-7 rounded-md bg-muted hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400 transition-colors flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryId(p._id)}
                          title="היסטוריית תנועות"
                          className="w-7 h-7 rounded-md bg-muted hover:bg-[#2563eb]/20 text-muted-foreground hover:text-[#2563eb] transition-colors flex items-center justify-center"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <StockActionModal
          product={modal.product}
          action={modal.action}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}

      {historyId && (
        <StockHistoryModal
          productId={historyId}
          onClose={() => setHistoryId(null)}
        />
      )}
    </div>
  );
}
