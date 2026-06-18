import { Package, Search, TrendingDown, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { productService } from '../../features/products/api/product.service';
import StockHistoryModal from './StockHistoryModal';

function getStatus(stock, minStock) {
  if (stock === 0) return 'critical';
  if (stock <= minStock) return 'low';
  return 'ok';
}

const statusStyle = {
  critical: 'text-red-400 bg-red-500/10',
  low:      'text-yellow-400 bg-yellow-500/10',
  ok:       'text-green-400 bg-green-500/10',
};
const statusLabel = { critical: 'אזל', low: 'נמוך', ok: 'תקין' };

export default function WarehouseProductsPage() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [historyId, setHistoryId] = useState(null);

  useEffect(() => {
    productService.list({ limit: 100 })
      .then(({ products: data }) => setProducts(data))
      .catch((err) => setError(err?.message ?? 'שגיאה בטעינת מוצרים'))
      .finally(() => setLoading(false));
  }, []);

  const handleStockChange = async (id, type) => {
    setPendingId(id);
    setRowErrors((prev) => ({ ...prev, [id]: null }));
    try {
      const updated = await productService.updateStock(id, type, 1);
      setProducts((prev) =>
        prev.map((p) => (p._id === id ? { ...p, stock: updated.stock } : p))
      );
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: err?.message ?? 'שגיאת עדכון' }));
    } finally {
      setPendingId(null);
    }
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">מוצרים במחסן</h1>
        <p className="text-muted-foreground text-sm mt-1">מצב מלאי לפי מוצר</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 right-3 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="חיפוש לפי שם או SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pr-9 pl-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
        />
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">טוען מוצרים...</div>
      )}

      {!loading && error && (
        <div className="text-center py-12 text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {['SKU', 'מוצר', 'מלאי', 'מינימום', 'קטגוריה', 'סטטוס', 'עדכון'].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">לא נמצאו מוצרים</td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const min = p.minStock ?? 5;
                  const status = getStatus(p.stock, min);
                  const isPending = pendingId === p._id;
                  return (
                    <tr key={p._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.sku ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          {p.name}
                        </div>
                      </td>
                      <td className={`px-4 py-3 font-bold ${p.stock === 0 ? 'text-red-400' : p.stock <= min ? 'text-yellow-400' : 'text-foreground'}`}>
                        {p.stock}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{min}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.category?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[status]}`}>
                          {statusLabel[status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStockChange(p._id, 'decrease')}
                            disabled={p.stock === 0 || isPending}
                            className="w-7 h-7 rounded-md bg-muted hover:bg-red-500/20 text-muted-foreground hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center font-bold text-base leading-none"
                            title="הורד מלאי ב-1"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStockChange(p._id, 'increase')}
                            disabled={isPending}
                            className="w-7 h-7 rounded-md bg-muted hover:bg-green-500/20 text-muted-foreground hover:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center font-bold text-base leading-none"
                            title="הוסף מלאי ב-1"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryId(p._id)}
                            className="w-7 h-7 rounded-md bg-muted hover:bg-[#2563eb]/20 text-muted-foreground hover:text-[#2563eb] transition-colors flex items-center justify-center"
                            title="היסטוריית תנועות"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {rowErrors[p._id] && (
                          <p className="text-xs text-red-400 mt-1 max-w-[120px]">{rowErrors[p._id]}</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
